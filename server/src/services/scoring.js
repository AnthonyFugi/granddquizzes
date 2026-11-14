// Correct answers earn 1000 points, dropping linearly to 500 as time runs out.
// Wrong or missing answers earn nothing.
export const MAX_POINTS = 1000;
export const MIN_POINTS = 500;

export function pointsFor(elapsedMs, limitMs) {
  const ratio = Math.min(Math.max(elapsedMs / limitMs, 0), 1);
  return Math.round(MAX_POINTS - (MAX_POINTS - MIN_POINTS) * ratio);
}
