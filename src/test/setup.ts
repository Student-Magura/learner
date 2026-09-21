import '@testing-library/jest-dom/vitest';

// jsdom, на відміну від будь-якого реального браузера, взагалі не реалізує
// Service Worker API — властивості немає, а не просто вона неактивна. Тому
// feature-detection `'serviceWorker' in navigator` в useMediaCapability
// завжди повертав би `false` у тестах, хоча в проді майже будь-який браузер
// дає `true` незалежно від того, чи зареєстровано воркер. Підставляємо
// мінімальну заглушку, щоб тестове середовище поводилось як реальний браузер.
if (!('serviceWorker' in navigator)) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: null },
    configurable: true,
  });
}
