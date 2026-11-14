export const CODE_LENGTH = 5;

export function CodeTiles({ code, size = '', animate = false }) {
  const chars = String(code || '').padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('');
  return (
    <span className={`tiles ${size} ${animate ? 'animate' : ''}`} aria-label={`Join code ${code}`} role="img">
      {chars.map((c, i) => (
        <span key={i} className="tile" style={{ '--i': i }} aria-hidden="true">{c.trim()}</span>
      ))}
    </span>
  );
}

// A real text input laid over the tiles, so paste, autofill and phone keyboards all behave normally.
export function CodeInput({ value, onChange, id = 'join-code' }) {
  const chars = value.padEnd(CODE_LENGTH, ' ').split('');
  const next = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <span className="tiles">
      {chars.map((c, i) => (
        <span key={i} className={`tile ${i === next ? 'active' : ''}`} aria-hidden="true">{c.trim()}</span>
      ))}
      <input
        id={id}
        className="code-input"
        value={value}
        maxLength={CODE_LENGTH}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
      />
    </span>
  );
}
