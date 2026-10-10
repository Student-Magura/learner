type IconProps = { className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'square' as const,
  'aria-hidden': true,
  viewBox: '0 0 24 24',
};

export const CheckIcon = ({ className = 'h-3.5 w-3.5' }: IconProps) => (
  <svg {...stroke} strokeWidth={3} className={className}>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export const PlayIcon = ({ className = 'h-3 w-3' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M7 4l13 8-13 8z" />
  </svg>
);

export const ArrowLeftIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg {...stroke} className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const ArrowRightIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg {...stroke} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const SunIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...stroke} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...stroke} className={className}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);
