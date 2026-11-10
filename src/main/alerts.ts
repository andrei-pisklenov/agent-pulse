import { forecastLimit, formatReset, SESSION_WINDOW_MS, WEEK_WINDOW_MS } from '../core/forecast'
import type { LimitWindow, Session, Snapshot } from '../core/types'
import type { QuietHours, Settings } from '../shared/types'
import { displayedCodex, formatLimitWindow } from '../shared/usageDisplay'

const MINUTE = 60_000

/** Run-out warnings wait for this much use, so an early burst in a fresh window doesn't alert. */
const RUN_OUT_MIN_PERCENT = 30

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Whether `now` falls inside the quiet hours; a range like 22:00–08:00 runs past midnight. */
export const isQuiet = (quiet: QuietHours, now: number): boolean => {
  if (!quiet.enabled) return false
  const from = minutesOf(quiet.from)
  const to = minutesOf(quiet.to)
  if (from === null || to === null || from === to) return false
  const d = new Date(now)
  const minute = d.getHours() * 60 + d.getMinutes()
  return from < to ? minute >= from && minute < to : minute >= from || minute < to
}

/** A wait is one stretch of a session waiting: the same session waiting again is a new wait. */
export const waitKey = (s: Session): string => `${s.id}:${s.statusSince}`

/** Waiting sessions the user has not snoozed. */
export const needsYou = (s: Session): boolean => s.status === 'waiting' && !s.snoozedUntil

/**
 * Waits to alert about now, and when the next one comes due (null: none pending). A wait is
 * due once it has lasted `afterMinutes`; `alerted` holds the waits already handled.
 */
export const dueWaits = (sessions: Session[], alerted: ReadonlySet<string>, afterMinutes: number, now: number) => {
  const due: Session[] = []
  let next: number | null = null
  for (const s of sessions) {
    if (!needsYou(s) || alerted.has(waitKey(s))) continue
    const at = s.statusSince + afterMinutes * MINUTE
    if (at <= now) due.push(s)
    else next = Math.min(next ?? at, at)
  }
  return { due, next }
}

export interface LimitWarning {
  /** Stays the same for one limit window, so each warning is shown once. */
  key: string
  title: string
  body: string
}

interface NamedWindow {
  name: string
  window: LimitWindow
  lengthMs: number
}

const windowsOf = (settings: Settings, snapshot: Pick<Snapshot, 'limits' | 'codex'>): NamedWindow[] => {
  const named: NamedWindow[] = []
  const limits = settings.usageProviders.claude ? snapshot.limits : null
  if (limits?.session) named.push({ name: 'Claude 5-hour limit', window: limits.session, lengthMs: SESSION_WINDOW_MS })
  if (limits?.week) named.push({ name: 'Claude weekly limit', window: limits.week, lengthMs: WEEK_WINDOW_MS })
  for (const w of displayedCodex(settings.usageProviders, snapshot.codex)?.windows ?? []) {
    const name = w.durationMinutes === 10_080 ? 'Codex weekly limit' : `Codex ${formatLimitWindow(w.durationMinutes)} limit`
    named.push({ name, window: w, lengthMs: w.durationMinutes * MINUTE })
  }
  return named
}

const clock = (at: number, now: number): string => {
  const d = new Date(at)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date(now).toDateString() ? time : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`
}

/** Limit warnings that apply now and have not been shown for their window yet. */
export const limitWarnings = (
  settings: Settings, snapshot: Pick<Snapshot, 'limits' | 'codex'>, shown: ReadonlySet<string>, now: number,
): LimitWarning[] => {
  const warnings: LimitWarning[] = []
  for (const { name, window, lengthMs } of windowsOf(settings, snapshot)) {
    const id = `${name}:${window.resetsAt ?? window.resetsText}`
    const reset = formatReset(window, now)
    const resetText = reset ? (window.resetsAt && window.resetsAt - now < 86_400_000 ? `in ${reset}` : reset) : ''
    const threshold = settings.limitWarnPercent
    const overKey = `over:${threshold}:${id}`
    // Past the threshold the run-out forecast would only repeat the same news.
    if (threshold > 0 && window.percent >= threshold) {
      if (!shown.has(overKey)) {
        warnings.push({ key: overKey, title: `${name} at ${window.percent}%`, body: resetText ? `It resets ${resetText}.` : 'It resets soon.' })
      }
      continue
    }
    const runOutKey = `runout:${id}`
    if (settings.warnRunOut && window.percent >= RUN_OUT_MIN_PERCENT && window.percent < 100 && !shown.has(runOutKey)) {
      const exhaustsAt = forecastLimit(window, lengthMs, now)?.exhaustsAt
      if (exhaustsAt) {
        warnings.push({
          key: runOutKey,
          title: `${name} may run out`,
          body: `At this pace it runs out ${clock(exhaustsAt, now)}${resetText ? `, before it resets ${resetText}` : ''}. It is at ${window.percent}% now.`,
        })
      }
    }
  }
  return warnings
}
