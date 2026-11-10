import { useState } from 'react'
import type { SessionStatus } from '../../core/types'
import type { PanelState } from '../../shared/types'
import { formatAge, formatReset, groupSessions, limitLevel, statusLabel } from './format'
import { CompactSize } from './CompactSize'
import { IconMenu, IconSize, IconVertical, Logo, StatusIcon } from './icons'
import { BlockedBadge, CodexLimitBars, LimitBars, SessionDetail, SessionRow, type ViewProps } from './parts'

type Drawer = { kind: 'session', id: string } | { kind: 'group', status: SessionStatus } | { kind: 'size' } | null

const StripButtons = ({ sizing, toggleSizing }: { sizing: boolean, toggleSizing: () => void }) => (
  <>
    <button className={`icon-btn ${sizing ? 'icon-btn-on' : ''}`} aria-label="Compact size" aria-expanded={sizing} title="Compact size" onClick={toggleSizing}><IconSize /></button>
    <button className="icon-btn" aria-label="Switch to vertical" title="Vertical" onClick={() => window.pulse.setSettings({ layout: 'vertical' })}><IconVertical /></button>
    <button className="icon-btn" aria-label="Menu" title="Menu" onClick={() => window.pulse.showMenu()}><IconMenu /></button>
  </>
)

/** Horizontal mode: chips, status segments or a thin ticker, with a drawer for details. */
export const Strip = (props: ViewProps & { panel: PanelState }) => {
  const { sessions, limits, codex, gauges, attention, settings, now, open, panel } = props
  const [drawer, setDrawer] = useState<Drawer>(null)
  const groups = groupSessions(sessions)
  const active = [...groups.waiting, ...groups.busy, ...groups.finished]
  const quiet = groups.idle.length + groups.ended.length
  const style = settings.horizontalStyle
  const drawerSession = drawer?.kind === 'session' ? sessions.find(s => s.id === drawer.id) : undefined
  const sizing = drawer?.kind === 'size'
  const sizeButton = { sizing, toggleSizing: () => setDrawer(sizing ? null : { kind: 'size' }) }
  const drawerGroup = drawer?.kind === 'group' ? (drawer.status === 'idle' ? [...groups.idle, ...groups.ended] : groups[drawer.status]) : undefined
  const claudeBars = <LimitBars limits={limits} now={now} compact pace={settings.features.paceForecast} />
  const limitBars = codex
    ? (
        <>
          {settings.usageProviders.claude && (
            <div className="strip-limit-provider"><span className="muted">Claude</span>{claudeBars}</div>
          )}
          <div className="strip-limit-provider"><span className="muted">Codex</span><CodexLimitBars codex={codex} now={now} compact /></div>
        </>
      )
    : settings.usageProviders.claude && claudeBars

  let bar
  if (style === 'ticker') {
    bar = (
      <div className="strip strip-ticker" style={{ maxWidth: panel.maxWidth }}>
        <Logo size={11} />
        {gauges.map(({ provider, period, window }) => (
          <span key={`${provider}-${period}`} className="nowrap">
            <span className="muted">{codex && `${provider} `}{period}</span>{' '}
            <span className={window ? `lvl-${limitLevel(window.percent)}-text` : ''}>{window ? `${window.percent}%` : '–'}</span>{' '}
            <span className="muted">{window?.resetsAt || window?.resetsText ? `↻${formatReset(window, now)}` : ''}</span>
          </span>
        ))}
        {gauges.length > 0 && <span className="sep-v" />}
        {active.map(s => (
          <button key={s.id} className="tick" onClick={() => open(s.id)} title={`${statusLabel[s.status]}: ${s.title}`}>
            <StatusIcon status={s.status} theme={settings.theme} size={12} />
            <span className="ellipsis">{s.title}</span>
          </button>
        ))}
        {quiet > 0 && <span className="muted nowrap">+{quiet}</span>}
        <span className="grow" />
        <BlockedBadge attention={attention} settings={settings} />
        <StripButtons {...sizeButton} />
      </div>
    )
  } else if (style === 'segments') {
    const segment = (status: SessionStatus, label: string, count: number) => (
      <button
        key={status}
        className={`segment ${drawer?.kind === 'group' && drawer.status === status ? 'segment-on' : ''}`}
        onMouseEnter={() => count && setDrawer({ kind: 'group', status })}
        onClick={() => count && setDrawer({ kind: 'group', status })}
      >
        <StatusIcon status={status} theme={settings.theme} size={13} />
        <span className="num">{count}</span>
        <span className="muted">{label}</span>
      </button>
    )
    bar = (
      <div className="strip strip-segments" style={{ maxWidth: panel.maxWidth }}>
        <span className="drag-handle"><Logo /></span>
        {limitBars}
        <button
          className={`segment segment-waiting ${groups.waiting.length ? 'has-waiting' : ''}`}
          onMouseEnter={() => groups.waiting.length && setDrawer({ kind: 'group', status: 'waiting' })}
          onClick={() => groups.waiting[0] && open(groups.waiting[0].id)}
        >
          <StatusIcon status="waiting" theme={settings.theme} size={13} />
          <span className="num">{groups.waiting.length}</span>
          <span className="ellipsis">
            {groups.waiting.length
              ? groups.waiting.map(s => `${s.title} (${formatAge(s.statusSince, now)})`).join(' · ')
              : <span className="muted">nothing needs you</span>}
          </span>
        </button>
        {segment('busy', 'running', groups.busy.length)}
        {segment('finished', 'done', groups.finished.length)}
        {segment('idle', 'idle', quiet)}
        <BlockedBadge attention={attention} settings={settings} />
        <StripButtons {...sizeButton} />
      </div>
    )
  } else {
    bar = (
      <div className="strip strip-chips" style={{ maxWidth: panel.maxWidth }}>
        <span className="drag-handle"><Logo /></span>
        {limitBars && <>{limitBars}<span className="sep-v" /></>}
        <div className="chips">
          {active.map(s => (
            <button
              key={s.id}
              className={`chip st-chip-${s.status}`}
              onClick={() => open(s.id)}
              onMouseEnter={() => setDrawer({ kind: 'session', id: s.id })}
            >
              <StatusIcon status={s.status} theme={settings.theme} size={14} />
              <span className={`ellipsis ${s.status === 'finished' ? 'bold' : ''}`}>{s.title}</span>
              <span className="muted num">{formatAge(s.statusSince, now)}</span>
            </button>
          ))}
          {active.length === 0 && <span className="muted chip-empty">All quiet</span>}
        </div>
        {quiet > 0 && (
          <button className="chip chip-more muted" onMouseEnter={() => setDrawer({ kind: 'group', status: 'idle' })}>+{quiet} idle</button>
        )}
        <BlockedBadge attention={attention} settings={settings} />
        <StripButtons {...sizeButton} />
      </div>
    )
  }

  const below = !panel.edges.includes('bottom')
  const drawerNode = sizing || ((drawerSession || drawerGroup?.length) && style !== 'ticker')
    ? (
        <div className="drawer">
          {sizing && <CompactSize {...props} />}
          {drawerSession && <SessionDetail s={drawerSession} settings={settings} now={now} open={open} />}
          {drawerGroup?.map(s => <SessionRow key={s.id} s={s} settings={{ ...settings, density: 'compact' }} now={now} open={open} />)}
        </div>
      )
    : null

  return (
    <div className={`strip-wrap ${below ? '' : 'strip-wrap-up'}`} onMouseLeave={() => setDrawer(null)}>
      {bar}
      {drawerNode}
    </div>
  )
}
