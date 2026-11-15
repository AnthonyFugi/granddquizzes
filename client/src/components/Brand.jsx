import { brandVars, hasBrand, logoSrc, readableOn } from '../lib/brand.js';
import Logo from './Logo.jsx';

// The organiser's mark: logo picture and name, on their colour.
export function OrgMark({ branding, size = 52, light = false }) {
  const src = logoSrc(branding);
  const accent = branding.accent;
  return (
    <span className="org-mark" style={{ '--org-size': `${size}px` }}>
      {src && <span className="org-logo"><img src={src} alt="" /></span>}
      {branding.orgName && (
        <span className="org-name" style={accent ? { background: accent, color: readableOn(accent) } : light ? { background: 'rgba(255,255,255,0.14)', color: '#fff' } : undefined}>{branding.orgName}</span>
      )}
    </span>
  );
}

export function PoweredBy({ light = false }) {
  return (
    <span className="powered">
      <span>Powered by</span>
      <Logo size={22} light={light} />
    </span>
  );
}

// Big screen header: the organiser leads when they have branding; the Granddquiz mark steps back to a small badge.
export function StageHeader({ branding = {} }) {
  const branded = hasBrand(branding);
  return (
    <header className="stage-head" style={brandVars(branding)}>
      {branded ? <OrgMark branding={branding} size={60} light /> : <Logo size={52} light />}
      {branded && branding.poweredBy !== false && <PoweredBy light />}
      {branded && branding.tagline && <span className="tagline">{branding.tagline}</span>}
    </header>
  );
}

export function SponsorStrip({ branding = {}, light = false }) {
  const list = branding.sponsors || [];
  if (!list.length) return null;
  return (
    <footer className={`sponsors ${light ? 'on-dark' : ''}`} aria-label="Sponsors">
      <span className="small">With thanks to</span>
      {list.map((s) => <span key={s} className="sponsor">{s}</span>)}
    </footer>
  );
}
