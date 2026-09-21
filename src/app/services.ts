import { createTokenClient } from '../auth/tokenClient';
import { createDriveApi } from '../drive/api';
import { openLearnerDb } from '../storage/db';
import { createSyncEngine } from '../storage/syncEngine';
import { publishTokenToServiceWorker } from '../sw/publishToken';
import type { TokenClient } from '../auth/tokenClient';
import type { StoreDeps } from '../store/useStore';

export async function createServices(): Promise<StoreDeps & { tokenClient: TokenClient }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('Не задано VITE_GOOGLE_CLIENT_ID — див. docs/google-cloud-setup.md');
  }

  const tokenClient = createTokenClient(clientId);

  // Воркер не має доступу до GIS, тому щоразу, коли токен проходить через нас,
  // пересилаємо його — і при першому вході, і при кожному тихому поновленні.
  const getToken = async () => {
    const token = await tokenClient.getToken();
    publishTokenToServiceWorker(token);
    return token;
  };

  // publishTokenToServiceWorker no-оп'иться, поки navigator.serviceWorker.controller
  // ще null — тобто на найпершому завантаженні сторінки, до того як воркер узяв
  // контроль. Тому додатково підписуємось на controllerchange і перепубліковуємо
  // вже отриманий токен щойно контроль перейде до воркера — без цього перше
  // відео могло б лишитися без токена, поки не спрацює ретрай у плеєрі.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      void tokenClient
        .getToken()
        .then((token) => publishTokenToServiceWorker(token))
        .catch(() => {
          // Відсутність токена тут не критична: користувач ще не увійшов, або
          // потрібна інтерактивна дія — це не має ламати запуск застосунку.
        });
    });
  }

  const db = await openLearnerDb();
  const api = createDriveApi(getToken);
  const sync = createSyncEngine(db, api);

  return { db, api, sync, tokenClient };
}
