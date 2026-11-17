// Every question carries the same marks: a correct answer earns the full marks, a wrong or missing answer earns nothing.
// Speed no longer changes the marks. It only breaks ties between players on the same total (see GameSession.standings).
export const DEFAULT_MARKS = 10;

export function cleanMarks(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(100, Math.max(1, v)) : DEFAULT_MARKS;
}
