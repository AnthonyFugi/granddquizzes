import { logoSrc, readableOn, hasBrand } from './brand.js';

// Draws the whole poster (chitenge bands, logo, title, QR, code tiles) onto one picture, so the saved PNG
// looks like the printed poster and carries the organiser's branding.
const W = 1080;
const INK = '#10231d';
const SOFT = '#496057';
const COPPER = '#cf6a1f';
const MALACHITE = '#0e7a57';
const DEEP = '#0a3d2f';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function band(ctx, y, h) {
  const s = h / 20;
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, y, W, h);
  for (let x = 0; x < W + 40 * s; x += 40 * s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = COPPER;
    ctx.beginPath(); ctx.moveTo(20, 2); ctx.lineTo(34, 10); ctx.lineTo(20, 18); ctx.lineTo(6, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0b429';
    ctx.beginPath(); ctx.moveTo(20, 6); ctx.lineTo(28, 10); ctx.lineTo(20, 14); ctx.lineTo(12, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eef2ec';
    ctx.beginPath(); ctx.arc(0, 10, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(40, 10, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Breaks text into lines no wider than maxWidth (at most maxLines; the last line is trimmed with ...)
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '...';
    return kept;
  }
  return lines;
}

export async function posterPng({ event, code, qrCanvas, host }) {
  try { await document.fonts?.ready; } catch { /* fonts are a nicety */ }
  const b = event.branding || {};
  const branded = hasBrand(b);
  const accent = b.accent || null;
  const display = "'Unbounded', 'Trebuchet MS', system-ui, sans-serif";
  const body = "'Instrument Sans', system-ui, sans-serif";

  const orgLogo = branded && b.logoUrl ? await loadImage(logoSrc(b)) : null;
  const mark = !branded ? await loadImage('/logo-512.png') : null;

  // Draw on a tall sheet first, then cut it to the height the content really needs
  const c = document.createElement('canvas');
  c.width = W; c.height = 2400;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, 2400);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let y = 150;

  // Brand: organiser logo and name, or the Granddquiz mark
  if (branded) {
    let nameW = 0;
    const name = b.orgName || '';
    ctx.font = `700 46px ${display}`;
    if (name) nameW = Math.min(ctx.measureText(name).width + 64, 700);
    const lh = orgLogo ? 120 : 0;
    const lw = orgLogo ? Math.min(300, (orgLogo.width / orgLogo.height) * lh) : 0;
    const total = lw + (lw && nameW ? 28 : 0) + nameW;
    let x = (W - total) / 2;
    if (orgLogo) { ctx.drawImage(orgLogo, x, y - 60, lw, lh); x += lw + 28; }
    if (name) {
      ctx.fillStyle = accent || MALACHITE;
      roundRect(ctx, x, y - 42, nameW, 84, 42); ctx.fill();
      ctx.fillStyle = accent ? readableOn(accent) : '#fff';
      ctx.font = `700 40px ${display}`;
      ctx.fillText(wrap(ctx, name, nameW - 40, 1)[0], x + nameW / 2, y + 14);
    }
  } else {
    ctx.font = `700 54px ${display}`;
    const t = 'Granddquiz';
    const tw = ctx.measureText(t).width;
    const size = 110;
    const total = size + 24 + tw;
    const x = (W - total) / 2;
    if (mark) ctx.drawImage(mark, x, y - 58, size, size);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(t, x + size + 24, y + 20);
    ctx.textAlign = 'center';
  }

  // Title (up to two lines) and tagline
  y += 130;
  ctx.fillStyle = INK;
  ctx.font = `700 74px ${display}`;
  const titleLines = wrap(ctx, event.title || 'Quiz night', W - 160, 2);
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 88));
  y += (titleLines.length - 1) * 88;
  if (b.tagline) {
    y += 62;
    ctx.fillStyle = SOFT;
    ctx.font = `500 36px ${body}`;
    ctx.fillText(wrap(ctx, b.tagline, W - 200, 1)[0], W / 2, y);
  }

  // Scan to play
  y += 110;
  ctx.fillStyle = COPPER;
  ctx.font = `700 78px ${display}`;
  ctx.fillText('Scan to play', W / 2, y);

  // QR in a rounded frame
  y += 40;
  const qr = 560;
  const pad = 30;
  const border = 12;
  const fw = qr + (pad + border) * 2;
  const fx = (W - fw) / 2;
  ctx.fillStyle = accent || INK;
  roundRect(ctx, fx, y, fw, fw, 40); ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(ctx, fx + border, y + border, fw - border * 2, fw - border * 2, 30); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, fx + border + pad, y + border + pad, qr, qr);
  ctx.imageSmoothingEnabled = true;
  y += fw;

  // Code
  y += 70;
  ctx.fillStyle = INK;
  ctx.font = `500 34px ${body}`;
  ctx.fillText(`or open ${host} and enter`, W / 2, y);
  y += 36;
  const n = code.length;
  const tw = 128;
  const gap = 16;
  const tx0 = (W - (n * tw + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    const x = tx0 + i * (tw + gap);
    ctx.fillStyle = '#fff';
    roundRect(ctx, x, y, tw, 150, 22); ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `700 96px ${display}`;
    ctx.fillText(code[i], x + tw / 2, y + 106);
  }
  y += 150 + 54;

  ctx.fillStyle = SOFT;
  ctx.font = `500 30px ${body}`;
  ctx.fillText('No account. No download. Pick a nickname and play, alone or with a team.', W / 2, y);

  // Prizes and sponsors
  if (event.prizes?.length) {
    y += 56;
    ctx.fillStyle = INK;
    ctx.font = `600 32px ${body}`;
    const ord = (p) => (p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`);
    const line = event.prizes.slice(0, 3).map((p) => `${ord(p.place)} ${p.label}`).join('   ·   ');
    ctx.fillText(wrap(ctx, line, W - 120, 1)[0], W / 2, y);
  }
  if (b.sponsors?.length) {
    y += 56;
    ctx.fillStyle = INK;
    ctx.font = `700 30px ${display}`;
    ctx.fillText(wrap(ctx, `With thanks to  ${b.sponsors.join('  ·  ')}`, W - 120, 1)[0], W / 2, y);
  }

  // Cut to size, add the bands and the footer
  const H = Math.max(1500, Math.round(y + 150));
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.fillStyle = '#fff';
  o.fillRect(0, 0, W, H);
  o.drawImage(c, 0, 0);
  band(o, 0, 48);
  band(o, H - 48, 48);
  const foot = branded ? (b.poweredBy === false ? '' : 'Powered by Granddquiz') : 'granddquiz';
  if (foot) {
    o.fillStyle = SOFT;
    o.font = `500 28px ${body}`;
    o.textAlign = 'center';
    o.fillText(foot, W / 2, H - 48 - 26);
  }
  return out.toDataURL('image/png');
}
