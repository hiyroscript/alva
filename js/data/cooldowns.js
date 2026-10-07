// Shared reuse policy for discrete moves. Locomotion, jumps, Shield and
// Deflect are exempt; Deflect retains its authored repeat delay.
export const REPEAT_COOLDOWN = 0.5;

export function resolveCooldown(value = 0, owner = 'Move', { exempt = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`[Alva] ${owner} declares cooldown ${value}: expected finite, non-negative seconds`);
  }
  return exempt ? value : Math.max(REPEAT_COOLDOWN, value);
}
