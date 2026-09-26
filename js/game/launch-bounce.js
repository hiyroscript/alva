// Launch bounce: a hard combat launch that drives its fighter into stage
// geometry rebounds off it instead of stopping dead, and may ricochet on to
// the next surface.
//
// Physics never bounces anything (see stepBody in js/game/physics.js): a
// contact stops the body on that axis and reports the speed it stopped
// (impactVx / impactVy). This module decides, after the step, whether that
// stop was a launch's impact, and if so turns it back into a rebound. It
// knows nothing of attacks, characters or which hit did it: only the
// fighter's launch sequence and the bounce settings (both below).
//
// A launch sequence starts with a launching hit (startLaunch, from
// Fighter.takeHit) and remembers two things:
//
//   headingX / headingY: which way the launch, or its latest rebound, is
//     carrying the fighter on each axis (1, -1, or 0 for no drive on that
//     axis). A surface can only rebound a fighter its launch is carrying
//     into it: a spike drives it into the floor, but a fighter merely
//     falling back down after an upward or sideways launch lands. Gravity
//     alone never bounces anyone. A rebound turns that axis around; a
//     contact that stops it without one (too slow) spends it (0).
//   bounces: how many times it has rebounded, against settings.maxBounces:
//     counted until the fighter recovers, a hit that launches it again
//     included (see startLaunch).
//
// A contact rebounds when the speed it stopped into the surface is at least
// minImpactSpeed: only what crossed the surface counts, so a glancing
// impact never rebounds hard. That speed comes back reversed and scaled by
// the surface's restitution (wall, floor or ceiling); what ran along the
// surface is kept untouched, so a diagonal impact ricochets. A corner, a
// side and a floor or ceiling met on the same step, rebounds on both axes
// at once, each once. Every rebound is weaker than its impact, so a
// ricochet always dies away, and maxBounces caps it besides.
//
// Nothing here draws or freezes: the fighter applies the stun and impact
// freeze a rebound earns (see Fighter.update), a fighter flying off a
// rebound passes other fighters' pushboxes (see separateFighters in
// js/game/character.js), and the effects are js/game/hit-fx.js's.
//
// None of it is part of a launch's strength: Launch Point, Base Launch and
// Directional Launch resolve exactly as js/data/launch.js says, and only the
// velocity that launch leaves the fighter with can rebound. So the Launch
// Point decides it by itself: a weak launch never bounces, a harder one
// rebounds, and a huge one can ricochet from surface to surface. The Void is
// not geometry: nothing ever rebounds off it.

// ---- Settings --------------------------------------------------------------------

// Every fighter's bounce settings, all tuning in one place. A character may
// override any of them with its own `launchBounce` entry (see
// resolveLaunchBounce; `enabled: false` turns it off).
export const LAUNCH_BOUNCE = Object.freeze({
  enabled: true,
  // Speed into the surface (world units per second, only the part crossing
  // it) a launched fighter needs to rebound: anything slower is an ordinary
  // stop. At LAUNCH_UNIT_SPEED 10 a Base Launch 1 push needs about 50
  // Launch Point to rebound off a wall right beside it, and a Base Launch 2
  // spike about 25 off the floor.
  minImpactSpeed: 500,
  // The share of that speed each kind of surface sends back, reversed. What
  // runs along the surface is kept, so a diagonal impact ricochets instead
  // of reversing, and every rebound is weaker than its impact.
  wallRestitution: 0.72,
  floorRestitution: 0.6,
  ceilingRestitution: 0.65,
  // A safety cap on rebounds until the fighter recovers, however many hits
  // launch it meanwhile: a single launch's restitution ends them long before
  // it, and it ends any wall loop (see startLaunch).
  maxBounces: 5,
  // Seconds of hitstun a rebound leaves the fighter with, at least: it never
  // gets control back while it is still flying off the surface.
  stun: 0.2,
  // A brief impact freeze (seconds) on a rebound at least hitstopSpeed into
  // the surface: fly, impact, pause, rebound. Softer ones never freeze.
  hitstop: 0.05,
  hitstopSpeed: 1200,
});

const SETTING_KEYS = Object.keys(LAUNCH_BOUNCE);

// Frozen bounce settings for a fighter: LAUNCH_BOUNCE with the character's
// own `launchBounce` entry (`spec`, every field optional) over it, for
// `owner` (named in any warning). An unknown field is logged and ignored.
export function resolveLaunchBounce(spec, owner = 'A fighter') {
  const out = { ...LAUNCH_BOUNCE };
  for (const [key, value] of Object.entries(spec ?? {})) {
    if (SETTING_KEYS.includes(key)) out[key] = value;
    else console.warn(`[Alva] ${owner} declares unknown launchBounce field "${key}"; ignoring it.`);
  }
  return Object.freeze(out);
}

// ---- Launch sequences --------------------------------------------------------------

// Components this small (world units per second) are no drive at all: a
// launch bent by float rounding is not a sideways launch.
const DRIVE_EPSILON = 1e-6;
const heading = (v) => (v > DRIVE_EPSILON ? 1 : v < -DRIVE_EPSILON ? -1 : 0);

// A fresh launch sequence for a fighter just launched at `velocity` ({ x, y },
// world units per second, y downward). `previous` is the sequence it was
// still flying in, if any (it had not recovered from it): the new launch
// replaces its heading, but its rebounds count on toward maxBounces, so a
// wall can never keep a combo going forever (hit, rebound off it back into
// the attacker's reach, hit again...). Only recovering (see Fighter.update)
// starts the count over.
export function startLaunch(velocity, previous = null) {
  return { headingX: heading(velocity.x), headingY: heading(velocity.y), bounces: previous?.bounces ?? 0 };
}

// This step's rebound of `body` (just stepped by stepBody) for launch
// sequence `launch`, with bounce `settings`: the body's velocity is turned
// around on every axis that rebounds, `launch` is updated, and the rebound
// is returned as { x, y, normalX, normalY, speed, bounces } (where it struck,
// the surface's normal, its speed into the surface(s) and the rebound's
// number in the sequence). Null when nothing rebounds; a contact that
// stopped the launch too slowly to rebound still spends that axis of it.
export function bounceLaunch(body, launch, settings) {
  if (!launch || !settings?.enabled || launch.bounces >= settings.maxBounces) return null;
  const min = settings.minImpactSpeed;
  let normalX = 0;
  let normalY = 0;
  let intoX = 0;
  let intoY = 0;

  // A solid's side, on the `wall` side of the body (normal (-wall, 0)).
  const wall = body.wall;
  const sideInto = wall ? body.impactVx * wall : 0;
  if (sideInto > 0) {
    if (sideInto >= min && launch.headingX === wall) {
      body.vx = -body.impactVx * settings.wallRestitution;
      launch.headingX = -wall;
      normalX = -wall;
      intoX = sideInto;
    } else {
      launch.headingX = 0;
    }
  }

  // A floor or platform top (normal (0, -1)): the body landed on it this
  // step. A rebound leaves it airborne, and never a landing.
  if (body.grounded && body.impactVy > 0) {
    if (body.impactVy >= min && launch.headingY > 0) {
      intoY = body.impactVy;
      body.vy = -body.impactVy * settings.floorRestitution;
      body.grounded = false;
      body.ground = null;
      body.landed = false;
      launch.headingY = -1;
      normalY = -1;
    } else {
      launch.headingY = 0;
    }
  } else if (body.bonked && body.impactVy < 0) {
    // A ceiling (normal (0, 1)).
    if (-body.impactVy >= min && launch.headingY < 0) {
      intoY = -body.impactVy;
      body.vy = -body.impactVy * settings.ceilingRestitution;
      launch.headingY = 1;
      normalY = 1;
    } else {
      launch.headingY = 0;
    }
  }

  if (!normalX && !normalY) return null;
  launch.bounces++;
  // Where it struck: the side of the body against the wall, its feet on a
  // floor, its head on a ceiling, or the corner between.
  const x = normalX ? body.x - normalX * body.halfW : body.x;
  const y = normalY < 0 ? body.y : normalY > 0 ? body.y - body.height : body.y - body.height / 2;
  return { x, y, normalX, normalY, speed: Math.hypot(intoX, intoY), bounces: launch.bounces };
}
