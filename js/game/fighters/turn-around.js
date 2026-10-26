// Automatic turn-around: the human player's fighter facing the closest
// enemy by itself, turned on or off in Home › Settings › Combat
// (js/core/settings.js).
//
// Purpose: which enemy the player's fighter faces and which way that is.
// The Fighter (js/game/fighters/fighter.js) owns the rest: who has it at
// all (a player's controller with the setting on, never a CPU), when in
// each fixed step its facing is turned and which committed moves keep
// theirs (Fighter.turnAroundFacing, Fighter.updateFacing).
//
// Inputs: a Fighter and the fighters it fights (its `enemies`).
// Outputs: isValidEnemy, closestEnemy and facingToward.
//
// Important constraints: orientation only. Nothing here moves, steers,
// attacks or spends anything: it reads positions and answers with a
// direction. Pure and deterministic, from simulation positions alone (each
// body's x and y, never a render position, the camera or the screen), and
// it allocates nothing, so it may run every fixed step. Nothing here names
// a fighter: an enemy is whatever fighter the caller lists, and only a
// fighter in play with a real position ever counts.

// Whether `other` is an enemy `self` may face: a fighter (a body and a
// combat state of its own, so never a projectile, a clone, an effect or a
// stage hazard) other than `self`, in play (never one lost to the Void and
// waiting to respawn), at a finite position.
export function isValidEnemy(self, other) {
  if (!other || other === self || !other.combat || other.lostToVoid) return false;
  const body = other.body;
  return !!body && Number.isFinite(body.x) && Number.isFinite(body.y);
}

// The closest of `enemies` (an array of fighters) to `self` that it may
// face (isValidEnemy), measured between their bodies' positions (squared
// world distance: dx² + dy²); null when none is, or `self` has no finite
// position. On equal distances the one listed first wins, so the same
// fighters always give the same answer and a tie never flips between them.
export function closestEnemy(self, enemies) {
  const x = self?.body?.x;
  const y = self?.body?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !enemies) return null;
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const other = enemies[i];
    if (!isValidEnemy(self, other)) continue;
    const dx = other.body.x - x;
    const dy = other.body.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

// The way `self` faces to face `target`: 1 when it stands to the right, -1
// to the left, null when both stand at the same x (the caller keeps the
// facing it has: never 0, never NaN).
export function facingToward(self, target) {
  const dx = target.body.x - self.body.x;
  if (dx > 0) return 1;
  if (dx < 0) return -1;
  return null;
}
