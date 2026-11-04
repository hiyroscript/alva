// CPU Intelligence: what outcomes are worth (Launch Point and launch
// management).
//
// Purpose: one scale for every decision. A point of Launch Point dealt is
// worth about one; a fall into the Void (a point of the match) is worth
// KO_VALUE, more at match point; a launch that leaves its target off the
// stage is worth an edge-guard; a paralysis the free hits it opens. Launch
// outcomes come from the real rules (prediction.js launchOutcome: Base
// Launch x the new Launch Point, the target's own launch reaction, the
// stage and the Void in force), so a high Launch Point is understood as
// danger even when the next hit is small, and a strong launch near a ledge
// as a finisher, for either fighter.
//
// Inputs: the situation (situation.js). Outputs: LaunchJudge, KO_VALUE.
// Important constraints: pure judgement; caches per reassessment only.

import { launchOutcome } from './prediction.js';
import { LAUNCH_UNIT_SPEED, PERFECT_SHIELD_HEAL, LAUNCH_POINT_INFERNO } from '../../../data/launch.js';
import { backTurned } from '../../combat/hit-effects.js';

export const KO_VALUE = 70;

// How many Launch Points now launch as hard as one did at LAUNCH_UNIT_SPEED
// 10, where the CPU's Launch Point scales below were tuned (10 / 7 since the
// launch & energy update, about 1.43). Every such scale (how much a point
// dealt is worth as the total grows, how far ahead a Launch Point lead
// counts, when an opponent backing off is "hurt") reads Launch Points
// through it, so they follow the one knob: a CPU is more patient about a
// finish at a given Launch Point, and treats its own as safer for longer.
// The launch outcomes themselves (LaunchJudge) need no scale: they run the
// real conversion.
//
// Since the Void update the stages' Void is farther away too (468 past each
// ledge and 1040 above, where it was 360 and 800), so a life lasts longer:
// VOID_REACH_SCALE is how much, read from the Launch Point from which a
// Base Launch 3 hit ends a life from anywhere on the stage
// (LAUNCH_POINT_INFERNO, derived by simulation against the stages:
// tests/benchmarks/launch-thresholds.mjs) over the 100 it was when these
// scales were last set. Both factors together are LAUNCH_POINT_SCALE.
export const VOID_REACH_SCALE = LAUNCH_POINT_INFERNO / 100;
export const LAUNCH_POINT_SCALE = (10 / LAUNCH_UNIT_SPEED) * VOID_REACH_SCALE;
// The Launch Point at which a point dealt is worth twice a fresh one's.
const LP_WORTH = 160 * LAUNCH_POINT_SCALE;

// What a perfect Shield is worth to the CPU at Launch Point `lp`, over an
// ordinary block (js/game/ai/cpu-intelligence/defense.js): the free answer
// it opens (1.2, as ever) and, since the launch & energy update, its heal
// (PERFECT_SHIELD_HEAL off its own Launch Point, worth what dealing those
// points is worth at that total, the more the higher it is). Whether the
// CPU manages one at all is still its level's human-like chance
// (`perfectShield`, js/data/difficulty.js).
export function perfectShieldValue(lp) {
  const heal = Math.min(Math.max(0, lp), PERFECT_SHIELD_HEAL);
  return 1.2 + heal * 0.15 * (1 + lp / LP_WORTH);
}
// A launch that leaves its target off the stage (not a fall yet): an
// edge-guard to play, a recovery to get wrong.
const OFFSTAGE_VALUE = 9;
// Each second of paralysis: the free strikes it opens.
const PARALYSIS_VALUE = 9;

// Judges launches and hits for one fighter against another, caching what
// it has worked out until the next reassessment (`reset`).
export class LaunchJudge {
  constructor() {
    this.cache = new Map();
    this.out = {};
  }

  reset() {
    this.cache.clear();
  }

  // The launch a strike `st` would give a target whose Launch Point after
  // its damage is `lp`, standing at `pos` ({ x, y, grounded, halfW, height }),
  // the hit travelling toward `face`. { ko, offstage, speed }.
  launch(s, target, pos, lp, st, face) {
    if (!st.dir || !(st.baseLaunch > 0) || !(lp > 0)) return NONE;
    const speed = st.baseLaunch * lp * LAUNCH_UNIT_SPEED;
    const key = `${target}|${st.baseLaunch}|${st.dir}|${Math.round(lp)}|${Math.round(pos.x / 12)}|${Math.round(pos.y / 12)}|${face}|${pos.grounded ? 1 : 0}|${Math.round(st.hitstun * 50)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const who = target === 'foe' ? s.op : s.me;
    const caps = target === 'foe' ? s.foeCaps : s.caps;
    const reaction = caps.launchReaction;
    let vx = 0;
    let vy = 0;
    if (st.dir === 'horizontal') vx = speed * face;
    else if (st.dir === 'vertical') vy = -speed;
    else vy = speed;
    const stun = st.hitstun + Math.min(reaction.maxStun, (speed / 1000) * reaction.stunPerThousand);
    const res = {
      airJumps: caps.movement.airJumps,
      airDash: caps.movement.airDash ? caps.movement.airDash.distance : 0,
      dashOk: !who.exhausted,
      launched: true,
      rise: riseOf(caps),
    };
    const o = launchOutcome(s.model, s.gravity, { ...pos, halfW: pos.halfW ?? who.halfW, height: pos.height ?? who.height }, vx, vy, stun, res, this.out);
    const result = { ko: o.ko, offstage: o.offstage, speed, x: o.x, y: o.y };
    this.cache.set(key, result);
    return result;
  }

  // What landing the first `n` of `strikes` on a target is worth (see the
  // header): `target` 'foe' (the CPU's hit) or 'me' (the opponent's on the
  // CPU), at `pos`, travelling toward `face`. { value, ko, lp, offstage }.
  strikes(s, target, strikes, n, pos, face, out = {}) {
    const who = target === 'foe' ? s.op : s.me;
    let lp = who.lp;
    let value = 0;
    let ko = 0;
    let offstage = false;
    const stakes = target === 'foe' ? s.match.koFor : s.match.koAgainst;
    // Where the hits come from: the other fighter, for a backstab (a target
    // with its back turned to it takes the backstab's hit instead).
    const fromX = target === 'foe' ? s.me.x : s.op.x;
    for (let i = 0; i < Math.min(n, strikes.length); i++) {
      const st = stabbed(strikes[i], who, pos, fromX, face);
      lp += st.damage;
      value += st.damage * (1 + lp / LP_WORTH);
      if (st.dir && st.baseLaunch > 0) {
        const l = this.launch(s, target, pos, lp, st, face);
        if (l.ko > ko) ko = l.ko;
        value += l.ko * KO_VALUE * stakes + (l.offstage ? OFFSTAGE_VALUE * (1 - l.ko) : 0);
        offstage ||= l.offstage;
      } else if (st.paralyze > 0) {
        value += st.paralyze * PARALYSIS_VALUE;
      }
    }
    out.value = value;
    out.ko = ko;
    out.lp = lp;
    out.offstage = offstage;
    return out;
  }
}

const NONE = Object.freeze({ ko: 0, offstage: false, speed: 0 });

// Strike `st` as it would land on `who` standing at `pos`, coming from
// `fromX` toward `face`: its backstab's damage, launch and stun when it has
// one and `who` has its back turned to it (backTurned), else itself.
function stabbed(st, who, pos, fromX, face) {
  const b = st.backstab;
  if (!b || !backTurned({ body: { x: pos.x }, facing: who.facing }, fromX, face)) return st;
  return { ...st, damage: b.damage, baseLaunch: b.baseLaunch, dir: b.directionalLaunch, hitstun: b.hitstun ?? st.hitstun };
}

// The lifting move a fighter may use to get back (a rising air attack), as
// the recovery simulation takes it: { speed, time, hang, airMomentum } (its
// lift's speed and length, its hang before it and the share of its drift it
// keeps as it starts; it is steered by the universal air control, as any
// aerial is), or null.
export function riseOf(caps) {
  const m = caps.aerial.find((a) => a.motion === 'rise');
  if (!m) return null;
  return { speed: m.motionSpec.speed, time: m.active, hang: m.startup, airMomentum: m.airMomentum, move: m };
}
