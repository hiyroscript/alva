// PracticeSession: Practice Ground's simulation on the shared Arena
// (js/game/arena.js). Player 1's fighter on the training stage, and at most
// one practice CPU (the Practice Ground screen adds one on every fresh
// visit): no intro, timer, rounds, points or result. It runs until the
// screen leaves it; the player's fighter can be swapped in place
// (setFighter) and the CPU added, replaced or removed (setCPU / removeCPU).
// DOM concerns (HUD, Practice menu, fighter dialogs) live in the Practice
// Ground screen.
//
// The practice CPU is a training dummy: it has no controller, so it never
// moves, jumps, attacks, charges or defends of its own accord (Fighter falls
// back to neutral input), and keeps its spawn's facing: like every fighter
// it never turns toward its opponent by itself. It is otherwise a normal
// fighter: it takes real hits, hitstun, knockback and binds, collides, and
// the camera frames it as the secondary fighter. Its Knockback builds up
// like anyone's (and launches it further as it does), shown on its own HUD
// card, and every hit it takes also floats the Knockback it added over its
// head (damageNumbers, "+5").
//
// With no CPU, moves aimed at an opponent fall back or miss on their own: a
// Charged BA1 clone has nobody to appear behind, so the press is an ordinary
// BA1 and its cooldown does not start (Fighter.trySummon); the Sphere Rush
// finds no one to catch and ends as a miss (its cooldown still spent);
// attacks and shurikens strike nothing.
//
// The Void never ends practice and scores nothing: a fighter that falls into
// it is out of play for CONFIG.battle.respawnSeconds, then back at its own
// spawn (onVoid, Arena.updateRespawns), fresh: 0 Knockback, full stamina and
// every cooldown ready. Player 1 and the CPU each wait on their own.

import { Arena } from './arena.js';
import { Fighter } from './character.js';
import { PlayerController } from './fighter-controller.js';

// Floating damage numbers over the CPU: how long each lasts (seconds), how
// far it rises meanwhile (world units) and when it starts to fade (fraction
// of its life).
const DAMAGE_LIFE = 0.8;
const DAMAGE_RISE = 26;
const DAMAGE_FADE = 0.45;
// A number this young (seconds) still holds its row: a new one takes the
// lowest row free of them, so hits close together stack instead of
// overlapping.
const DAMAGE_STACK = 0.2;
const DAMAGE_COLOR = '#ff3434';

// "+5", "+15", "+2.5": the Knockback a hit added, with no float noise.
export function formatDamage(damage) {
  return `+${Number(damage.toFixed(2))}`;
}

export class PracticeSession extends Arena {
  constructor({ canvas, map, def, sprites, input, reducedMotion = false }) {
    super({ canvas, map, input, reducedMotion });
    this.reducedMotion = reducedMotion;
    this.player = null;
    this.cpu = null;
    // Live damage numbers over the CPU, oldest first:
    // { target, damage, text, age, stack }.
    this.damageNumbers = [];
    this.setFighter(def, sprites);
  }

  // Puts `def` on the training floor as the practice fighter, replacing the
  // current one: a fresh Fighter at the stage's spawn with 0 Knockback and
  // no cooldowns, driven by Player 1 at once. Nothing of the previous fighter
  // stays: its charged technique ends and its projectiles and clones go. A
  // CPU stays as it is.
  setFighter(def, sprites) {
    const old = this.player;
    if (old) {
      old.endTechnique('destroy');
      old.opponent = null;
    }
    this.player = new Fighter({
      def, sprites, spawn: this.map.spawnPoints[0], stage: this.stage,
      slot: 'p1', label: 'P1', controller: new PlayerController(this.input),
    });
    this.pairFighters();
    this.projectiles.length = 0;
    this.clones.length = 0;
    this.acc = 0;
    this.input.flush();
    // Another fighter's art can change the world scale: refit, which also
    // snaps the camera onto the new fighter (and the CPU).
    if (this.view.pxW) this.resize(true);
  }

  // Puts `def` on the training floor as the practice CPU, replacing any
  // current one: a fresh Fighter at the CPU spawn, facing the player, with
  // no controller. The player's fighter is untouched.
  setCPU(def, sprites) {
    this.removeCPU();
    this.cpu = new Fighter({
      def, sprites, spawn: this.map.spawnPoints[1], stage: this.stage,
      slot: 'p2', label: 'CPU', controller: null,
    });
    this.pairFighters();
    this.acc = 0;
    this.snapCamera();
  }

  // Takes the CPU out of the session, if there is one, with every reference
  // to it: a technique of the player's holding it ends, clones summoned at
  // it go, and so do its numbers. Practice is then solo again.
  removeCPU() {
    const cpu = this.cpu;
    if (!cpu) return;
    const player = this.player;
    if (player.technique?.target === cpu) player.endTechnique('released');
    player.summons = player.summons.filter((s) => s.target !== cpu);
    cpu.endTechnique('destroy');
    // Anything left in the arrays belongs to the player; a clone aimed at
    // the CPU has nothing left to strike.
    const keep = (e) => e.owner !== cpu && e.target !== cpu;
    this.clones.splice(0, this.clones.length, ...this.clones.filter(keep));
    this.projectiles.splice(0, this.projectiles.length, ...this.projectiles.filter(keep));
    this.damageNumbers.length = 0;
    cpu.opponent = null;
    this.cpu = null;
    this.pairFighters();
    this.snapCamera();
  }

  // Player 1 first, then the CPU if there is one, each the other's opponent:
  // the Arena's camera, pushboxes and combat follow from `fighters`.
  pairFighters() {
    const { player, cpu } = this;
    player.opponent = cpu;
    if (cpu) cpu.opponent = player;
    this.fighters = cpu ? [player, cpu] : [player];
  }

  // ---- Void -------------------------------------------------------------------

  // A fighter fell into the Void (Arena.checkVoid already took it out of
  // play): nothing may keep hold of or aim at it (a technique holding it
  // ends; clones and projectiles aimed at it or its own go, and so do its
  // damage numbers). After its respawn wait it is back at its own spawn,
  // still, in a fresh training state: 0 Knockback, full stamina and its
  // charged cooldowns ready (Fighter.respawn). No point is scored and
  // practice simply carries on.
  onVoid(f) {
    this.detachFromPlay(f, 'void');
    const numbers = this.damageNumbers;
    numbers.splice(0, numbers.length, ...numbers.filter((d) => d.target !== f));
    this.scheduleRespawn(f);
  }

  // ---- Loop -------------------------------------------------------------------

  // The shared world step, then this step's hits on the CPU become damage
  // numbers.
  update(dt) {
    super.update(dt);
    this.updateDamageNumbers(dt);
  }

  // Ages the numbers already up, then adds one per hit the CPU took this
  // step, from the Knockback the CombatSystem's resolved hit added.
  updateDamageNumbers(dt) {
    const list = this.damageNumbers;
    let n = 0;
    for (const d of list) {
      d.age += dt;
      if (d.age < DAMAGE_LIFE) list[n++] = d;
    }
    list.length = n;
    for (const e of this.combat.events) {
      if (!this.cpu || e.target !== this.cpu || !(e.damage > 0)) continue;
      let stack = 0;
      while (list.some((d) => d.age < DAMAGE_STACK && d.stack === stack)) stack++;
      list.push({ target: e.target, damage: e.damage, text: formatDamage(e.damage), age: 0, stack });
    }
  }

  // ---- Rendering --------------------------------------------------------------

  render() {
    super.render();
    if (this.view.pxW) this.drawDamageNumbers();
  }

  // Red, outlined "+N" numbers over the CPU's name tag (and its stamina bar,
  // while that shows), following it as it moves: each rises a little (not
  // with reduced motion) and fades out.
  drawDamageNumbers() {
    if (!this.damageNumbers.length) return;
    const { ctx, view } = this;
    const s = view.scale;
    const font = Math.max(15, Math.round(15 * s));
    ctx.save();
    ctx.font = `800 ${font}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, font * 0.2);
    ctx.strokeStyle = 'rgba(12, 12, 14, 0.85)';
    ctx.fillStyle = DAMAGE_COLOR;
    for (const d of this.damageNumbers) {
      const t = d.age / DAMAGE_LIFE;
      const [x] = this.markerAnchor(d.target);
      const rise = this.reducedMotion ? 0 : DAMAGE_RISE * t * s;
      // Clear of the tag and any stamina bar over it (see Arena.statusTop),
      // stacked by arrival.
      const y = this.statusTop(d.target) - 2 - d.stack * font * 0.95 - rise;
      ctx.globalAlpha = t < DAMAGE_FADE ? 1 : Math.max(0, 1 - (t - DAMAGE_FADE) / (1 - DAMAGE_FADE));
      ctx.strokeText(d.text, Math.round(x), Math.round(y));
      ctx.fillText(d.text, Math.round(x), Math.round(y));
    }
    ctx.restore();
  }
}
