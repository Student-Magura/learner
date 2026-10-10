import { Link } from 'react-router-dom';
import { MoonIcon, SunIcon } from './icons';
import { useTheme } from './theme';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Світла тема' : 'Темна тема'}
      title={dark ? 'Світла тема' : 'Темна тема'}
      className="flex h-11 w-11 items-center justify-center text-fg hover:bg-soft"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function Logo() {
  return (
    <span className="text-xl font-extrabold tracking-tight">
      learner<span className="text-accent">.</span>
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="border-b-2 border-rule">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
        <Link to="/" aria-label="Learner — мої курси">
          <Logo />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
