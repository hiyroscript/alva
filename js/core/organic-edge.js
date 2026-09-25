// The living edge the Void and the Shield share: black, a thin red rim, and
// a perimeter that wavers by a few slow sine waves (see drawVoid in
// js/stages/stage-theme.js and js/game/shield-fx.js). Art only: no gameplay
// boundary or collision ever reads it.

// The red of both rims.
export const EDGE_RED = '#d21f2b';

// How far an organic edge leans out at `along` (a distance along a straight
// edge, or an angle round a circle) at time `t`: the sum of `waves`, each
// [k, speed, weight], i.e. weight x sin(along x k + t x speed). Between
// -1 and 1 when the weights add up to 1; pass t = 0 to hold it still.
export function waveOffset(waves, along, t) {
  let w = 0;
  for (const [k, speed, weight] of waves) w += Math.sin(along * k + t * speed) * weight;
  return w;
}
