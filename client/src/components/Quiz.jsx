// Shapes pair with colours so answers are told apart without relying on colour alone.
const SHAPES = [
  <svg key="a" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 21H2z" fill="currentColor" /></svg>,
  <svg key="b" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" /></svg>,
  <svg key="c" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /></svg>,
  <svg key="d" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 23 12 12 23 1 12z" fill="currentColor" /></svg>,
];
const NAMES = ['triangle', 'circle', 'square', 'diamond'];

export function Option({ index, text, onClick, disabled, picked, correct, dim, tally, tag }) {
  const cls = ['opt', `opt-${index}`, picked && 'picked', correct && 'correct', dim && 'dim'].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={`${NAMES[index]}: ${text}${correct ? ' (correct answer)' : ''}`}>
      {SHAPES[index]}
      <span>{text}</span>
      {tag && <span className="tag">{tag}</span>}
      {tally != null && <span className="tally">{tally}</span>}
    </button>
  );
}

// Countdown: a large number plus a shrinking bar. Turns red for the last 5 seconds (or last quarter).
export function TimerBar({ fraction, left }) {
  const secs = Math.max(0, Math.ceil(left));
  const low = secs <= 5 || fraction < 0.25;
  return (
    <div className={`clock ${low ? 'low' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <span className="clock-num" aria-hidden="true">{secs}<small>s</small></span>
      <div className="timer" aria-hidden="true"><i style={{ width: `${fraction * 100}%` }} /></div>
    </div>
  );
}

export const TimeNote = ({ seconds }) =>
  seconds ? <p className="time-note"><span aria-hidden="true">⏱</span> Every question is timed: <strong>{seconds} seconds</strong> to answer.</p> : null;

export const ordinal = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
};

// "80 / 150" with the percentage; just the number when no total is known yet
export const pct = (score, possible) => (possible > 0 ? Math.round((score / possible) * 100) : null);
export function ScoreText({ score, possible }) {
  return possible > 0 ? <>{score.toLocaleString()} / {possible.toLocaleString()} <small className="pct">({pct(score, possible)}%)</small></> : <>{score.toLocaleString()}</>;
}

// Shown above the question when the quiz is played one category at a time
export function RoundBanner({ round, big = false }) {
  if (!round) return null;
  return (
    <div className={`round-banner ${big ? 'big' : ''}`}>
      <strong>Round {round.number} of {round.of}</strong>
      <span>{round.icon} {round.name}</span>
      <span className="muted small">Question {round.position} of {round.size}</span>
    </div>
  );
}

export function Leaderboard({ rows, meKey, limit = 8, prizes = [], possible = 0, unit = '' }) {
  const prizeFor = (rank) => prizes.find((p) => p.place === rank)?.label;
  const shown = rows.slice(0, limit);
  const mine = meKey && !shown.some((r) => r.key === meKey) ? rows.find((r) => r.key === meKey) : null;
  const Row = ({ r }) => (
    <li className={r.key === meKey ? 'me' : ''}>
      <span className="rank">{r.rank}</span>
      <span>
        {r.name}
        {r.kind === 'team' && <span className="muted small"> team of {r.size}</span>}
        {prizeFor(r.rank) && r.score > 0 && <span className="prize">{prizeFor(r.rank)}</span>}
      </span>
      <span className="score"><ScoreText score={r.score} possible={possible} />{!possible && r.score != null && unit ? <small className="pct"> {unit}</small> : null}</span>
    </li>
  );
  return (
    <ol className="lb">
      {shown.map((r) => <Row key={r.key} r={r} />)}
      {mine && <Row r={mine} />}
    </ol>
  );
}

export function Waiting({ children }) {
  return (
    <div className="waiting" role="status" aria-live="polite">
      <span className="pulse" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

// "marks" in a normal quiz, "correct" in a blitz
export const unitOf = (state) => (state?.mode === 'blitz' ? 'correct' : 'marks');
export const fmtClock = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
export const blitzLength = (secs) => (secs % 60 === 0 ? `${secs / 60} ${secs === 60 ? 'minute' : 'minutes'}` : `${secs} seconds`);
