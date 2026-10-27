// Plays normalized animations for one fighter. Logical states whose art is
// missing (jump, hurt, land, ...) resolve through the character's fallback
// table.
//
// A clip restarts from its first frame when its state key changes, when a
// caller asks (`restart`), and when a new activation of a move begins
// (`activation`: the move's own record, an attack's, a technique's, a
// summon's startup's or a Dash's): a move started again under the same key
// (the same attack pressed on the very step its last activation ended, a
// hit-cancel into itself, a Mash Combo turn) plays from frame one instead of
// holding the last frame of the activation before it. An activation
// restarts its clip once, as it begins, never on every step. Nothing else
// restarts a clip: a held frame (a single-frame pose, the Shield held, a
// non-looping clip's last frame held until its move ends, an impact
// freeze) holds.

// Clips whose frame rate has already been reported unusable.
const warnedFps = new Set();

export class SpriteAnimator {
  constructor(sprites) {
    this.sprites = sprites;
    this.stateKey = null;
    this.anim = null;
    this.hold = null;
    this.index = 0;
    this.time = 0;
    this.speed = 1;
    // The move activation the clip playing belongs to (see the header), or
    // null for a state no move owns.
    this.activation = null;
  }

  // `activation` left out keeps the one the clip belongs to (a caller that
  // knows nothing of moves); given, a different one than before restarts
  // the clip (null ends the old one without restarting anything).
  play(stateKey, { restart = false, activation } = {}) {
    if (!this.sprites?.usable) return;
    if (activation !== undefined && activation !== this.activation) {
      this.activation = activation;
      if (activation !== null) restart = true;
    }
    if (stateKey === this.stateKey && !restart) return;
    const { anim, hold } = this.sprites.resolve(stateKey);
    const sameClip = anim === this.anim && hold === this.hold;
    this.stateKey = stateKey;
    if (sameClip && !restart) return;
    this.anim = anim;
    this.hold = hold;
    this.index = hold ?? 0;
    this.time = 0;
  }

  // Speed multiplier (e.g. run playback following horizontal speed, a Mash
  // Combo turn's rate).
  setSpeed(scale) {
    this.speed = scale;
  }

  update(dt) {
    const anim = this.anim;
    if (!anim || this.hold !== null || anim.frames.length < 2) return;
    // A clip with no usable rate cannot advance: it holds its first frame,
    // reported once, rather than looping on a zero-length frame.
    if (!(anim.fps > 0) || !Number.isFinite(anim.fps)) {
      if (!warnedFps.has(anim.key)) {
        warnedFps.add(anim.key);
        console.warn(`[Alva] Clip "${anim.key}" has no usable fps (${anim.fps}); holding its first frame.`);
      }
      return;
    }
    this.time += dt * this.speed;
    const frameTime = 1 / anim.fps;
    while (this.time >= frameTime) {
      this.time -= frameTime;
      if (this.index + 1 < anim.frames.length) this.index++;
      else if (anim.loop) this.index = 0;
    }
  }

  get frame() {
    if (!this.anim) return null;
    return this.anim.frames[Math.min(this.index, this.anim.frames.length - 1)];
  }
}
