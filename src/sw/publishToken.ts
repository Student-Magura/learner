/**
 * Воркер не має доступу до GIS, тому токен йому надсилає сторінка —
 * при вході й при кожному тихому поновленні.
 */
export function publishTokenToServiceWorker(token: string): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: 'SET_TOKEN', token });
}
