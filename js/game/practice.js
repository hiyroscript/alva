// PracticeSession: Practice Ground's solo simulation on the shared Arena
// (js/game/arena.js). One fighter under Player 1's control on the training
// stage and nothing else: no opponent or CPU, no intro, timer or result. It
// runs until the screen leaves it, and its fighter can be swapped in place
// (setFighter). DOM concerns (HUD, Practice menu, fighter dialog) live in the
// Practice Ground screen.
//
// With no opponent, moves aimed at one fall back or miss on their own: a
// Charged BA1 clone has nobody to appear behind, so the press is an ordinary
// BA1 and no Energy is spent (Fighter.trySummon); the Sphere Rush finds no
// one to catch and ends as a miss; attacks and shurikens strike nothing.

import { Arena } from './arena.js';
import { Fighter } from './character.js';
import { PlayerController } from './fighter-controller.js';

export class PracticeSession extends Arena {
  constructor({ canvas, map, def, sprites, input, reducedMotion = false }) {
    super({ canvas, map, input, reducedMotion });
    this.player = null;
    this.setFighter(def, sprites);
  }

  // Puts `def` on the training floor as the practice fighter, replacing the
  // current one: a fresh Fighter at the stage's spawn with full health and
  // Energy, driven by Player 1 at once. Nothing of the previous fighter
  // stays: its charged technique ends and its projectiles and clones go.
  setFighter(def, sprites) {
    this.player?.endTechnique('destroy');
    this.player = new Fighter({
      def, sprites, spawn: this.map.spawnPoints[0], stage: this.stage,
      slot: 'p1', label: 'P1', controller: new PlayerController(this.input),
    });
    this.fighters = [this.player];
    this.projectiles.length = 0;
    this.clones.length = 0;
    this.acc = 0;
    this.input.flush();
    // Another fighter's art can change the world scale: refit, which also
    // snaps the camera onto the new fighter.
    if (this.view.pxW) this.resize(true);
  }
}
