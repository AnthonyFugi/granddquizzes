import nodemailer from 'nodemailer';

// Sends email through Brevo. Prefers Brevo's web API (works on hosts that block SMTP ports, like Render's free plan),
// and falls back to SMTP. With neither configured, sending is skipped and the app works as before.
// Settings come only from environment variables; no key lives in the code.
const env = () => process.env;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mailEnabled() {
  return !!(env().BREVO_API_KEY || (env().SMTP_HOST && env().SMTP_USER && env().SMTP_PASS));
}

function sender() {
  const raw = env().EMAIL_FROM || 'Granddquiz <hello@fugipay.com>';
  const m = /^(.*)<(.+)>$/.exec(raw.trim());
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { name: 'Granddquiz', email: raw.trim() };
}

export function adminAddress() {
  return env().NOTIFY_EMAIL || env().ADMIN_EMAIL || '';
}

/** Returns true when sent. Never throws: a mail problem must not break sign-up, contact or approval. */
export async function sendMail({ to, subject, text, replyTo }) {
  if (!to || !mailEnabled()) return false;
  const from = sender();
  const html = `<div style="font:15px/1.55 Arial,sans-serif;color:#10231d;white-space:pre-wrap">${esc(text)}</div>`;
  try {
    if (env().BREVO_API_KEY) {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env().BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: from, to: [{ email: to }], subject, textContent: text, htmlContent: html, ...(replyTo ? { replyTo: { email: replyTo } } : {}) }),
      });
      if (!res.ok) throw new Error(`Brevo API ${res.status} ${(await res.text()).slice(0, 200)}`);
      return true;
    }
    const t = nodemailer.createTransport({
      host: env().SMTP_HOST,
      port: Number(env().SMTP_PORT) || 587,
      secure: env().SMTP_SECURE === 'true',
      auth: { user: env().SMTP_USER, pass: env().SMTP_PASS },
    });
    await t.sendMail({ from: `"${from.name}" <${from.email}>`, to, subject, text, html, replyTo });
    return true;
  } catch (e) {
    console.error('Email not sent:', e.message);
    return false;
  }
}

/** Fire and forget */
export const notify = (opts) => { sendMail(opts).catch(() => {}); };
