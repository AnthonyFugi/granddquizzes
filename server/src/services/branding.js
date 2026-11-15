import { UserError } from './errors.js';

// Colours a quiz master can pick for their event. Free text colours are accepted too if they are a plain #rrggbb.
export const ACCENTS = ['#0e7a57', '#cf6a1f', '#3b3fa6', '#b3261e', '#0b6e99', '#7a3e9d', '#2f2f2f', '#c28a00'];
const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export const MAX_LOGO_CHARS = 120_000; // roughly 90 KB of image once decoded

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Validates what a quiz master typed. Throws UserError on a bad logo; trims everything else quietly. */
export function sanitizeBranding(input) {
  const b = input && typeof input === 'object' ? input : {};
  const out = {
    orgName: text(b.orgName, 40),
    tagline: text(b.tagline, 80),
    accent: HEX.test(String(b.accent || '')) ? String(b.accent).toLowerCase() : '',
    sponsors: (Array.isArray(b.sponsors) ? b.sponsors : []).map((s) => text(s, 40)).filter(Boolean).slice(0, 3),
  };
  if (b.logo === '' || b.logo === null) {
    out.logo = '';
  } else if (typeof b.logo === 'string') {
    if (b.logo.length > MAX_LOGO_CHARS) throw new UserError('That logo is too large. Use a small PNG or JPG (under 90 KB)');
    if (!LOGO.test(b.logo)) throw new UserError('The logo must be a PNG, JPG or WebP image');
    out.logo = b.logo;
  }
  return out;
}

/** What may be shown to guests, given the plan. The logo itself is served from its own URL, never inside quiz state. */
export function publicBranding(branding, ent, code) {
  const poweredBy = !ent.whiteLabel;
  if (!ent.branding || !branding) return { poweredBy };
  const hasLogo = !!branding.logo;
  const out = { poweredBy };
  if (branding.orgName) out.orgName = branding.orgName;
  if (branding.tagline) out.tagline = branding.tagline;
  if (branding.accent) out.accent = branding.accent;
  const sponsors = (branding.sponsors || []).slice(0, ent.sponsors);
  if (sponsors.length) out.sponsors = sponsors;
  if (hasLogo) out.logoUrl = `/api/events/by-code/${code}/logo`;
  return out;
}

export function decodeLogo(dataUrl) {
  const m = LOGO.exec(dataUrl || '');
  if (!m) return null;
  return { type: `image/${m[1]}`, bytes: Buffer.from(m[2], 'base64') };
}
