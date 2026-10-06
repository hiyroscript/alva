// Pulls: attacks and projectiles that draw opponents in (`pull` on an
// attack, see js/game/combat/attacks.js, or on a projectile, see
// js/game/combat/projectile.js). One rule for both, run once every fixed
// step after the fighters and projectiles have moved and before hits
// resolve (see Arena.update), so a fighter drawn into a hitbox is struck on
// the same step.
//
// Inputs: the fighters in play, the live projectiles, the step.
// Outputs: applyPulls and pullToward.
// Important constraints: nothing here names a fighter or a move. A pull
// only ever sets the velocity of the fighters it draws; their own update
// moves them (under their own movement, stun or Dash rules), so collision,
// ground and the Void treat a pulled fighter like any other.
//
// A pull's point is the attack's `offset` from its fighter's origin
// (facing right, mirrored with the fighter's facing), live only while the
// attack's active phase is open; or a projectile's centre (its `offset`
// from it, mirrored with its direction), for as long as it flies. Every
// opponent of the pull's owner whose middle is within `radius` of the point
// is moved straight toward it at up to `speed` world units / s, never past
// it (closer than a step's travel, it arrives exactly). A grounded fighter
// is dragged along the ground and only lifted when the point is above its
// head; an airborne one is drawn along both axes. Not pulled: the owner,
// a fighter out of play, one whose Shield is up (it holds its ground) and
// one held in place (paralyzed).

const scratch = { x: 0, y: 0 };

// Every pull live this step, each drawing `fighters` toward its point.
export function applyPulls(fighters, projectiles, dt) {
  for (const f of fighters) {
    const atk = f.combat?.attack;
    const pull = atk?.def.pull;
    if (!pull || f.combat.phase !== 'active') continue;
    scratch.x = f.body.x + pull.offset.x * f.facing;
    scratch.y = f.body.y + pull.offset.y;
    for (const target of fighters) if (target !== f) pullToward(target, scratch.x, scratch.y, pull, dt);
  }
  for (const p of projectiles) {
    const pull = p.def.pull;
    if (!pull || !p.alive) continue;
    const x = p.x + pull.offset.x * p.direction;
    const y = p.y + pull.offset.y;
    for (const target of fighters) if (target !== p.owner) pullToward(target, x, y, pull, dt);
  }
}

// One step of `pull` drawing fighter `f` toward the point (x, y), if `f`
// may be drawn and its middle is within the pull's radius. True when it
// was.
export function pullToward(f, x, y, pull, dt) {
  if (f.lostToVoid || f.combat.shielding || f.combat.immobilized) return false;
  const b = f.body;
  const dx = x - b.x;
  const dy = y - (b.y - b.height / 2);
  const dist = Math.hypot(dx, dy);
  if (dist > pull.radius) return false;
  // Never past the point: closer than a step's travel at full speed, the
  // velocity that lands on it exactly.
  const speed = Math.min(pull.speed, dist / dt);
  const lift = !b.grounded || y < b.y - b.height;
  const along = lift ? dist : Math.abs(dx);
  if (along < 1e-6) {
    b.vx = 0;
    if (lift) b.vy = 0;
    return true;
  }
  if (lift) {
    b.vx = (dx / dist) * speed;
    b.vy = (dy / dist) * speed;
    if (b.vy < 0) {
      b.grounded = false;
      b.ground = null;
    }
  } else {
    b.vx = Math.sign(dx) * Math.min(pull.speed, Math.abs(dx) / dt);
  }
  return true;
}
