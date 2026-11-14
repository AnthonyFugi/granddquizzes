import { useId } from 'react';

// Chitenge-style repeating band: copper diamonds with marigold centres on deep malachite.
export default function Band({ height = 20 }) {
  const id = 'band' + useId().replace(/[^a-z0-9]/gi, '');
  return (
    <svg className="band" height={height} role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id} width="40" height="20" patternUnits="userSpaceOnUse" patternTransform={`scale(${height / 20})`}>
          <rect width="40" height="20" fill="#0a3d2f" />
          <path d="M20 2 L34 10 L20 18 L6 10Z" fill="#cf6a1f" />
          <path d="M20 6 L28 10 L20 14 L12 10Z" fill="#f0b429" />
          <circle cx="0" cy="10" r="2.4" fill="#eef2ec" />
          <circle cx="40" cy="10" r="2.4" fill="#eef2ec" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
