// Device / environment detection: touch-oriented UI, orientation and
// reduced motion. Emits 'change' when anything relevant flips.

export class Device extends EventTarget {
  constructor() {
    super();
    const mq = (q) => window.matchMedia?.(q) ?? { matches: false, addEventListener() {} };
    this.mqCoarse = mq('(pointer: coarse)');
    this.mqAnyCoarse = mq('(any-pointer: coarse)');
    this.mqNoHover = mq('(hover: none)');
    this.mqReduced = mq('(prefers-reduced-motion: reduce)');

    // Set when a real touch is observed / cleared when a fine pointer or
    // keyboard is clearly in use on a hover-capable device.
    this.touchSeen = false;
    this.touchUI = this._computeTouchUI();
    this.portrait = false;
    this._updateOrientation();

    const recompute = () => this._recompute();
    for (const m of [this.mqCoarse, this.mqAnyCoarse, this.mqNoHover, this.mqReduced]) {
      m.addEventListener?.('change', recompute);
    }
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', () => setTimeout(recompute, 60));

    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.touchSeen) {
          this.touchSeen = true;
          this._recompute();
        } else if (e.pointerType === 'mouse' && this.touchSeen && !this.mqNoHover.matches) {
          this.touchSeen = false;
          this._recompute();
        }
      },
      { capture: true, passive: true },
    );
  }

  get reducedMotion() {
    return this.mqReduced.matches;
  }

  _computeTouchUI() {
    // Primary coarse pointer (phones/tablets), or a touch-capable device
    // without hover, or a touch actually observed. Narrow desktop windows
    // are NOT classified as phones.
    if (this.touchSeen) return true;
    if (this.mqCoarse.matches) return true;
    if (this.mqAnyCoarse.matches && this.mqNoHover.matches) return true;
    return false;
  }

  _updateOrientation() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.portrait = h > w * 1.05;
  }

  // Portrait lock only applies to touch devices; desktop windows may be tall.
  get blockedPortrait() {
    return this.touchUI && this.portrait;
  }

  _recompute() {
    const prev = `${this.touchUI}|${this.portrait}|${this.reducedMotion}`;
    this.touchUI = this._computeTouchUI();
    this._updateOrientation();
    const next = `${this.touchUI}|${this.portrait}|${this.reducedMotion}`;
    document.documentElement.classList.toggle('is-touch', this.touchUI);
    document.documentElement.classList.toggle('is-portrait-blocked', this.blockedPortrait);
    if (prev !== next) this.dispatchEvent(new Event('change'));
  }

  // Keyboard play on a hover-capable device hides touch controls again.
  noteKeyboard() {
    if (this.touchSeen && !this.mqNoHover.matches) {
      this.touchSeen = false;
      this._recompute();
    }
  }

  init() {
    this._recompute();
    return this;
  }
}
