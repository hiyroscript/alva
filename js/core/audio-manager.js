// Audio foundation. Maxy ships with no audio assets and works silently.
// Sounds can be registered later (e.g. audio.register('confirm', './assets/audio/confirm.ogg')).
// Nothing plays before a user gesture unlocks the AudioContext.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.sources = new Map();
    this.enabled = true;
    this.volume = 0.6;
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  unlock() {
    if (this.ctx || !this.sources.size) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    for (const [name, url] of this.sources) this.load(name, url);
  }

  register(name, url) {
    this.sources.set(name, url);
    if (this.ctx) this.load(name, url);
  }

  async load(name, url) {
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      this.buffers.set(name, await this.ctx.decodeAudioData(data));
    } catch (err) {
      console.error(`[Maxy] Failed to load audio "${name}" (${url})`, err);
    }
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    src.buffer = buffer;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
}
