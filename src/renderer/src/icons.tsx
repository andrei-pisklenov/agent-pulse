import type { Session, SessionStatus } from '../../core/types'
import { RUNNING_MARK, type Theme } from '../../shared/types'
import { statusLabel } from './format'

const GLYPH: Record<SessionStatus, string> = { waiting: '!', busy: RUNNING_MARK, finished: '✓', idle: '·', ended: '·' }

export const StatusIcon = ({ status, theme, size = 16 }: { status: SessionStatus, theme: Theme, size?: number }) => {
  if (theme === 'terminal') {
    return <span className={`glyph st-${status}`} role="img" aria-label={statusLabel[status]}>{GLYPH[status]}</span>
  }
  const common = { 'width': size, 'height': size, 'viewBox': '0 0 14 14', 'role': 'img', 'aria-label': statusLabel[status] }
  switch (status) {
    case 'waiting':
      return <span className="icon-alert pulse" role="img" aria-label={statusLabel[status]} style={{ width: size, height: size, fontSize: size * 0.72 }}>!</span>
    case 'busy':
      return <span className="icon-spinner" role="img" aria-label={statusLabel[status]} style={{ width: size, height: size }} />
    case 'finished':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="var(--done)" />
          <path d="M4.2 7.2 6 9l3.8-3.9" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5" fill="none" stroke="var(--idle)" strokeWidth="1.5" strokeDasharray={status === 'ended' ? '2 2' : undefined} />
        </svg>
      )
  }
}

export const SourceIcon = ({ source }: { source: Session['source'] }) => {
  const props = { 'width': 11, 'height': 11, 'viewBox': '0 0 14 14', 'fill': 'none', 'stroke': 'currentColor', 'strokeWidth': 1.3, 'strokeLinecap': 'round', 'strokeLinejoin': 'round', 'aria-hidden': true } as const
  if (source === 'vscode') return <svg {...props}><path d="M4.5 4 1.5 7l3 3M9.5 4l3 3-3 3" /></svg>
  if (source === 'cli') return <svg {...props}><rect x="1.5" y="2" width="11" height="10" rx="1.5" /><path d="M4 5.5 6 7 4 8.5M7.5 9H10" /></svg>
  return <svg {...props}><rect x="1.5" y="2" width="11" height="7.5" rx="1.5" /><path d="M5 12h4M7 9.5V12" /></svg>
}

export const Logo = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
    <circle cx="6" cy="6" r="5" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    <path d="M3.5 6h1.3l.9-2 1.3 4 .9-2h1.6" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const iconProps = { 'width': 13, 'height': 13, 'viewBox': '0 0 14 14', 'fill': 'none', 'stroke': 'currentColor', 'strokeWidth': 1.3, 'strokeLinecap': 'round', 'aria-hidden': true } as const

export const IconHorizontal = () => <svg {...iconProps}><rect x="1.5" y="4" width="11" height="6" rx="1.5" /></svg>
export const IconVertical = () => <svg {...iconProps}><rect x="4" y="1.5" width="6" height="11" rx="1.5" /></svg>
export const IconPin = ({ on }: { on: boolean }) => (
  <svg {...iconProps} fill={on ? 'currentColor' : 'none'}><path d="M5 1.5h4l-.6 4 2.1 2H3.5l2.1-2zM7 7.5v5" /></svg>
)
export const IconMenu = () => <svg {...iconProps}><circle cx="3" cy="7" r=".6" /><circle cx="7" cy="7" r=".6" /><circle cx="11" cy="7" r=".6" /></svg>
export const IconSnooze = () => (
  <svg {...iconProps}><circle cx="7" cy="7.5" r="5" /><path d="M7 4.8v2.9l1.8 1.1M2.5 2.5l1.6-1M11.5 2.5l-1.6-1" /></svg>
)
export const IconClose = () => <svg {...iconProps}><path d="m4 4 6 6M10 4l-6 6" /></svg>
export const IconSearch = () => <svg {...iconProps}><circle cx="6" cy="6" r="4.2" /><path d="m9.2 9.2 3.3 3.3" /></svg>
export const IconChevron = ({ open }: { open: boolean }) => (
  <svg {...iconProps} style={{ transform: open ? 'rotate(90deg)' : undefined }}><path d="m5 3 4 4-4 4" /></svg>
)

/** Small ring gauge for the pill. */
export const Ring = ({ percent, size = 26, level, labeled = false }: {
  percent: number | null
  size?: number
  level: string
  labeled?: boolean
}) => {
  const r = 11
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" role="img" aria-label={percent === null ? 'Unavailable' : `${percent}% used`}>
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--track)" strokeWidth="3" />
      {percent !== null && percent > 0 && (
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke={`var(--provider-color, var(--lvl-${level}))`}
          strokeWidth="3"
          strokeDasharray={`${(c * percent) / 100} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
      )}
      <text x="14" y={labeled ? '16.5' : '17.5'} textAnchor="middle" fontSize={labeled ? '7' : '9'} fontWeight="700" fill={`var(--lvl-${level}-text)`}>
        {percent === null ? '–' : labeled ? `${percent}%` : percent}
      </text>
    </svg>
  )
}
