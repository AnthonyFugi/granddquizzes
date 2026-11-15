import { useState } from 'react';
import { ACCENTS, readableOn, shrinkLogo } from '../lib/brand.js';

export const emptyBranding = { orgName: '', tagline: '', accent: '', sponsors: ['', '', ''], logo: undefined };

export const brandingFrom = (b) => ({
  orgName: b?.orgName || '', tagline: b?.tagline || '', accent: b?.accent || '',
  sponsors: [...(b?.sponsors || []), '', '', ''].slice(0, 3), logo: undefined, hadLogo: !!b?.hasLogo,
});

// What the server expects. logo: undefined = keep, '' = remove, data URL = replace.
export const brandingBody = (v) => {
  const { hadLogo, ...rest } = v;
  return { ...rest, sponsors: v.sponsors.map((s) => s.trim()).filter(Boolean) };
};

export default function BrandingForm({ value, onChange, entitlements }) {
  const [err, setErr] = useState('');
  const set = (patch) => onChange({ ...value, ...patch });
  const slots = entitlements?.sponsors ?? 3;
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { set({ logo: await shrinkLogo(file) }); setErr(''); } catch (x) { setErr(x.message); }
  };
  const showLogo = value.logo || (value.logo === undefined && value.hadLogo);
  return (
    <div className="brand-form">
      {entitlements && !entitlements.branding && (
        <p className="notice">Your look is saved, but guests only see it once this event is on a paid plan. Free events show the Granddquiz badge.</p>
      )}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field grow"><label htmlFor="bn">Your name or venue</label><input id="bn" value={value.orgName} maxLength={40} onChange={(e) => set({ orgName: e.target.value })} placeholder="Hot Spot Lounge" /></div>
        <div className="field grow"><label htmlFor="bt">Tagline (optional)</label><input id="bt" value={value.tagline} maxLength={80} onChange={(e) => set({ tagline: e.target.value })} placeholder="Thursday quiz night" /></div>
      </div>
      <div className="field">
        <span className="label">Colour</span>
        <div className="row" role="group" aria-label="Brand colour">
          <button type="button" className={`swatch none ${!value.accent ? 'on' : ''}`} aria-pressed={!value.accent} onClick={() => set({ accent: '' })} title="Default">Default</button>
          {ACCENTS.map((c) => (
            <button type="button" key={c} className={`swatch ${value.accent === c ? 'on' : ''}`} style={{ background: c, color: readableOn(c) }} aria-pressed={value.accent === c} aria-label={`Colour ${c}`} onClick={() => set({ accent: c })}>{value.accent === c ? '✓' : ''}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Logo (optional)</span>
        <div className="row">
          {value.logo && <img className="logo-preview" src={value.logo} alt="Logo preview" />}
          <label className="btn secondary small" style={{ cursor: 'pointer' }}>
            {showLogo ? 'Replace logo' : 'Choose a logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} style={{ display: 'none' }} />
          </label>
          {showLogo && <button type="button" className="btn quiet small" onClick={() => set({ logo: '', hadLogo: false })}>Remove</button>}
        </div>
        {!value.logo && value.hadLogo && value.logo === undefined && <span className="muted small">A logo is saved for this event.</span>}
        <span className="muted small">PNG, JPG or WebP. It is shrunk automatically so it loads quickly on phones.</span>
        {err && <span className="error" role="alert">{err}</span>}
      </div>
      <div className="field">
        <span className="label">Sponsors (shown on the big screen)</span>
        {value.sponsors.map((s, i) => (
          <input key={i} aria-label={`Sponsor ${i + 1}`} value={s} maxLength={40} placeholder={`Sponsor ${i + 1}`} onChange={(e) => set({ sponsors: value.sponsors.map((x, j) => (j === i ? e.target.value : x)) })} />
        ))}
        {entitlements && slots < 3 && <span className="muted small">Your plan shows {slots === 0 ? 'no' : `up to ${slots}`} sponsor{slots === 1 ? '' : 's'}.</span>}
      </div>
    </div>
  );
}
