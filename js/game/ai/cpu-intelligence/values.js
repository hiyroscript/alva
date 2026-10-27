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
import { LAUNCH_UNIT_SPEED } from '../../../data/launch.js';

export const KO_VALUE = 70;
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
    for (let i = 0; i < Math.min(n, strikes.length); i++) {
      const st = strikes[i];
      lp += st.damage;
      value += st.damage * (1 + lp / 160);
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

// The lifting move a fighter may use to get back (a rising air attack), as
// the recovery simulation takes it: { speed, time, hang, airMomentum } (its
// lift's speed and length, its hang before it and the share of its drift it
// keeps as it starts; nothing steers it), or null. A recovery move for its
// upward motion alone.
export function riseOf(caps) {
  const m = caps.aerial.find((a) => a.motion === 'rise');
  if (!m) return null;
  return { speed: m.motionSpec.speed, time: m.active, hang: m.startup, airMomentum: m.airMomentum, move: m };
}
