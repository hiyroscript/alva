// The one-time Screen Pad hint (the Screen Pad update): a small card that
// says what the invisible left half of the screen does, shown the first
// time a player plays with Screen Pad (Quick Battle, Practice Ground or
// Online Play) on a touch screen, and never again once dismissed.
//
// It is a card of text, never a drawing of the pad. It takes no pointer
// itself: the first touch anywhere dismisses it (and still plays, so no
// press is lost), and that is remembered in the player's settings
// (`screenPadHintSeen`, js/core/settings.js, the only module touching
// storage). Leaving play before that (a pause, the end of the match) only
// hides it: it comes back the next time play starts.

import { el } from '../core/utils.js';
import { tx } from '../localization/i18n.js';

export class ScreenPadHint {
  // `settings`: the app's Settings. `touchUI()`: whether the touch
  // controls are on screen (a touch device).
  constructor(settings, touchUI = () => true) {
    this.settings = settings;
    this.touchUI = touchUI;
    this.shown = false;
    this.root = el('div', { class: 'screenpad-hint glass', role: 'status', hidden: true }, [
      el('strong', { class: 'screenpad-hint-title', ...tx('touch.screenPadHint.title') }),
      el('p', { class: 'screenpad-hint-body', ...tx('touch.screenPadHint.body') }),
      el('p', { class: 'screenpad-hint-dismiss', ...tx('touch.screenPadHint.dismiss') }),
    ]);
    this.onPress = () => this.dismiss();
  }

  // Play started (`playing`, with `scheme` the touch controls' scheme) or
  // stopped: shows the card when the player plays with Screen Pad on a touch
  // screen and has not dismissed it yet, hides it otherwise.
  sync(playing, scheme) {
    const show = !!playing && scheme === 'screenpad' && !this.settings?.screenPadHintSeen && !!this.touchUI();
    if (show === this.shown) return;
    this.shown = show;
    this.root.hidden = !show;
    if (show) globalThis.addEventListener?.('pointerdown', this.onPress, { capture: true, passive: true });
    else globalThis.removeEventListener?.('pointerdown', this.onPress, { capture: true });
  }

  // Any touch: hidden, and remembered as seen.
  dismiss() {
    if (!this.shown) return;
    this.settings?.set?.('screenPadHintSeen', true);
    this.sync(false);
  }
}
