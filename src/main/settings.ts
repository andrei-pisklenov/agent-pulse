import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  COMPACT_SCALE, defaultSettings, type CheckId, type CheckState, type Edge, type Orientation, type Settings, type TrayText,
  type UsageProviders,
} from '../shared/types'

/** Where the panel was left, per display. */
export interface SavedPosition {
  displayId: number
  x: number
  y: number
  edges: Edge[]
  orientation: Orientation
}

/** What the Setup page and the welcome guide remember. */
export interface SetupState {
  /** Results of the permission tests; 'sent' is never stored. */
  checks: Partial<Record<CheckId, CheckState>>
  welcomeDone: boolean
}

export interface Stored {
  settings: Settings
  position: SavedPosition | null
  setup: SetupState
  /** Limit warnings already shown, so a restart doesn't repeat them. */
  warned: string[]
}

const file = () => join(app.getPath('userData'), 'settings.json')

/** Reads the stored providers, including the older 'claude' | 'codex' | 'both' choice. */
const readUsageProviders = (value: unknown): UsageProviders => {
  if (value === 'claude') return { claude: true, codex: false }
  if (value === 'codex') return { claude: false, codex: true }
  const stored = typeof value === 'object' && value !== null ? value as Partial<UsageProviders> : {}
  return {
    claude: typeof stored.claude === 'boolean' ? stored.claude : defaultSettings.usageProviders.claude,
    codex: typeof stored.codex === 'boolean' ? stored.codex : defaultSettings.usageProviders.codex,
  }
}

export const loadStored = (): Stored => {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Stored>
    const settings = { ...defaultSettings, ...raw.settings }
    settings.features = { ...defaultSettings.features, ...raw.settings?.features }
    settings.quietHours = { ...defaultSettings.quietHours, ...raw.settings?.quietHours }
    // Values from older versions fall back to the default.
    const trayTexts: TrayText[] = ['none', 'counts', 'countsAndSession']
    if (!trayTexts.includes(settings.trayText)) settings.trayText = defaultSettings.trayText
    settings.usageProviders = readUsageProviders(raw.settings?.usageProviders)
    const scale = Number(settings.compactScale)
    settings.compactScale = Number.isFinite(scale) ? Math.min(COMPACT_SCALE.max, Math.max(COMPACT_SCALE.min, scale)) : 1
    const setup = { checks: { ...raw.setup?.checks }, welcomeDone: raw.setup?.welcomeDone === true }
    const warned = Array.isArray(raw.warned) ? raw.warned.filter(w => typeof w === 'string') : []
    return { settings, position: raw.position ?? null, setup, warned }
  } catch {
    return { settings: { ...defaultSettings }, position: null, setup: { checks: {}, welcomeDone: false }, warned: [] }
  }
}

export const saveStored = (stored: Stored): void => {
  try {
    writeFileSync(file(), JSON.stringify(stored, null, 2))
  } catch {
    // Not fatal: the next change tries again.
  }
}
