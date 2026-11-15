// Granddquiz logo: a malachite tile with nested chitenge diamonds around a question mark.
// The mark is inline SVG so it needs no extra request and scales crisply.
export function LogoMark({ size = 32, title }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'} focusable="false">
      <rect width="100" height="100" rx="22" fill="#0a3d2f" />
      <path d="M50 6 94 50 50 94 6 50Z" fill="#cf6a1f" />
      <path d="M50 15 85 50 50 85 15 50Z" fill="#f0b429" />
      <path d="M50 24 76 50 50 76 24 50Z" fill="#f6f8f3" />
      <path d="M43 46c0-5 3.2-8 7.3-8 4.2 0 7.200 2.700 7.200 6.600 0 3.600-2.600 5.200-4.700 6.600-1.900 1.300-2.600 2.300-2.600 4.600" fill="none" stroke="#0a3d2f" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50.3 60.2 54.4 64.3 50.3 68.4 46.2 64.3Z" fill="#cf6a1f" />
    </svg>
  );
}

// Mark + name. `size` is the mark height; the text scales with it. Pass `light` on dark backgrounds.
export default function Logo({ size = 32, light = false, as: Tag = 'span' }) {
  return (
    <Tag className={`logo ${light ? 'light' : ''}`} style={{ '--logo': `${size}px` }}>
      <LogoMark size={size} />
      <span className="logo-text">Granddquiz</span>
    </Tag>
  );
}
