import type { Session } from '../../core/types'
import type { Orientation, Theme } from '../../shared/types'
import type { UsageGauge } from '../../shared/usageDisplay'
import { formatAge, groupSessions, limitLevel } from './format'
import { Ring, StatusIcon } from './icons'

interface PillProps {
  sessions: Session[]
  gauges: UsageGauge[]
  theme: Theme
  orientation: Orientation
  now: number
  open: (id: string) => void
  /** Zoom of the whole pill (sizes, gaps and text), from the compact-size setting. */
  scale: number
}

/** How long the waiting glow keeps pulsing. */
const GLOW_MS = 20_000

/** Resting state: status counts and limit gauges; glows when a session needs input. */
export const Pill = ({ sessions, gauges, theme, orientation, now, open, scale }: PillProps) => {
  const groups = groupSessions(sessions)
  const waiting = groups.waiting.filter(s => !s.snoozedUntil)
  const newest = [...waiting].sort((a, b) => b.statusSince - a.statusSince)[0]
  const counts = [
    { status: 'waiting' as const, n: waiting.length },
    { status: 'busy' as const, n: groups.busy.length },
    { status: 'finished' as const, n: groups.finished.length },
  ].filter(c => c.n > 0)
  const labeled = gauges.some(gauge => gauge.provider === 'Codex')
  // The glow moves only for a short while after a session starts waiting, then holds still.
  const steady = newest !== undefined && now - newest.statusSince > GLOW_MS

  return (
    <div className={`pill pill-${orientation} ${waiting.length ? 'pill-alert' : ''} ${steady ? 'pill-alert-steady' : ''}`} style={{ zoom: scale }}>
      {gauges.map(({ provider, window, period }) => {
        const key = `${provider}-${period}`
        const percent = window?.percent ?? null
        const level = window ? limitLevel(window.percent) : 'ok'
        const gauge = theme === 'glass'
          ? <Ring percent={percent} level={level} size={orientation === 'vertical' ? 28 : 22} labeled={labeled} />
          : <span className={`num lvl-${level}-text`}>{percent === null ? '–' : `${percent}%`}</span>
        if (labeled) {
          return (
            <div key={key} className={`pill-provider provider-${provider.toLowerCase()}`}>
              <span className="pill-provider-name">{provider}</span>
              {gauge}
              {period && <span className="pill-period muted">{period}</span>}
            </div>
          )
        }
        return (
          <span key={key} className="pill-limit">
            {theme === 'terminal' && <span className="muted">{period}</span>}
            {gauge}
          </span>
        )
      })}
      {gauges.length > 0 && <span className="pill-sep" />}
      {counts.length === 0 && <span className="muted pill-quiet">{orientation === 'vertical' ? '·' : 'quiet'}</span>}
      {counts.map(c => (
        <span key={c.status} className="pill-count">
          <StatusIcon status={c.status} theme={theme} size={14} />
          <span className="num">{c.n}</span>
        </span>
      ))}
      {orientation === 'horizontal' && newest && (
        <button className="pill-peek" onClick={() => open(newest.id)}>
          <b className="ellipsis">{newest.title}</b>
          <span className="muted">needs input · {formatAge(newest.statusSince, now)}</span>
        </button>
      )}
    </div>
  )
}
