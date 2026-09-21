export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

/** Запас перед закінченням токена, щоб не віддати той, що помре в дорозі. */
const EXPIRY_MARGIN_MS = 60_000;

export class AuthRequiredError extends Error {
  constructor(message = 'Потрібен повторний вхід у Google') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

type GisResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type GisClient = { requestAccessToken(opts?: { prompt?: string }): void };

type Waiter = { resolve(t: string): void; reject(e: Error): void };

export type TokenClient = {
  signIn(): Promise<string>;
  getToken(opts?: { force?: boolean }): Promise<string>;
  signOut(): void;
  onChange(cb: (signedIn: boolean) => void): () => void;
};

export function createTokenClient(clientId: string): TokenClient {
  let token: string | null = null;
  let expiresAt = 0;
  // Запит, що зараз летить до GIS, і всі, хто на нього чекає.
  let pending: { waiters: Waiter[] } | null = null;
  // Черга waiter-ів, яким недостатньо результату запиту з `pending` (див.
  // request нижче) — для них одразу після завершення поточного запускається
  // ще один, спільний для всіх, хто встиг доєднатися. `prompt` — який запит
  // цей наступний виклик зробить: 'consent', якщо серед черги є хоч один
  // інтерактивний запит (signIn), інакше '' (тихе force-поновлення).
  let queuedNext: { prompt: string; waiters: Waiter[] } | null = null;
  const listeners = new Set<(signedIn: boolean) => void>();

  const gis: GisClient = (
    globalThis as unknown as {
      google: {
        accounts: {
          oauth2: {
            initTokenClient(cfg: {
              client_id: string;
              scope: string;
              callback: (resp: GisResponse) => void;
            }): GisClient;
          };
        };
      };
    }
  ).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPES,
    callback: (resp) => {
      const waiters = pending?.waiters ?? [];
      const next = queuedNext;
      pending = null;
      queuedNext = null;
      if (!resp.access_token) {
        const err = new AuthRequiredError(resp.error ?? 'Не вдалося отримати токен');
        // Відкликаний/протермінований запит не повинен лишати старий токен
        // «свіжим» у кеші — інакше getToken() ще до години віддаватиме
        // мертвий токен замість негайного переходу на екран входу.
        token = null;
        expiresAt = 0;
        notify(false);
        for (const waiter of waiters) waiter.reject(err);
      } else {
        token = resp.access_token;
        expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
        notify(true);
        for (const waiter of waiters) waiter.resolve(token);
      }
      if (next) startRequest(next.prompt, next.waiters);
    },
  });

  function notify(signedIn: boolean) {
    for (const cb of listeners) cb(signedIn);
  }

  function startRequest(prompt: string, waiters: Waiter[]) {
    pending = { waiters };
    gis.requestAccessToken({ prompt });
  }

  function request(prompt: string, requireFreshStart = false): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };
      if (!pending) {
        startRequest(prompt, [waiter]);
        return;
      }
      if (!requireFreshStart) {
        // Кілька одночасних викликів об'єднуються в один запит до GIS:
        // у GIS єдиний колбек, паралельні requestAccessToken переплутали б його.
        pending.waiters.push(waiter);
        return;
      }
      // requireFreshStart (force або signIn): викликач не може задовольнитися
      // токеном із запиту, що вже летить, — той міг стартувати до цього
      // виклику (наприклад, фонове тихе поновлення) і повернути саме той
      // токен, який щойно отримав 401 від Drive, або взагалі не показати
      // діалог згоди, якого чекає signIn(). Черга запускає свіжий запит
      // одразу після завершення поточного; усі, хто прийшов з
      // requireFreshStart, поки той запит летить, розділяють один спільний
      // наступний запит.
      if (!queuedNext) {
        queuedNext = { prompt, waiters: [waiter] };
      } else {
        queuedNext.waiters.push(waiter);
        // 'consent' не можна загубити: якщо інтерактивний виклик доєднався
        // до черги, весь спільний наступний запит має лишитися
        // інтерактивним — навіть якщо тихий force-виклик доєднався раніше
        // й вихідно встановив тут ''. Зворотного пониження нема: 'consent',
        // раз потрапивши в чергу, звідти вже не зникає.
        if (prompt === 'consent') queuedNext.prompt = 'consent';
      }
    });
  }

  function isFresh(): boolean {
    return token !== null && Date.now() < expiresAt - EXPIRY_MARGIN_MS;
  }

  return {
    // requireFreshStart: true — signIn() завжди мусить дійти до реального
    // діалогу згоди. Якщо просто приєднатися до силентного запиту, що вже
    // летить, і той впаде з interaction_required (а це якраз типовий
    // випадок, коли згода і потрібна), клік користувача мовчки відхилиться
    // й вікно згоди так і не покажеться.
    signIn: () => request('consent', true),
    getToken: async ({ force = false } = {}) => {
      // force потрібен, коли Drive відповів 401 на токен, що за годинником ще свіжий.
      if (!force && isFresh()) return token!;
      // prompt: '' — тихе поновлення без вікна, якщо сесія Google ще жива.
      // force передається як requireFreshStart, щоб гарантувати токен,
      // отриманий уже після цього виклику (див. request).
      return request('', force);
    },
    signOut: () => {
      token = null;
      expiresAt = 0;
      notify(false);
    },
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
