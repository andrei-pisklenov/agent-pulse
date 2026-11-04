import type { LimitWindow } from './types.js'

export const SESSION_WINDOW_MS = 5 * 3_600_000
export const WEEK_WINDOW_MS = 7 * 86_400_000

export interface Forecast {
  /** When the limit runs out at the current pace, if that is before the reset. */
  exhaustsAt: number | null
  /** Expected use at reset time at the current pace (may exceed 100). */
  projectedPercent: number
  /** Highest average use per hour from now on that still lasts until the reset. */
  safePerHour: number
}

/**
 * Linear pace forecast for one limit window: usage so far divided by the time elapsed in
 * the window, extrapolated to the reset. Returns null when there is too little data
 * (unknown reset, or less than 1% of the window elapsed).
 */
export const forecastLimit = (window: LimitWindow | null, lengthMs: number, now: number): Forecast | null => {
  if (!window?.resetsAt || window.resetsAt <= now) return null
  const remainingMs = window.resetsAt - now
  const elapsedMs = lengthMs - remainingMs
  if (elapsedMs < lengthMs * 0.01) return null
  const perMs = window.percent / elapsedMs
  const projectedPercent = window.percent + perMs * remainingMs
  const exhaustsAt = perMs > 0 && projectedPercent > 100 ? now + (100 - window.percent) / perMs : null
  return {
    exhaustsAt,
    projectedPercent: Math.round(projectedPercent),
    safePerHour: Math.max(0, (100 - window.percent) / (remainingMs / 3_600_000)),
  }
}
