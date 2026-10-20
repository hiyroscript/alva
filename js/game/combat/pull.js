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
// a fighter out of play, one whose Shield is up (it holds its ground), one
// held in place (paralyzed) and, for a pull that reaches only its `front`,
// one whose middle is behind it (behind the attack's fighter, the way it
// faces, or behind the projectile, the way it flies).
//
// A pull brings its target in; it never shoves the fighter that owns it. A
// fighter it draws remembers whose pull it was (Fighter.drawnBy) while the
// pull draws it and, once the pull is over, for as long as it is still
// carried toward that fighter, helpless (stunned or held), on the speed it
// was drawn with; it stops against that fighter's body rather than pushing
// it (separateFighters in js/game/fighters/fighter.js). Free to act again,
// or no longer moving toward it, it pushes and is pushed as ever.

const scratch = { x: 0, y: 0 };

// Every pull live this step, each drawing `fighters` toward its point.
export function applyPulls(fighters, projectiles, dt) {
  // Whoever is free to act again, or no longer carried toward the fighter
  // that drew it in, is done with that pull (this step's pulls draw anew).
  for (const f of fighters) {
    const by = f.drawnBy;
    if (!by) continue;
    const helpless = f.combat.stun > 0 || f.combat.immobilized;
    if (by.lostToVoid || !helpless || !(f.body.vx * Math.sign(by.body.x - f.body.x) > 0)) f.drawnBy = null;
  }
  for (const f of fighters) {
    const atk = f.combat?.attack;
    const pull = atk?.def.pull;
    if (!pull || f.combat.phase !== 'active') continue;
    scratch.x = f.body.x + pull.offset.x * f.facing;
    scratch.y = f.body.y + pull.offset.y;
    for (const target of fighters) {
      if (target !== f && inFront(pull, target, f.body.x, f.facing) && pullToward(target, scratch.x, scratch.y, pull, dt)) target.drawnBy = f;
    }
  }
  for (const p of projectiles) {
    const pull = p.def.pull;
    if (!pull || !p.alive) continue;
    const x = p.x + pull.offset.x * p.direction;
    const y = p.y + pull.offset.y;
    for (const target of fighters) {
      if (target !== p.owner && inFront(pull, target, p.x, p.direction) && pullToward(target, x, y, pull, dt)) target.drawnBy = p.owner;
    }
  }
}

// Whether `pull` may reach `target` from `x`, facing `facing`: any pull,
// unless it reaches only its `front` and the target's middle is behind.
function inFront(pull, target, x, facing) {
  return !pull.front || (target.body.x - x) * facing >= 0;
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
