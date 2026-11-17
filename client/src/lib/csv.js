// Results sheet. Built in the browser from the final standings, so nothing extra is stored on the server.

// Nicknames are typed by players. A cell that starts with = + - or @ would be run as a formula when the
// sheet is opened in Excel or Sheets, so those are defused with a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** state: { leaderboard: [{rank,name,kind,score,id,size}], teams: [{id,members}], prizes: [{place,label}], possible } */
export function resultsCsv(state) {
  const prizeFor = (rank) => (state.prizes || []).find((p) => p.place === rank)?.label || '';
  const members = new Map((state.teams || []).map((t) => [t.id, t.members || []]));
  const rows = (state.leaderboard || []).map((r) => [
    r.rank,
    r.name,
    r.kind === 'team' ? 'Team' : 'Solo',
    r.kind === 'team' ? (members.get(r.id) || []).join('; ') : '',
    r.score,
    state.possible || '',
    state.possible ? `${Math.round((r.score / state.possible) * 100)}%` : '',
    r.score > 0 ? prizeFor(r.rank) : '', // same rule as the winners list: no marks, no prize
  ]);
  const lines = [['Rank', 'Name', 'Type', 'Members', 'Marks', 'Out of', 'Percent', 'Prize'], ...rows].map((r) => r.map(csvCell).join(','));
  // BOM so Excel reads names with accents correctly; CRLF is what spreadsheets expect
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function fileSlug(text) {
  return String(text || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'quiz';
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const resultsFilename = (title) => `${fileSlug(title)}-results-${new Date().toISOString().slice(0, 10)}.csv`;
