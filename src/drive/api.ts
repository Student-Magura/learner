const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const FILE_FIELDS = 'id,name,mimeType,trashed,videoMediaMetadata(durationMillis)';

/** Без цих двох параметрів Drive не повертає елементи зі Shared Drives і «Shared with me». */
const SHARED_DRIVES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' };

/** 403-причини, які означають «спробуй пізніше», а не «тобі не можна». */
const RETRIABLE_403 = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
]);

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  trashed: boolean;
  /** Секунди. Переведено тут, на межі: мілісекунди далі в код не проходять. */
  durationSec: number | null;
};

export type AppDataPayload = { content: unknown; modifiedTime: string };

export type DriveApi = {
  listFolder(folderId: string): Promise<DriveFile[]>;
  getFile(fileId: string): Promise<DriveFile>;
  /** Метадані без завантаження вмісту — щоб не тягнути файл, який не змінився. */
  statAppData(name: string): Promise<{ id: string; modifiedTime: string } | null>;
  readAppData(name: string): Promise<AppDataPayload | null>;
  writeAppData(name: string, content: unknown): Promise<{ modifiedTime: string }>;
};

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

type RawFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  trashed?: boolean;
  videoMediaMetadata?: { durationMillis?: string };
};

function toDriveFile(raw: RawFile): DriveFile {
  const millis = raw.videoMediaMetadata?.durationMillis;
  const parsed = millis === undefined ? NaN : Number(millis);
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    mimeType: raw.mimeType ?? '',
    trashed: raw.trashed ?? false,
    durationSec: Number.isFinite(parsed) ? parsed / 1000 : null,
  };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createDriveApi(
  getToken: (opts?: { force?: boolean }) => Promise<string>,
  options: { sleep?: (ms: number) => Promise<void>; maxRetries?: number } = {},
): DriveApi {
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 4;

  async function shouldRetry(response: Response): Promise<boolean> {
    if (response.status === 429 || response.status >= 500) return true;
    if (response.status !== 403) return false;
    // 403 буває і «ліміт», і «немає прав» — повторювати можна лише перше.
    try {
      const body = (await response.clone().json()) as {
        error?: { errors?: Array<{ reason?: string }> };
      };
      const reason = body.error?.errors?.[0]?.reason;
      return reason !== undefined && RETRIABLE_403.has(reason);
    } catch {
      return false;
    }
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let lastStatus = 0;
    let lastText = '';
    let force = false;
    let refreshedOnce = false;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const token = await getToken(force ? { force: true } : undefined);
      force = false;

      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(url, { ...init, headers });
      if (response.ok) return response;

      lastStatus = response.status;
      lastText = response.statusText;

      // Токен могли відкликати раніше строку: одна спроба тихого поновлення,
      // далі вирішує застосунок — показати екран входу.
      if (response.status === 401 && !refreshedOnce) {
        refreshedOnce = true;
        force = true;
        continue;
      }

      if (!(await shouldRetry(response))) break;
      if (attempt === maxRetries) break;

      // Експоненційний backoff із jitter, щоб кілька вкладок не били в такт.
      await sleep(2 ** attempt * 500 + Math.random() * 250);
    }

    throw new DriveError(lastStatus, `Drive API ${lastStatus} ${lastText}`.trim());
  }

  function query(params: Record<string, string>): string {
    return new URLSearchParams(params).toString();
  }

  return {
    async listFolder(folderId) {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;

      do {
        const url = `${API}?${query({
          ...SHARED_DRIVES,
          q: `'${folderId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: '1000',
          ...(pageToken ? { pageToken } : {}),
        })}`;

        const body = (await (await request(url)).json()) as {
          files?: RawFile[];
          nextPageToken?: string;
        };
        for (const raw of body.files ?? []) files.push(toDriveFile(raw));
        pageToken = body.nextPageToken;
      } while (pageToken);

      return files;
    },

    async getFile(fileId) {
      const url = `${API}/${fileId}?${query({ ...SHARED_DRIVES, fields: FILE_FIELDS })}`;
      return toDriveFile((await (await request(url)).json()) as RawFile);
    },

    statAppData(name) {
      return findAppDataFile(name);
    },

    async readAppData(name) {
      const found = await findAppDataFile(name);
      if (!found) return null;

      const url = `${API}/${found.id}?${query({ alt: 'media' })}`;
      const content = (await (await request(url)).json()) as unknown;
      return { content, modifiedTime: found.modifiedTime };
    },

    async writeAppData(name, content) {
      const found = await findAppDataFile(name);
      const body = JSON.stringify(content);

      if (found) {
        const url = `${UPLOAD}/${found.id}?${query({ uploadType: 'media', fields: 'modifiedTime' })}`;
        const updated = (await (
          await request(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        ).json()) as { modifiedTime?: string };
        return { modifiedTime: updated.modifiedTime ?? new Date().toISOString() };
      }

      // Multipart: перша частина — метадані з батьківською appDataFolder, друга — вміст.
      const boundary = 'learner-boundary';
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${body}\r\n--${boundary}--`;

      const url = `${UPLOAD}?${query({ uploadType: 'multipart', fields: 'modifiedTime' })}`;
      const created = (await (
        await request(url, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipart,
        })
      ).json()) as { modifiedTime?: string };
      return { modifiedTime: created.modifiedTime ?? new Date().toISOString() };
    },
  };

  async function findAppDataFile(
    name: string,
  ): Promise<{ id: string; modifiedTime: string } | null> {
    const url = `${API}?${query({
      spaces: 'appDataFolder',
      q: `name = '${name}' and trashed = false`,
      fields: 'files(id,modifiedTime)',
      pageSize: '1',
    })}`;
    const body = (await (await request(url)).json()) as {
      files?: Array<{ id?: string; modifiedTime?: string }>;
    };
    const file = body.files?.[0];
    if (!file?.id) return null;
    return { id: file.id, modifiedTime: file.modifiedTime ?? new Date().toISOString() };
  }
}
