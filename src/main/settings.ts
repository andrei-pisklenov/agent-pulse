import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { defaultSettings, type Edge, type Orientation, type Settings, type TrayText } from '../shared/types'

/** Where the panel was left, per display. */
export interface SavedPosition {
  displayId: number
  x: number
  y: number
  edges: Edge[]
  orientation: Orientation
}

interface Stored {
  settings: Settings
  position: SavedPosition | null
}

const file = () => join(app.getPath('userData'), 'settings.json')

export const loadStored = (): Stored => {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Stored>
    const settings = { ...defaultSettings, ...raw.settings }
    settings.features = { ...defaultSettings.features, ...raw.settings?.features }
    // Values from older versions fall back to the default.
    const trayTexts: TrayText[] = ['none', 'counts', 'countsAndSession']
    if (!trayTexts.includes(settings.trayText)) settings.trayText = defaultSettings.trayText
    return { settings, position: raw.position ?? null }
  } catch {
    return { settings: { ...defaultSettings }, position: null }
  }
}

export const saveStored = (stored: Stored): void => {
  try {
    writeFileSync(file(), JSON.stringify(stored, null, 2))
  } catch {
    // Not fatal: the next change tries again.
  }
}
