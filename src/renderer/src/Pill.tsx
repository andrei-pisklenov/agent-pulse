import type { Limits, Session } from '../../core/types'
import type { Orientation, Theme } from '../../shared/types'
import { formatAge, groupSessions, limitLevel } from './format'
import { Ring, StatusIcon } from './icons'

interface PillProps {
  sessions: Session[]
  limits: Limits | null
  theme: Theme
  orientation: Orientation
  now: number
  open: (id: string) => void
}

/** Resting state: status counts and limit gauges; glows when a session needs input. */
export const Pill = ({ sessions, limits, theme, orientation, now, open }: PillProps) => {
  const groups = groupSessions(sessions)
  const waiting = groups.waiting.filter(s => !s.snoozedUntil)
  const newest = [...waiting].sort((a, b) => b.statusSince - a.statusSince)[0]
  const counts = [
    { status: 'waiting' as const, n: waiting.length },
    { status: 'busy' as const, n: groups.busy.length },
    { status: 'finished' as const, n: groups.finished.length },
  ].filter(c => c.n > 0)
  const gauges = [limits?.session, limits?.week].map((w, i) => ({ w, key: i ? 'wk' : '5h' }))

  return (
    <div className={`pill pill-${orientation} ${waiting.length ? 'pill-alert' : ''}`}>
      {gauges.map(({ w, key }) => (
        theme === 'glass'
          ? <Ring key={key} percent={w?.percent ?? 0} level={w ? limitLevel(w.percent) : 'ok'} size={orientation === 'vertical' ? 28 : 22} />
          : (
              <span key={key} className="pill-limit num">
                <span className="muted">{key === 'wk' ? '7d' : '5h'}</span>
                <span className={w ? `lvl-${limitLevel(w.percent)}-text` : ''}>{w ? `${w.percent}%` : '–'}</span>
              </span>
            )
      ))}
      <span className="pill-sep" />
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
