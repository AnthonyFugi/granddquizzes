import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api.js';
import { brandVars, hasBrand, logoSrc, readableOn } from '../lib/brand.js';
import { CodeTiles } from '../components/Code.jsx';
import Logo from '../components/Logo.jsx';
import Band from '../components/Band.jsx';
import { PoweredBy } from '../components/Brand.jsx';

// A4 poster with the join QR: print it, or save it as a PDF, and stick it on tables and walls.
export default function Poster() {
  const code = useParams().code.toUpperCase();
  const [ev, setEv] = useState(null);
  const [err, setErr] = useState('');
  const big = useRef(null);
  useEffect(() => { api(`/events/by-code/${code}`).then(setEv).catch((e) => setErr(e.message)); }, [code]);
  const url = `${window.location.origin}/?code=${code}`;

  const save = () => {
    const a = document.createElement('a');
    a.href = big.current.toDataURL('image/png');
    a.download = `granddquiz-${code}-qr.png`;
    a.click();
  };

  if (err) return <main className="page"><h1>No poster for that code</h1><p className="error" role="alert">{err}</p><Link to="/host">Back to events</Link></main>;
  if (!ev) return <main className="page"><p className="muted">Loading...</p></main>;
  const b = ev.branding || {};
  const branded = hasBrand(b);
  const logo = logoSrc(b);
  return (
    <div className="poster-wrap">
      <div className="poster-tools no-print">
        <button className="btn" onClick={() => window.print()}>Print or save as PDF</button>
        <button className="btn secondary" onClick={save}>Download QR picture</button>
        <Link className="btn quiet" to="/host">Back</Link>
        <p className="muted small" style={{ flexBasis: '100%', margin: 0 }}>Tip: in the print window choose "Save as PDF" to send it to a printer shop, and turn on "Background graphics" so the colours print.</p>
      </div>
      <article className="poster" style={brandVars(b)} aria-label="Join poster">
        <Band height={30} />
        <div className="poster-body">
          <div className="poster-brand">
            {branded ? (
              <>
                {logo && <img className="poster-logo" src={logo} alt="" />}
                {b.orgName && <span className="poster-org" style={b.accent ? { background: b.accent, color: readableOn(b.accent) } : undefined}>{b.orgName}</span>}
              </>
            ) : <Logo size={64} />}
          </div>
          <h1 className="poster-title">{ev.title}</h1>
          {b.tagline && <p className="poster-tag">{b.tagline}</p>}
          <p className="poster-scan">Scan to play</p>
          <div className="poster-qr" style={b.accent ? { borderColor: b.accent } : undefined}>
            <QRCodeSVG value={url} size={420} level="M" marginSize={0} />
          </div>
          <p className="poster-or">or open <strong>{window.location.host}</strong> and enter</p>
          <CodeTiles code={code} size="big" />
          <p className="poster-how">No account. No download. Pick a nickname and play, alone or with a team.</p>
          {ev.prizes?.length > 0 && (
            <ul className="poster-prizes">{ev.prizes.slice(0, 3).map((p) => <li key={p.place}><strong>{p.place === 1 ? '1st' : p.place === 2 ? '2nd' : p.place === 3 ? '3rd' : `${p.place}th`}</strong> {p.label}</li>)}</ul>
          )}
          {b.sponsors?.length > 0 && <p className="poster-sponsors"><span>With thanks to</span> {b.sponsors.join('  ·  ')}</p>}
          {b.poweredBy !== false && <div className="poster-foot">{branded ? <PoweredBy /> : <span className="small muted">granddquiz</span>}</div>}
        </div>
        <Band height={30} />
      </article>
      <div style={{ position: 'absolute', left: -9999, top: 0 }} aria-hidden="true"><QRCodeCanvas ref={big} value={url} size={1024} level="M" marginSize={4} /></div>
    </div>
  );
}
