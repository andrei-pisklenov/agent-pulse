import { forecastLimit, SESSION_WINDOW_MS, WEEK_WINDOW_MS } from '../../core/forecast'
import type { AttentionStats, LimitWindow, Limits, Session, UsageTotals } from '../../core/types'
import type { Settings } from '../../shared/types'
import {
  formatAge, formatClock, formatDuration, formatReset, formatTokens, limitLevel, shortModel, sourceLabel, statusLabel, tokenValue,
} from './format'
import { IconClose, IconSnooze, SourceIcon, StatusIcon } from './icons'

export interface ViewProps {
  sessions: Session[]
  limits: Limits | null
  totals: UsageTotals
  attention: AttentionStats
  settings: Settings
  now: number
  open: (id: string) => void
}

const SNOOZE_MINUTES = 15

/** "runs out 23:50" when the current pace hits the limit before the reset, else "~84% at reset". */
const paceOf = (window: LimitWindow | null | undefined, lengthMs: number, now: number) => {
  const f = forecastLimit(window ?? null, lengthMs, now)
  if (!f) return null
  return f.exhaustsAt
    ? { warn: true, text: `runs out ${formatClock(f.exhaustsAt, now)}`, hint: `At this pace the limit runs out at ${formatClock(f.exhaustsAt, now)}. Stay under ${f.safePerHour.toFixed(1)}%/h to last until the reset.` }
    : { warn: false, text: `~${f.projectedPercent}% at reset`, hint: `At this pace you reach about ${f.projectedPercent}% by the reset.` }
}

/** Session and weekly bars. `compact` puts them in one tight grid for strips. */
export const LimitBars = ({ limits, now, compact, pace }: { limits: Limits | null, now: number, compact?: boolean, pace?: boolean }) => {
  const rows = [
    { label: compact ? '5h' : 'Session', window: limits?.session, length: SESSION_WINDOW_MS },
    { label: compact ? 'wk' : 'Week', window: limits?.week, length: WEEK_WINDOW_MS },
  ]
  return (
    <div className={compact ? 'limits limits-compact' : 'limits'} title={limits?.error ? `Last refresh failed: ${limits.error}` : undefined}>
      {rows.map(({ label, window, length }) => {
        const level = window ? limitLevel(window.percent) : 'ok'
        const forecast = pace ? paceOf(window, length, now) : null
        return (
          <div className="limit-row" key={label} title={forecast?.hint}>
            <span className="muted">{label}</span>
            <div className="bar"><div className={`bar-fill lvl-${level}`} style={{ width: `${window?.percent ?? 0}%` }} /></div>
            <span className={`pct lvl-${level}-text`}>
              {window ? `${window.percent}%` : '–'}
              {compact && forecast?.warn && <span className="pace-warn"> ⚠</span>}
            </span>
            <span className="muted num">{window ? `↻ ${formatReset(window, now)}` : ''}</span>
            {!compact && forecast && <span className={`pace ${forecast.warn ? 'pace-warn' : 'muted'}`}>{forecast.text}</span>}
          </div>
        )
      })}
    </div>
  )
}

export const Totals = ({ totals, attention, settings }: { totals: UsageTotals, attention: AttentionStats, settings: Settings }) => (
  <div className="totals muted num">
    <div className="totals-row">
      <span>Today {formatTokens(tokenValue(totals.today, settings.tokenMetric))} tok</span>
      <span>This week {formatTokens(tokenValue(totals.week, settings.tokenMetric))} tok</span>
    </div>
    {settings.features.blockedTime && attention.waits > 0 && (
      <div className="totals-row" title={`${attention.waits} times a session waited for you today`}>
        <span>Waited on you {formatDuration(attention.blockedMs)} today</span>
        <span>longest {formatDuration(attention.longestMs)}</span>
      </div>
    )}
  </div>
)

/** Compact "waited 49m" for strips. */
export const BlockedBadge = ({ attention, settings }: { attention: AttentionStats, settings: Settings }) =>
  settings.features.blockedTime && attention.waits > 0
    ? <span className="muted num nowrap blocked" title={`Sessions waited on you ${formatDuration(attention.blockedMs)} today (longest ${formatDuration(attention.longestMs)})`}>⏳{formatDuration(attention.blockedMs)}</span>
    : null

const tooltip = (s: Session, settings: Settings) => [
  s.title,
  `${statusLabel[s.status]}${s.waitingFor ? `: ${s.waitingFor}` : ''}`,
  ...(settings.features.pendingQuestion && s.pendingPrompt ? [`“${s.pendingPrompt}”`] : []),
  `${s.project} · ${sourceLabel[s.source]}${shortModel(s.model) ? ` · ${shortModel(s.model)}` : ''}`,
  `${formatTokens(tokenValue(s.tokens, settings.tokenMetric))} tokens (${formatTokens(s.tokens.cacheRead)} cache reads)`,
].join('\n')

const SnoozeButton = ({ s, now }: { s: Session, now: number }) => {
  if (s.status !== 'waiting') return null
  const label = s.snoozedUntil ? `Snoozed for ${formatDuration(s.snoozedUntil - now)}, click to wake` : `Snooze ${SNOOZE_MINUTES} min`
  return (
    <button
      className={`icon-btn row-action snooze ${s.snoozedUntil ? 'snooze-on' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => window.pulse.snooze(s.id, s.snoozedUntil ? 0 : SNOOZE_MINUTES)}
    >
      <IconSnooze />
    </button>
  )
}

/** Clears a finished session from the list without opening it. */
const DismissButton = ({ s }: { s: Session }) => s.status === 'finished'
  ? (
      <button className="icon-btn row-action" aria-label="Dismiss" title="Dismiss" onClick={() => window.pulse.markRead(s.id)}>
        <IconClose />
      </button>
    )
  : null

interface RowProps {
  s: Session
  settings: Settings
  now: number
  open: (id: string) => void
}

/** One session in a list. Comfortable rows add project, source and age, plus the pending question. */
export const SessionRow = ({ s, settings, now, open }: RowProps) => {
  const snoozed = !!s.snoozedUntil
  const age = s.status === 'waiting'
    ? (snoozed ? `snoozed · ${formatDuration(s.snoozedUntil! - now)} left` : `waiting ${formatAge(s.statusSince, now)}`)
    : s.status === 'busy' ? formatAge(s.startedAt, now) : `${formatAge(s.statusSince, now)} ago`
  const tokens = formatTokens(tokenValue(s.tokens, settings.tokenMetric))
  const ask = settings.features.pendingQuestion && s.status === 'waiting' ? s.pendingPrompt : null
  const action = settings.features.pendingQuestion && s.status === 'waiting' ? <SnoozeButton s={s} now={now} /> : <DismissButton s={s} />
  const classes = `st-row-${s.status} ${snoozed ? 'st-row-snoozed' : ''}`

  if (settings.density === 'compact') {
    return (
      <div className="row-wrap">
        <button className={`row row-compact ${classes}`} onClick={() => open(s.id)} title={tooltip(s, settings)}>
          <StatusIcon status={s.status} theme={settings.theme} size={14} />
          <span className="ttl">
            {s.source !== 'desktop' && <span className="muted src-tag">{s.source === 'vscode' ? 'vsc' : 'tty'} </span>}
            {s.title}
          </span>
          <span className="muted num right">{formatAge(s.statusSince, now)}</span>
          <span className="muted num right">{tokens}</span>
        </button>
        {action}
      </div>
    )
  }
  return (
    <div className="row-wrap">
      <button className={`row ${classes}`} onClick={() => open(s.id)} title={tooltip(s, settings)}>
        <StatusIcon status={s.status} theme={settings.theme} />
        <span className="row-main">
          <span className="ttl">{s.title}</span>
          <span className="sub muted">
            <SourceIcon source={s.source} />
            <span className="ellipsis">{s.project}{s.source === 'desktop' ? '' : ` · ${sourceLabel[s.source]}`} · {age}</span>
          </span>
          {ask && <span className="ask">{ask}</span>}
        </span>
        <span className="muted num right">{tokens}</span>
      </button>
      {action}
    </div>
  )
}

/** Full detail for one session (horizontal drawer). */
export const SessionDetail = ({ s, settings, now, open }: RowProps) => {
  const ask = settings.features.pendingQuestion ? s.pendingPrompt : null
  return (
    <div className="detail">
      <div className={`detail-status st-text-${s.status}`}>
        <StatusIcon status={s.status} theme={settings.theme} size={14} />
        {statusLabel[s.status]} · {formatAge(s.statusSince, now)}
        {s.snoozedUntil && <span className="muted"> · snoozed {formatDuration(s.snoozedUntil - now)}</span>}
      </div>
      <div className="detail-title">{s.title}</div>
      <div className="muted detail-meta">
        {s.project} · {sourceLabel[s.source]}{shortModel(s.model) ? ` · ${shortModel(s.model)}` : ''}
        <br />
        {formatTokens(tokenValue(s.tokens, settings.tokenMetric))} tokens · {formatTokens(s.tokens.output)} out
        {' · '}{formatTokens(s.tokens.cacheRead)} cache reads · started {formatAge(s.startedAt, now)} ago
      </div>
      {(ask ?? s.waitingFor) && <div className="detail-quote">{ask ?? s.waitingFor}</div>}
      <div className="detail-actions">
        <button className="btn btn-primary" onClick={() => open(s.id)}>Open session</button>
        {s.status === 'finished' && <button className="btn btn-plain" onClick={() => window.pulse.markRead(s.id)}>Dismiss</button>}
        {ask && s.status === 'waiting' && (
          <button className="btn btn-plain" onClick={() => window.pulse.snooze(s.id, s.snoozedUntil ? 0 : SNOOZE_MINUTES)}>
            {s.snoozedUntil ? 'Wake' : `Snooze ${SNOOZE_MINUTES}m`}
          </button>
        )}
      </div>
    </div>
  )
}
