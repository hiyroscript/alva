// Asset-path helpers shared by every character definition
// (js/data/characters/<id>.js). Paths stay relative ("./assets/..."), so the
// game runs under any sub-path, a GitHub Pages project site included.

// Every fighter's art follows one pattern, in a folder of its own id:
// ./assets/characters/<id>/<id>_<codename>_<frame>.png. The codename is the
// universal one (idle, run, attack2, midair_attack2, extra_attack,
// attack4_object...), never the move's name in game, and the last part is
// always the frame: 0001_attack1_3.png is attack1, frame 3.
export const framePath = (id, codename, frame) => `./assets/characters/${id}/${id}_${codename}_${frame}.png`;

// Frames `from` to `from + count - 1` of `codename`, in order.
export const frames = (id, codename, count, from = 1) =>
  Array.from({ length: count }, (_, i) => framePath(id, codename, from + i));
