// Plays normalized animations for one fighter. Logical states that have no
// art yet (jump, block, ...) resolve through the character's fallback table.

export class SpriteAnimator {
  constructor(sprites) {
    this.sprites = sprites;
    this.stateKey = null;
    this.anim = null;
    this.hold = null;
    this.index = 0;
    this.time = 0;
    this.speed = 1;
  }

  play(stateKey, { restart = false } = {}) {
    if (!this.sprites?.usable) return;
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

  // Speed multiplier (e.g. run playback following horizontal speed).
  setSpeed(scale) {
    this.speed = scale;
  }

  update(dt) {
    const anim = this.anim;
    if (!anim || this.hold !== null || anim.frames.length < 2) return;
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
