/** When a provider's plan limits were last read, and what has happened since. */
export interface ProbeTrack {
  /** ms epoch of the last probe; null before the first. */
  lastAt: number | null
  /** A session of this provider was running at some point since the last probe. */
  active: boolean
  /** Reset times of the limits the last probe read. */
  resetsAt: (number | null)[]
}

/** Limits are read every `everyMs` while something runs, at least every `idleMs` otherwise. */
export const IDLE_PROBE_MS = 20 * 60_000

/** Timers drift by a few hundred ms; a probe this close to due counts as due. */
const SLACK_MS = 5_000

/**
 * Whether a provider's limits are worth reading now. Use only changes while that provider's
 * sessions run, so idle stretches are probed rarely; a limit that has just reset is read again
 * so its bar drops right away. Use on other devices or the web still shows up within `idleMs`.
 */
export const probeDue = (track: ProbeTrack, everyMs: number, now: number, idleMs = IDLE_PROBE_MS): boolean => {
  if (track.lastAt === null) return true
  const since = now - track.lastAt + SLACK_MS
  if (track.active && since >= everyMs) return true
  if (since >= Math.max(idleMs, everyMs)) return true
  return track.resetsAt.some(at => at !== null && at > track.lastAt! && at <= now)
}
