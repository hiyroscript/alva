// The match's entrance: what plays before every match's intro on a battle
// screen (Quick Battle, Adventure, Local Play, Watch Mode, Online Play;
// Restart and Rematch too; never Practice Ground). One timeline, built
// from CONFIG.battle.entrance, cut into named steps:
//
//   Part A, the versus screen     strike → black → teamI → teamII → hold
//   Part B, the transition        cover → reveal
//   Part C, the camera-led spawns centre → zoomI → awaitI → beatI → backI →
//                                 between → zoomII → awaitII → beatII →
//                                 backII → settle
//
// then the Battle's own intro (js/game/battle.js, PHASES.entrance before
// PHASES.intro). The timeline runs on the simulation clock: a Battle built
// with `entrance` counts it step by step (Battle.stepEntrance) while its
// world holds still (no fighter, CPU, hazard or clock moves), so an online
// match plays it step for step on both browsers and starts its intro on
// the same step. What it acts on (`events`): the three entrance sounds'
// cues, each fighter's spawn burst and the step it appears. Everything else
// is drawn from the same timeline: the versus screen on its own canvas
// (js/game/rendering/match-entrance.js) and Part C's camera, a pure
// screen-space zoom (`entranceFraming` here, js/game/rendering/
// screen-zoom.js for the zoom itself). Pure: nothing here keeps state.

import { CONFIG } from '../config.js';
import { HIT_FX } from './rendering/hit-fx.js';

// The steps in order (see the top). Each is [start, end) on the timeline;
// a step may be empty.
export const ENTRANCE_STEPS = Object.freeze([
  'strike', 'black', 'teamI', 'teamII', 'hold',
  'cover', 'reveal',
  'centre', 'zoomI', 'awaitI', 'beatI', 'backI', 'between', 'zoomII', 'awaitII', 'beatII', 'backII', 'settle',
]);

// Team I is p1, Team II p2 (the HUD's own names): the camera visits them in
// that order.
const TEAMS = Object.freeze([['p1', 'I'], ['p2', 'II']]);

// The whole entrance from `cfg` (CONFIG.battle.entrance), every time in
// seconds from its start: the bolt's strike (0) and contact (`contact`),
// the black's fade, each team's slide, the cover, the reveal, each team's
// visit (`spawns`: its zoom's start and arrival, the spawn burst's start,
// the step it appears, its way back home), the named `steps`, the `events`
// a Battle acts on (time order) and the `total`. `burstLead` is how long a
// spawn burst runs before its fighter appears (the elimination burst's
// life, as Arena.updateRespawns times a respawn's).
export function entranceTimeline(cfg = CONFIG.battle.entrance, burstLead = HIT_FX.elimination.life) {
  const contact = cfg.boltDraw;
  const blackEnd = cfg.blackStart + cfg.blackLength;
  const slides = {
    p1: { start: cfg.teamISlide, end: cfg.teamISlide + cfg.slideLength },
    p2: { start: cfg.teamIISlide, end: cfg.teamIISlide + cfg.slideLength },
  };
  const coverFull = cfg.cover + cfg.coverLength;
  const revealEnd = coverFull + cfg.revealLength;
  const spawns = [];
  let at = Math.max(cfg.firstZoom, revealEnd);
  for (const [i, [slot, team]] of TEAMS.entries()) {
    if (i > 0) at += cfg.between;
    const zoomStart = at;
    const arrive = zoomStart + cfg.zoomLength;
    const appear = arrive + cfg.appearAfterZoom;
    const backStart = appear + cfg.beat;
    const home = backStart + cfg.backLength;
    spawns.push(Object.freeze({ slot, team, zoomStart, arrive, burst: Math.max(zoomStart, appear - burstLead), appear, backStart, home }));
    at = home;
  }
  const total = at + cfg.settle;
  const [one, two] = spawns;
  const bounds = [
    ['strike', 0], ['black', cfg.blackStart], ['teamI', slides.p1.start], ['teamII', slides.p2.start], ['hold', slides.p2.end],
    ['cover', cfg.cover], ['reveal', coverFull],
    ['centre', revealEnd], ['zoomI', one.zoomStart], ['awaitI', one.arrive], ['beatI', one.appear], ['backI', one.backStart],
    ['between', one.home], ['zoomII', two.zoomStart], ['awaitII', two.arrive], ['beatII', two.appear], ['backII', two.backStart],
    ['settle', two.home],
  ];
  const steps = bounds.map(([id, start], i) => Object.freeze({ id, start, end: bounds[i + 1]?.[1] ?? total }));
  const events = [
    { time: 0, type: 'bolt' },
    { time: cfg.cover, type: 'cover' },
    { time: coverFull, type: 'reveal' },
    ...spawns.flatMap((s) => [{ time: s.burst, type: 'burst', slot: s.slot }, { time: s.appear, type: 'appear', slot: s.slot }]),
  ].sort((a, b) => a.time - b.time).map((e) => Object.freeze(e));
  return Object.freeze({
    contact, flashEnd: contact + cfg.flash, blackStart: cfg.blackStart, blackEnd,
    slides: Object.freeze({ p1: Object.freeze(slides.p1), p2: Object.freeze(slides.p2) }),
    cover: cfg.cover, coverFull, revealEnd,
    spawns: Object.freeze(spawns), steps: Object.freeze(steps), events: Object.freeze(events), total,
    zoom: cfg.zoom, reducedZoom: cfg.reducedZoom,
  });
}

// The step playing at time `t` ('done' once the entrance is over).
export function entranceStep(timeline, t) {
  if (t >= timeline.total) return 'done';
  for (const s of timeline.steps) if (t < s.end && s.end > s.start) return s.id;
  return 'done';
}

// An ease in and out (cubic), for the camera's moves.
export function easeInOut(k) {
  const x = Math.min(1, Math.max(0, k));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

// Part C's camera at time `t`: whose spawn it frames and how far it has
// come toward it, { slot, amount } (amount 0 at the stage's centre, 1 at
// the spawn, eased in and out along each move), or null while it holds the
// centre (before the first zoom, between the visits, after the last).
export function entranceFraming(timeline, t) {
  for (const s of timeline.spawns) {
    if (t < s.zoomStart || t >= s.home) continue;
    if (t < s.arrive) return { slot: s.slot, amount: easeInOut((t - s.zoomStart) / (s.arrive - s.zoomStart || 1)) };
    if (t < s.backStart) return { slot: s.slot, amount: 1 };
    return { slot: s.slot, amount: 1 - easeInOut((t - s.backStart) / (s.home - s.backStart || 1)) };
  }
  return null;
}
