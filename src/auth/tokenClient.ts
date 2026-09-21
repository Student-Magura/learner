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

export type TokenClient = {
  signIn(): Promise<string>;
  getToken(opts?: { force?: boolean }): Promise<string>;
  signOut(): void;
  onChange(cb: (signedIn: boolean) => void): () => void;
};

export function createTokenClient(clientId: string): TokenClient {
  let token: string | null = null;
  let expiresAt = 0;
  let pending: { resolve(t: string): void; reject(e: Error): void } | null = null;
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
      const waiting = pending;
      pending = null;
      if (!resp.access_token) {
        waiting?.reject(new AuthRequiredError(resp.error ?? 'Не вдалося отримати токен'));
        return;
      }
      token = resp.access_token;
      expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
      notify(true);
      waiting?.resolve(token);
    },
  });

  function notify(signedIn: boolean) {
    for (const cb of listeners) cb(signedIn);
  }

  function request(prompt: string): Promise<string> {
    // Один запит за раз: GIS має єдиний колбек, паралельні виклики його переплутають.
    if (pending) return Promise.reject(new Error('Запит токена вже виконується'));
    return new Promise<string>((resolve, reject) => {
      pending = { resolve, reject };
      gis.requestAccessToken({ prompt });
    });
  }

  function isFresh(): boolean {
    return token !== null && Date.now() < expiresAt - EXPIRY_MARGIN_MS;
  }

  return {
    signIn: () => request('consent'),
    getToken: async ({ force = false } = {}) => {
      // force потрібен, коли Drive відповів 401 на токен, що за годинником ще свіжий.
      if (!force && isFresh()) return token!;
      // prompt: '' — тихе поновлення без вікна, якщо сесія Google ще жива.
      return request('');
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
