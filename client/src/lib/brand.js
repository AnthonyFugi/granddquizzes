import { API_BASE } from './api.js';

export const ACCENTS = ['#0e7a57', '#cf6a1f', '#3b3fa6', '#b3261e', '#0b6e99', '#7a3e9d', '#2f2f2f', '#c28a00'];

// Black or white, whichever reads better on the given colour
export function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#10231d' : '#fff';
}

export const brandVars = (b) => (b?.accent ? { '--brand': b.accent, '--on-brand': readableOn(b.accent) } : {});
export const logoSrc = (b) => (b?.logoUrl ? `${API_BASE}${b.logoUrl}` : null);
export const hasBrand = (b) => !!(b && (b.orgName || b.logoUrl));

// K150 for kwacha, otherwise "USD 12"
export const money = (amount, currency = 'ZMW') => (currency === 'ZMW' ? `K${Number(amount).toLocaleString()}` : `${currency} ${Number(amount).toLocaleString()}`);

// Shrinks a chosen picture to a small PNG/WebP so it loads fast on mobile data and fits the server limit
export async function shrinkLogo(file, max = 256, limit = 100_000) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WebP picture');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const [type, q] of [['image/png'], ['image/webp', 0.85], ['image/webp', 0.6]]) {
      const data = c.toDataURL(type, q);
      if (data.startsWith(`data:${type}`) && data.length <= limit) return data;
    }
    throw new Error('That picture is too detailed. Try a simpler logo');
  } finally {
    URL.revokeObjectURL(url);
  }
}
