import type { Orientation, PanelState, Settings, Theme } from '../../shared/types'

/** The pill's thickness (px) at scale 1: its width when vertical, its height when horizontal. */
const PILL_THICKNESS: Record<Theme, Record<Orientation, number>> = {
  glass: { vertical: 44, horizontal: 32 },
  terminal: { vertical: 40, horizontal: 26 },
}

export const pillThickness = (settings: Settings, orientation: Orientation) => PILL_THICKNESS[settings.theme][orientation]

/** The pill's zoom: the Dock's thickness when matching it (and it is showing), otherwise the slider's value. */
export const compactScale = (settings: Settings, panel: Pick<PanelState, 'orientation' | 'dockSize'>): number =>
  settings.compactMatchDock && panel.dockSize
    ? panel.dockSize / pillThickness(settings, panel.orientation)
    : settings.compactScale
