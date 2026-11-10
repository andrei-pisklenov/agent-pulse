import type { ChangeEvent } from 'react'
import { COMPACT_SCALE, type Orientation, type PanelState, type Settings, type Theme } from '../../shared/types'
import { Pill } from './Pill'
import type { ViewProps } from './parts'

/** The pill's thickness (px) at scale 1: its width when vertical, its height when horizontal. */
const PILL_THICKNESS: Record<Theme, Record<Orientation, number>> = {
  glass: { vertical: 44, horizontal: 32 },
  terminal: { vertical: 40, horizontal: 26 },
}

const thickness = (settings: Settings, orientation: Orientation) => PILL_THICKNESS[settings.theme][orientation]

/** The pill's zoom: the Dock's thickness when matching it (and it is showing), otherwise the slider's value. */
export const compactScale = (settings: Settings, panel: Pick<PanelState, 'orientation' | 'dockSize'>): number =>
  settings.compactMatchDock && panel.dockSize
    ? panel.dockSize / thickness(settings, panel.orientation)
    : settings.compactScale

/** "Compact size" section of the expanded panel: Match Dock, a size slider and a live preview of the pill. */
export const CompactSize = (props: ViewProps & { panel: PanelState }) => {
  const { settings, panel } = props
  const base = thickness(settings, panel.orientation)
  const scale = compactScale(settings, panel)
  const matching = settings.compactMatchDock && panel.dockSize !== null
  const px = Math.round(base * scale)
  const onSlide = (e: ChangeEvent<HTMLInputElement>) => window.pulse.setSettings({ compactScale: Number(e.target.value) / base })

  return (
    // Presses here adjust the controls; they must not start dragging the window.
    <section className={`compact-size compact-size-${panel.orientation}`} aria-label="Compact size" onPointerDown={e => e.stopPropagation()}>
      <div className="compact-size-preview" aria-hidden="true">
        <Pill {...props} theme={settings.theme} orientation={panel.orientation} scale={scale} />
      </div>
      <div className="compact-size-controls">
        <div className="section-title">{settings.theme === 'terminal' ? '// COMPACT SIZE' : 'Compact size'}</div>
        <label className="compact-size-check">
          <input
            type="checkbox"
            checked={settings.compactMatchDock}
            onChange={e => window.pulse.setSettings({ compactMatchDock: e.target.checked })}
          />
          <span>Match Dock</span>
          <span className="muted">{panel.dockSize === null ? '(Dock hidden)' : `(${panel.dockSize} px)`}</span>
        </label>
        <div className="compact-size-slider">
          <input
            type="range"
            aria-label={panel.orientation === 'vertical' ? 'Pill width' : 'Pill height'}
            min={Math.round(base * COMPACT_SCALE.min)}
            max={Math.round(base * COMPACT_SCALE.max)}
            step={1}
            value={px}
            disabled={matching}
            onChange={onSlide}
          />
          <span className="num">{px} px</span>
        </div>
      </div>
    </section>
  )
}
