import { useState } from 'react'
import { RUNNING_MARK, type PanelState } from '../../shared/types'
import { groupSessions, statusLabel } from './format'
import { IconChevron, IconHorizontal, IconMenu, IconPin, Logo } from './icons'
import { LimitBars, SessionRow, Totals, type ViewProps } from './parts'

const ACTIVE = ['waiting', 'busy', 'finished'] as const

export const VerticalPanel = (props: ViewProps & { panel: PanelState }) => {
  const { sessions, limits, totals, attention, settings, now, open, panel } = props
  const [showIdle, setShowIdle] = useState(false)
  const groups = groupSessions(sessions)
  const quiet = [...groups.idle, ...groups.ended]

  return (
    <div className="vpanel" style={{ maxHeight: panel.maxHeight }}>
      <div className="header">
        <Logo />
        <span className="app-title">{settings.theme === 'terminal' ? 'agent-pulse' : 'Agent Pulse'}</span>
        {settings.theme === 'terminal' && (
          <span className="muted counts">{groups.waiting.length}! {groups.busy.length}{RUNNING_MARK} {groups.finished.length}✓</span>
        )}
        <button className="icon-btn" aria-label="Switch to horizontal" title="Horizontal" onClick={() => window.pulse.setSettings({ layout: 'horizontal' })}><IconHorizontal /></button>
        <button
          className="icon-btn"
          aria-label={settings.collapseToPill ? 'Keep expanded' : 'Rest as pill'}
          title={settings.collapseToPill ? 'Keep expanded' : 'Rest as pill'}
          onClick={() => window.pulse.setSettings({ collapseToPill: !settings.collapseToPill })}
        ><IconPin on={!settings.collapseToPill} />
        </button>
        <button className="icon-btn" aria-label="Menu" title="Menu" onClick={() => window.pulse.showMenu()}><IconMenu /></button>
      </div>
      <LimitBars limits={limits} now={now} pace={settings.features.paceForecast} />
      <div className="groups">
        {ACTIVE.map(status => groups[status].length > 0 && (
          <section key={status}>
            <div className="section-title">{settings.theme === 'terminal' ? `// ${statusLabel[status].toUpperCase()}` : `${statusLabel[status]} · ${groups[status].length}`}</div>
            {groups[status].map(s => <SessionRow key={s.id} s={s} settings={settings} now={now} open={open} />)}
          </section>
        ))}
        {sessions.length === 0 && <div className="empty muted">No Claude sessions running</div>}
        {quiet.length > 0 && (
          <button className="row row-toggle muted" onClick={() => setShowIdle(v => !v)} aria-expanded={showIdle}>
            <span className="ttl">
              {groups.idle.length} idle{groups.ended.length ? ` · ${groups.ended.length} ended today` : ''}
            </span>
            <IconChevron open={showIdle} />
          </button>
        )}
        {showIdle && quiet.map(s => <SessionRow key={s.id} s={s} settings={settings} now={now} open={open} />)}
      </div>
      <Totals totals={totals} attention={attention} settings={settings} />
    </div>
  )
}
