// CPU Intelligence: stage navigation and recovery.
//
// Purpose: the stage as places to stand and ways between them, read from
// the actual stage data (never a stage's name): every surface (the main
// floor, the one-way platforms, the solids' tops), which ones a jump (the
// normal one, the higher one, air jumps on top) reaches from which, and
// which ones walking off an edge drops onto. `route` finds a way to the
// surface nearest a point; `navigateStep` walks it with real inputs. And
// when the CPU is off the stage, `recoverStep` brings it back: steering
// home, air jumps timed low (as low as its level dares), the air dash when
// level with the ledge and too far to drift, a recovery attack (one that
// rises or flies) when the jumps are spent, never a fast fall over the
// Void and never a move the rules refuse (free fall, a launch still
// flying, a used-up air move).
//
// Inputs: the situation (situation.js), the executor, the stage.
// Outputs: surfacesOf, surfaceUnder, route, navigateStep, recoverStep,
// offStage, ledgeInfo.
// Important constraints: reads the stage and the CPU's own fighter only;
// every action is a want handed to the executor.

import { jumpApex } from './forecast.js';
import { clamp } from '../../core/utils.js';

const GRAPHS = new WeakMap();

// Heights a fighter's own jumps can climb (universal movement).
export const RISE = Object.freeze({
  normal: jumpApex('normal'),
  high: jumpApex('high'),
  air: jumpApex('air'),
});

// Every surface of `stage`: { ref, x0, x1, y, oneWay, main }.
export function surfacesOf(stage) {
  let g = GRAPHS.get(stage);
  if (g) return g;
  const list = [];
  for (const p of stage.platforms) list.push({ ref: p, x0: p.x, x1: p.x + p.w, y: p.y, oneWay: true, main: false });
  for (const s of stage.solids) list.push({ ref: s, x0: s.x, x1: s.x + s.w, y: s.y, oneWay: false, main: s === stage.floor });
  g = { list, byRef: new Map(list.map((s) => [s.ref, s])) };
  GRAPHS.set(stage, g);
  return g;
}

// The surface under a point (feet at y), or null over open air.
export function surfaceUnder(stage, x, halfW, y) {
  const hit = stage.surfaceBelow(x - halfW, x + halfW, y);
  return hit.ref ? surfacesOf(stage).byRef.get(hit.ref) ?? null : null;
}

// Whether a body is off the stage: in the air with nothing at all under it.
export function offStage(stage, x, halfW, y) {
  return !stage.surfaceBelow(x - halfW, x + halfW, y).ref;
}

// Where a body at x stands relative to the main floor's ledges: the
// nearer ledge's side (-1 left, 1 right), how far inside the floor it is
// (negative past the edge), and how far it is from the other.
export function ledgeInfo(stage, x) {
  const f = stage.floor;
  const left = x - f.x;
  const right = f.x + f.w - x;
  return left < right ? { side: -1, inside: left, other: right, edgeX: f.x } : { side: 1, inside: right, other: left, edgeX: f.x + f.w };
}

// Whether a climb of `rise` units is within the CPU's jumps: the jump
// kind and how many air jumps it takes, or null.
function climb(rise) {
  if (rise <= RISE.normal * 0.85) return { kind: 'normal', air: 0 };
  if (rise <= RISE.high * 0.88) return { kind: 'high', air: 0 };
  if (rise <= (RISE.high + RISE.air) * 0.85) return { kind: 'high', air: 1 };
  if (rise <= (RISE.high + 2 * RISE.air) * 0.82) return { kind: 'high', air: 2 };
  return null;
}

// The ways out of surface `a`: up onto each higher surface a jump reaches
// (from under a one-way platform, or from beside a solid), and down onto
// whatever walking off each of its edges lands on.
function edgesFrom(stage, a, halfW) {
  const { list } = surfacesOf(stage);
  const out = [];
  for (const b of list) {
    if (b === a) continue;
    if (b.y < a.y - 8) {
      const how = climb(a.y - b.y + 6);
      if (!how) continue;
      const gap = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
      if (gap > 160) continue;
      out.push({ to: b, up: true, ...how, cost: Math.abs(a.y - b.y) * 1.5 + gap + 40 });
    }
  }
  for (const side of [-1, 1]) {
    const x = side < 0 ? a.x0 - halfW - 18 : a.x1 + halfW + 18;
    const below = surfaceUnder(stage, x, halfW, a.y + 2);
    if (below && below !== a) out.push({ to: below, up: false, edge: side, cost: Math.abs(below.y - a.y) * 0.5 + 20 });
  }
  return out;
}

// The cheapest way from surface `from` to `goal` (a few hops at most): the
// list of edges, or null when there is none.
export function route(stage, from, goal, halfW = 16) {
  if (!from || !goal) return null;
  if (from === goal) return [];
  const best = new Map([[from, { cost: 0, path: [] }]]);
  let frontier = [from];
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const next = [];
    for (const s of frontier) {
      const here = best.get(s);
      for (const e of edgesFrom(stage, s, halfW)) {
        const cost = here.cost + e.cost;
        const known = best.get(e.to);
        if (known && known.cost <= cost) continue;
        best.set(e.to, { cost, path: [...here.path, e] });
        next.push(e.to);
      }
    }
    frontier = next;
  }
  return best.get(goal)?.path ?? null;
}

// The surface a point stands over (or the nearest one to it): where the
// CPU goes to meet whoever is there.
export function goalSurface(stage, x, y, halfW = 16) {
  const under = surfaceUnder(stage, x, halfW, y - 2);
  if (under) return under;
  let best = null;
  let bestD = Infinity;
  for (const s of surfacesOf(stage).list) {
    const cx = clamp(x, s.x0, s.x1);
    const d = Math.hypot(cx - x, (s.y - y) * 1.5);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// One step along route `nav` ({ path, i, phase }) toward its goal surface:
// to the take-off point, the jump (the height it needs: normal, higher, air
// jumps on top), steering onto the surface; or off the right edge to drop.
// Returns 'run', 'done' or 'fail'.
export function navigateStep(S, ex, nav) {
  const edge = nav.path[nav.i];
  if (!edge) return 'done';
  const to = edge.to;
  const on = S.grounded ? surfaceUnder(S.stage, S.x, S.halfW, S.y - 1) : null;
  if (S.grounded && on === to) {
    nav.i++;
    nav.phase = null;
    return nav.i >= nav.path.length ? 'done' : 'run';
  }
  if (edge.up) {
    const landX = clamp(S.fx ?? (to.x0 + to.x1) / 2, to.x0 + 22, to.x1 - 22);
    if (S.grounded) {
      if (nav.phase === 'air') {
        // Back on the ground short of it: try again.
        nav.tries = (nav.tries ?? 0) + 1;
        nav.phase = null;
        if (nav.tries > 3) return 'fail';
      }
      let takeoff;
      if (to.oneWay && S.x > to.x0 - 40 && S.x < to.x1 + 40) takeoff = clamp(S.x, to.x0 + 8, to.x1 - 8);
      else if (to.oneWay) takeoff = S.x < to.x0 ? to.x0 - 30 : to.x1 + 30;
      else takeoff = S.x < (to.x0 + to.x1) / 2 ? to.x0 - S.halfW - 34 : to.x1 + S.halfW + 34;
      const dx = takeoff - S.x;
      if (Math.abs(dx) > 18 && !(to.oneWay && S.x > to.x0 && S.x < to.x1)) {
        ex.move(Math.sign(dx));
        return 'run';
      }
      if (S.canAct) {
        ex.jump(edge.kind);
        ex.move(Math.sign(landX - S.x));
        nav.phase = 'air';
        nav.airLeft = edge.air;
      }
      return 'run';
    }
    // In the air: steer over it, air jump near the top if still short.
    ex.move(Math.abs(landX - S.x) > 10 ? Math.sign(landX - S.x) : 0);
    const short = S.y > to.y - 6;
    if (short && S.vy > -120 && S.airJumps > 0 && nav.airLeft > 0 && S.canAct && !S.freeFall) {
      ex.jump('air');
      nav.airLeft--;
    }
    if (S.vy > 0 && S.y > to.y + 30 && nav.airLeft <= 0) nav.phase = 'air';
    return 'run';
  }
  // Down: walk off the edge that drops onto it.
  if (!S.grounded) {
    const cx = clamp(S.fx ?? (to.x0 + to.x1) / 2, to.x0 + 10, to.x1 - 10);
    ex.move(Math.abs(cx - S.x) > 8 ? Math.sign(cx - S.x) : 0);
    return 'run';
  }
  ex.move(edge.edge);
  return 'run';
}

// Off the stage: one step of getting back onto it. Always steering home
// (and so bending a launch that way while stunned); once free, air jumps
// timed as low as this level dares, the air dash when level with the ledge
// and too far out, a recovery attack once the jumps are spent. `rec`
// keeps the attempt's own memory. Returns true while it is recovering.
export function recoverStep(S, ex, rec) {
  const stage = S.stage;
  const floor = stage.floor;
  const left = floor.x;
  const right = floor.x + floor.w;
  const side = S.x < left ? -1 : S.x > right ? 1 : 0;
  const top = floor.y;
  const home = side === 0 ? Math.sign(S.center - S.x) || 1 : -side;
  const edgeX = side < 0 ? left : right;
  const gap = side === 0 ? 0 : (S.x - edgeX) * side + S.halfW;
  const depth = S.y - top; // feet below the stage's top (negative: above)
  ex.move(home);
  if (!S.canAct || S.stun > 0) return true;
  const q = S.profile.recover;
  const mv = S.self.movement;
  // How far the drift alone still carries it before its feet drop below
  // the ledge: the time until then at its fall, at top speed.
  const g = S.g;
  const vy = S.vy;
  const above = 4 - depth;
  const tLedge = above <= 0 ? 0 : (-vy + Math.sqrt(vy * vy + 2 * g * above)) / g;
  const driftReach = mv.maxSpeed * tLedge * 0.85;
  const canAirDash = S.k.airDash && S.airDashes > 0 && !S.freeFall && !S.launched && S.movementReady(true) && !S.exhausted;
  // Below the ledge: an air jump, once falling (or about to), as low as the
  // level dares: a skilled CPU waits until its feet are near the ledge, a
  // casual one jumps as soon as it starts to fall.
  const low = 70 - 110 * q; // feet this far above the ledge (negative: below) before it jumps
  const sink = vy > -60 && (depth > low || (depth > -40 && gap > driftReach));
  // Falling close to the Void's bottom: no waiting for the best moment (but
  // never a second jump on top of a rise still going).
  const voidClose = vy > -150 && S.y > stage.void.bottom - 260 + S.height / 2;
  if (S.airJumps > 0 && !S.freeFall && (sink || voidClose) && gap > 0) {
    // Above the ledge and the air dash closes the gap: keep the jump.
    if (!(canAirDash && depth < -10 && gap < 230 && gap > driftReach)) {
      ex.jump('air');
      rec.jumps = (rec.jumps ?? 0) + 1;
      return true;
    }
  }
  // Level with the ledge (or above it) and too far to drift: the air dash.
  if (canAirDash && gap > Math.max(30, driftReach) && depth > -260 && (depth < -6 || (gap > 160 && depth < 80))) {
    ex.dash(home);
    return true;
  }
  // The jumps (and the air dash) spent, falling below the ledge: a recovery
  // attack, one that rises or flies, if it may start now.
  if (S.airJumps <= 0 && depth > -30 && vy > -50 && gap > 0) {
    const options = S.k.recoveryMoves.filter((m) => S.moveReady(m));
    const rise = options.find((m) => m.motion === 'rise');
    const fly = options.find((m) => m.motion === 'homing');
    const pick = depth > 20 ? rise ?? fly : fly && gap > 60 ? fly : rise ?? fly;
    if (pick) {
      ex.press(pick.action);
      return true;
    }
  }
  // Still flying from the launch that sent it out, jumps left but nothing
  // else may start: an air jump ends it (handled above when needed); with
  // no jumps and a recovery attack waiting, a fast fall ends the launch so
  // the attack can start (only while above the ledge).
  if (S.launched && S.airJumps <= 0 && depth < -60 && S.k.recoveryMoves.length && vy > 0) ex.down();
  return true;
}
