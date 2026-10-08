// CPU Intelligence: the strategic brain, what it is trying to achieve.
//
// Purpose: a goal and a fighting style, kept across steps. The style is a
// continuous lean between aggression and patience, read from both
// fighters' danger (their Launch Points against the stage, see dangerTo),
// the score, the clock, the overtime tiebreak (the lower Launch Point),
// Energy and the opponent's observed habits, starting from the level's
// own temperament. The goal is what it pursues now: recover, wait for the
// opponent's respawn in a good place, finish a high-Launch-Point opponent,
// edge-guard, punish, build Launch Point, pressure, win neutral, escape a
// bad position, survive (and let its own Launch Point recover), force the
// action when behind, protect a lead. A goal is kept (hysteresis) unless
// another becomes clearly more urgent or it stops making sense, so the
// CPU does not change its mind every step.
//
// Inputs: the situation, the opponent model.
// Outputs: Strategy, GOALS.
// Important constraints: decides intentions only; tactics.js turns them
// into plans.

import { dangerTo } from './valuation.js';
import { clamp } from '../../core/utils.js';

export const GOALS = Object.freeze([
  'recover', 'awaitRespawn', 'finish', 'edgeguard', 'punish', 'escape', 'survive', 'forceAction', 'protectLead',
  'pressure', 'build', 'neutral',
]);

export class Strategy {
  constructor(profile) {
    this.profile = profile;
    this.reset();
  }

  reset() {
    this.goal = 'neutral';
    this.priority = 0;
    this.since = 0;
    this.aggression = this.profile.aggression;
    this.lastExchange = 0;
  }

  // Something happened (a hit either way, a block): neutral is not
  // dragging on.
  exchanged(clock) {
    this.lastExchange = clock;
  }

  update(S, model) {
    const p = this.profile;
    S.myDanger = S.foeIn ? dangerTo(S, 'self') : 0;
    S.foeDanger = S.foeIn ? dangerTo(S, 'foe') : 0;
    // ---- Style ------------------------------------------------------------------
    let a = p.aggression;
    a += 0.4 * S.foeDanger;
    a -= 0.5 * S.myDanger * (0.4 + 0.6 * p.risk);
    if (S.lead < 0 && S.late) a += 0.25;
    if (S.lead > 0 && S.late) a -= 0.2 * p.risk;
    if (S.tiebreak < 0) a += 0.2;
    if (S.tiebreak > 0) a -= 0.15 * p.risk;
    if (S.exhausted) a -= 0.1;
    // An opponent that comes in a lot is met by patience; one that hangs
    // back is pressed.
    a -= 0.2 * model.bias('approaches');
    // Neutral cannot last forever: a few quiet seconds and it commits.
    const quiet = clamp((S.clock - this.lastExchange - 2) / 4, 0, 1);
    a += 0.25 * quiet;
    this.aggression = clamp(a, 0.08, 0.97);
    S.aggression = this.aggression;

    // ---- Goal -------------------------------------------------------------------
    const want = [];
    if (S.offStage) want.push(['recover', 100]);
    if (!S.foeIn) want.push(['awaitRespawn', 90]);
    if (S.foeIn) {
      if (S.foeOffStage) want.push(['edgeguard', 55 + 25 * S.foeDanger + 10 * p.stage]);
      if (S.foeBusy > 0.15 && !S.foeShielding) want.push(['punish', 50 + 20 * p.punish]);
      if (S.foeDanger > 0.3) want.push(['finish', 40 + 35 * S.foeDanger]);
      const cornered = S.ledge.inside < 170 && Math.sign(S.center - S.x) === S.dir;
      if (cornered && S.myDanger > 0.2) want.push(['escape', 38 + 30 * S.myDanger * p.stage]);
      if (S.myDanger > 0.4 && S.foeDanger < 0.25) want.push(['survive', 30 + 25 * S.myDanger * p.risk]);
      if ((S.lead < 0 && S.late) || S.tiebreak < 0) want.push(['forceAction', 42]);
      if (S.lead > 0 && S.late) want.push(['protectLead', 34]);
      want.push([this.aggression > 0.6 ? 'pressure' : 'neutral', 30]);
      if (S.foeLP < 25 && S.foeDanger < 0.15) want.push(['build', 31]);
    }
    let best = want[0] ?? ['neutral', 0];
    for (const w of want) if (w[1] > best[1]) best = w;
    const current = want.find((w) => w[0] === this.goal);
    const hold = S.clock - this.since < 0.25;
    if (!current || best[1] > current[1] + 8 || (!hold && best[0] !== this.goal && best[1] > current[1] + 3)) {
      if (best[0] !== this.goal) this.since = S.clock;
      this.goal = best[0];
      this.priority = best[1];
    } else {
      this.priority = current[1];
    }
    S.goal = this.goal;
    return this.goal;
  }
}
