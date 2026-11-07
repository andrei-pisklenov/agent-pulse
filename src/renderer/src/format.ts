import type { Session, SessionStatus, TokenCounts } from '../../core/types'
import type { TokenMetric } from '../../shared/types'

export const tokenValue = (t: TokenCounts, metric: TokenMetric): number =>
  t.input + t.output + t.cacheWrite + (metric === 'all' ? t.cacheRead : 0)

export const formatTokens = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k`
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e8 ? 1 : 0)}M`
  return `${(n / 1e9).toFixed(1)}B`
}

/** "now", "4m", "2h", "3d". */
export const formatAge = (since: number, now: number): string => {
  const s = Math.max(0, (now - since) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** "23:50" today, "Thu 11:40" on another day. */
export const formatClock = (at: number, now: number): string => {
  const d = new Date(at)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date(now).toDateString() ? time : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`
}

/** "12m", "1h 05m". */
export const formatDuration = (ms: number): string => {
  const mins = Math.max(0, Math.round(ms / 60000))
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

// Shared with the main process's menu, so it lives in core.
export { formatReset } from '../../core/forecast'

/** Neutral below 60%, amber up to 85%, red above. */
export const limitLevel = (percent: number): 'ok' | 'warn' | 'high' =>
  percent >= 85 ? 'high' : percent >= 60 ? 'warn' : 'ok'

export const statusLabel: Record<SessionStatus, string> = {
  waiting: 'Needs input',
  busy: 'Running',
  finished: 'Finished',
  idle: 'Idle',
  ended: 'Ended',
}

export const sourceLabel: Record<Session['source'], string> = {
  desktop: 'Desktop app',
  vscode: 'VS Code',
  cli: 'Terminal',
}

export const shortModel = (model: string | null): string | null => {
  if (!model) return null
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : model
}

export interface Groups {
  waiting: Session[]
  busy: Session[]
  finished: Session[]
  idle: Session[]
  ended: Session[]
}

export const groupSessions = (sessions: Session[]): Groups => {
  const groups: Groups = { waiting: [], busy: [], finished: [], idle: [], ended: [] }
  for (const s of sessions) groups[s.status].push(s)
  return groups
}
