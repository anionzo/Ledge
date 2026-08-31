/**
 * Stable, dependency-free id generator for clipboard items and staged images.
 *
 * Combines a monotonic timestamp with random entropy — good enough for a
 * single-machine local store and avoids pulling a uuid dependency into the
 * main process. The `<base36-time>-<base36-random>` shape is also what the
 * `ledge://` protocol validates against, so keep the alphabet to `[a-z0-9-]`.
 */
export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
