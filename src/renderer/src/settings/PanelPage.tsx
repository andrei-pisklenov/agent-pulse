import type { Session } from '../../../core/types'
import { COMPACT_SCALE, type PanelState, type Settings, type Theme } from '../../../shared/types'
import type { UsageGauge } from '../../../shared/usageDisplay'
import { compactScale, pillThickness } from '../CompactSize'
import { Pill } from '../Pill'
import { Group, icons, PageHeader, Row, save, Segmented, Select, Switch, Tile } from './ui'

export const ThemeChoices = ({ theme, onChange }: { theme: Theme, onChange: (theme: Theme) => void }) => (
  <div className="s-choices two" role="radiogroup" aria-label="Panel theme">
    <button type="button" role="radio" aria-checked={theme === 'glass'} className={`s-choice${theme === 'glass' ? ' selected' : ''}`} onClick={() => onChange('glass')}>
      <span className="s-thumb" aria-hidden="true">
        <span className="s-mini glass">
          <span className="s-mini-line"><b style={{ background: '#ff9f0a' }} /><i style={{ width: 70 }} /></span>
          <span className="s-mini-line"><b style={{ background: '#0a84ff' }} /><i style={{ width: 54 }} /></span>
          <span className="s-mini-line"><b style={{ background: '#34c759' }} /><i style={{ width: 62 }} /></span>
        </span>
      </span>
      Glass
    </button>
    <button type="button" role="radio" aria-checked={theme === 'terminal'} className={`s-choice${theme === 'terminal' ? ' selected' : ''}`} onClick={() => onChange('terminal')}>
      <span className="s-thumb" aria-hidden="true">
        <span className="s-mini terminal"><span>! fix-login-redirect</span><span>▶ pill-sizing</span><span>✓ codex-limits</span></span>
      </span>
      Terminal HUD
    </button>
  </div>
)

export const PanelPage = ({ settings, panel, sessions, gauges, now }: {
  settings: Settings
  panel: PanelState
  sessions: Session[]
  gauges: UsageGauge[]
  now: number
}) => {
  const base = pillThickness(settings, panel.orientation)
  const scale = compactScale(settings, panel)
  const matching = settings.compactMatchDock && panel.dockSize !== null
  const px = Math.round(base * scale)
  return (
    <>
      <PageHeader tile={<Tile color="#0a6cdc">{icons.panel}</Tile>} title="Panel" subtitle="The always-on-top panel at the edge of your screen." />

      <Group title="Look">
        <ThemeChoices theme={settings.theme} onChange={theme => save({ theme })} />
        <Row label="Rows">
          <Segmented
            label="Rows"
            options={[{ value: 'comfortable', label: 'Two lines' }, { value: 'compact', label: 'One line' }]}
            value={settings.density}
            onChange={density => save({ density })}
          />
        </Row>
        <Row label="Strip style" hint="When the panel sits at the top or bottom">
          <Select
            label="Strip style"
            options={[
              { value: 'chips', label: 'Chips with details' },
              { value: 'segments', label: 'Status segments' },
              { value: 'ticker', label: 'Thin ticker' },
            ]}
            value={settings.horizontalStyle}
            onChange={horizontalStyle => save({ horizontalStyle })}
          />
        </Row>
      </Group>

      <Group title="At rest">
        <Row label="Rest as a pill, expand on hover">
          <Switch label="Rest as a pill" checked={settings.collapseToPill} onChange={collapseToPill => save({ collapseToPill })} />
        </Row>
        <Row label="Match the Dock’s size" hint={panel.dockSize === null ? 'The Dock is hidden, so the size below is used' : `Follows the Dock, ${panel.dockSize} px right now`}>
          <Switch label="Match the Dock’s size" checked={settings.compactMatchDock} onChange={compactMatchDock => save({ compactMatchDock })} />
        </Row>
        <Row label="Pill size" hint={matching ? 'Following the Dock' : `${px} px ${panel.orientation === 'vertical' ? 'wide' : 'tall'}`}>
          <input
            type="range"
            className="s-range"
            aria-label="Pill size"
            min={Math.round(base * COMPACT_SCALE.min)}
            max={Math.round(base * COMPACT_SCALE.max)}
            step={1}
            value={px}
            disabled={matching}
            onChange={e => save({ compactScale: Number(e.target.value) / base })}
          />
        </Row>
        <div className={`s-pill-preview ${panel.orientation}`} aria-hidden="true">
          <div className={`root theme-${settings.theme}`}>
            <Pill
              sessions={sessions}
              gauges={gauges}
              theme={settings.theme}
              orientation={panel.orientation}
              now={now}
              open={() => undefined}
              scale={scale}
            />
          </div>
        </div>
        <Row label="Always on top">
          <Switch label="Always on top" checked={settings.alwaysOnTop} onChange={alwaysOnTop => save({ alwaysOnTop })} />
        </Row>
      </Group>

      <Group title="Position">
        <Row label="Layout" hint="Auto: upright on the sides, a strip at the top or bottom">
          <Segmented
            label="Layout"
            options={[{ value: 'auto', label: 'Auto' }, { value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }]}
            value={settings.layout}
            onChange={layout => save({ layout })}
          />
        </Row>
        <Row label="Gap to the screen edge">
          <Segmented
            label="Gap to the screen edge"
            options={[{ value: 0, label: 'None' }, { value: 4, label: '4 px' }, { value: 8, label: '8 px' }]}
            value={settings.snapGap}
            onChange={snapGap => save({ snapGap })}
          />
        </Row>
        <Row label="Snap over the Dock" hint="Use the real screen edge instead of stopping at the Dock">
          <Switch label="Snap over the Dock" checked={settings.snapOverDock} onChange={snapOverDock => save({ snapOverDock })} />
        </Row>
        <Row label="Square corners">
          <Switch label="Square corners" checked={settings.squareCorners} onChange={squareCorners => save({ squareCorners })} />
        </Row>
      </Group>
    </>
  )
}
