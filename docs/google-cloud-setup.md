# Налаштування Google Cloud

1. `gcloud services enable drive.googleapis.com`
2. Console → APIs & Services → OAuth consent screen:
   - User type: **Internal** (верифікація Google не потрібна)
   - Scopes: `.../auth/drive.readonly`, `.../auth/drive.appdata`
3. Console → Credentials → Create credentials → OAuth client ID:
   - Type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173` і продакшн-origin
   - (redirect URI не потрібен: token flow працює без нього)
4. Скопіювати Client ID у `.env.local`: `VITE_GOOGLE_CLIENT_ID=...`

Якщо в домені увімкнено API access controls, адміністратор мусить
позначити застосунок довіреним — це налаштування адмінки, не код.
