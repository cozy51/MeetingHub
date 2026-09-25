export default function Logo({ size = 35 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="mh-bg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f8dff" />
          <stop offset=".55" stopColor="#2359d6" />
          <stop offset="1" stopColor="#3b2fb0" />
        </linearGradient>
        <linearGradient id="mh-gloss" x1="32" y1="0" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#mh-bg)" />
      <rect width="64" height="64" rx="15" fill="url(#mh-gloss)" />
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeOpacity=".6">
        <path d="M41 42.72A14 14 0 0 1 23 42.72" />
        <path d="M18.21 34.43A14 14 0 0 1 27.21 18.84" />
        <path d="M36.79 18.84A14 14 0 0 1 45.79 34.43" />
      </g>
      <g fill="#fff">
        <circle cx="32" cy="18" r="4.5" />
        <circle cx="44.12" cy="39" r="4.5" />
        <circle cx="19.88" cy="39" r="4.5" />
      </g>
      <circle cx="32" cy="32" r="3.5" fill="#ffd166" />
    </svg>
  );
}
