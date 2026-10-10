const token = (name) => `var(--${name})`;

export default {
  content: ['./index.html', './spike.html', './src/**/*.{ts,tsx}'],
  // './spike.html' прибирається в Задачі 11 разом із самим файлом спайка.
  theme: {
    extend: {
      // Значення живуть у src/index.css: світла тема — палітра 2 РІЦ,
      // темна — оливкова палітра DID. Компоненти знають лише ролі кольорів.
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        soft: token('soft'),
        fg: token('fg'),
        muted: token('muted'),
        line: token('line'),
        rule: token('rule'),
        accent: token('accent'),
        track: token('track'),
        primary: token('primary'),
        'on-primary': token('on-primary'),
        hero: token('hero'),
        'on-hero': token('on-hero'),
        'hero-action': token('hero-action'),
        'on-hero-action': token('on-hero-action'),
        danger: token('danger'),
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
