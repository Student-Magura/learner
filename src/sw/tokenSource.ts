/**
 * Токен доступу для Service Worker. Браузер будь-коли зупиняє простійний
 * воркер і перезапускає його з нуля, тож змінна в памʼяті — лише кеш: коли
 * він порожній, токен береться в сторінки, яка й є джерелом правди.
 */
export type TokenSource = {
  /** Кешований токен або, якщо кеш порожній, токен від сторінки; null — не вдалося. */
  get(clientId: string): Promise<string | null>;
  /** Drive відкинув `rejected` (401): береться свіжий токен із force. */
  renew(rejected: string, clientId: string): Promise<string | null>;
  /** Сторінка сама надіслала токен — просто кешуємо. */
  set(token: string): void;
};

export type TokenSourceOptions = {
  /** Попросити токен у сторінки; `clientId` — хто зробив запит (може бути ''). */
  requestFromClient(force: boolean, clientId: string): Promise<string | null>;
  /** Скільки чекаємо на відповідь сторінки, перш ніж здатися з null. */
  timeoutMs: number;
};

export function createTokenSource({ requestFromClient, timeoutMs }: TokenSourceOptions): TokenSource {
  let cached: string | null = null;
  // Один запит до сторінки на всіх: відео на старті й при перемотуванні шле
  // кілька Range-запитів майже одночасно.
  let inflight: { force: boolean; promise: Promise<string | null> } | null = null;

  function acquire(force: boolean, clientId: string): Promise<string | null> {
    // Вимушений запит не може задовольнитися невимушеним: той міг повернути
    // саме той токен, який Drive щойно відкинув.
    if (inflight && (inflight.force || !force)) return inflight.promise;

    const entry = {
      force,
      promise: withTimeout(requestFromClient(force, clientId), timeoutMs)
        .catch(() => null)
        .then((token) => {
          if (inflight === entry) inflight = null;
          if (token) cached = token;
          return token;
        }),
    };
    inflight = entry;
    return entry.promise;
  }

  return {
    get(clientId) {
      return cached ? Promise.resolve(cached) : acquire(false, clientId);
    },
    renew(rejected, clientId) {
      if (cached === rejected) cached = null;
      // Хтось інший уже поновив токен, поки цей запит летів зі старим.
      if (cached) return Promise.resolve(cached);
      return acquire(true, clientId);
    },
    set(token) {
      cached = token;
    },
  };
}

function withTimeout(promise: Promise<string | null>, ms: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
