import '@testing-library/jest-dom/vitest';

// jsdom, на відміну від будь-якого реального браузера, взагалі не реалізує
// Service Worker API — властивості немає, а не просто вона неактивна. Тому
// feature-detection `'serviceWorker' in navigator` в useMediaCapability
// завжди повертав би `false` у тестах, хоча в проді майже будь-який браузер
// дає `true` незалежно від того, чи зареєстровано воркер. Підставляємо
// мінімальну заглушку, щоб тестове середовище поводилось як реальний браузер.
//
// controller — непустий об'єкт: заглушка моделює усталений стан (сторінка вже
// під контролем воркера), який типовий для тестів поза VideoPlayer.test.tsx.
// Тести, яким потрібен саме неконтрольований перший запуск і ретрай через
// controllerchange/ready, підміняють navigator.serviceWorker локально (див.
// stubServiceWorker у VideoPlayer.test.tsx).
if (!('serviceWorker' in navigator)) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: {} as ServiceWorker },
    configurable: true,
  });
}

// jsdom не реалізує showModal/close у <dialog>. Мінімальна заміна: перемикає open
// і, як браузер, шле 'close' лише тоді, коли діалог справді був відкритий.
// Фокус-пастку й Esc тут не моделюємо — це робота браузера.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
