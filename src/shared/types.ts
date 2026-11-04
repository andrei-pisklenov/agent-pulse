import type { Snapshot } from '../core/types'

export type Theme = 'glass' | 'terminal'
export type LayoutMode = 'auto' | 'vertical' | 'horizontal'
export type Orientation = 'vertical' | 'horizontal'
export type HorizontalStyle = 'chips' | 'segments' | 'ticker'
export type Density = 'comfortable' | 'compact'
export type TokenMetric = 'noCacheRead' | 'all'
export type Edge = 'top' | 'bottom' | 'left' | 'right'
export type TrayIcon = 'crab' | 'octopus' | 'heartbeat' | 'rings' | 'spark' | 'bars' | 'text'
/** The running mark next to counts: a full-size play triangle (▸ is too small in the menu-bar font), forced to text style. */
export const RUNNING_MARK = '\u25B6\uFE0E'
export type CrabDance = 'scuttle' | 'disco' | 'clap' | 'jump' | 'shimmy' | 'walk' | 'pinch'
/** The crab's dances, as listed in the menu. */
export const CRAB_DANCES: { id: CrabDance, label: string }[] = [
  { id: 'scuttle', label: 'Scuttle' },
  { id: 'disco', label: 'Disco' },
  { id: 'clap', label: 'Clap' },
  { id: 'jump', label: 'Jump' },
  { id: 'shimmy', label: 'Shimmy' },
  { id: 'walk', label: 'Walkabout' },
  { id: 'pinch', label: 'Pinch' },
]

export type TrayText = 'none' | 'counts' | 'countsAndSession'

/** Optional behaviours, each switchable from the Features menu. */
export interface Features {
  /** Pace forecast under the limit bars ("runs out Thu 11:40"). */
  paceForecast: boolean
  /** Show what a waiting session is asking, with snooze. */
  pendingQuestion: boolean
  /** "Sessions waited on you 49m today". */
  blockedTime: boolean
  /** The main hotkey opens a session switcher instead of toggling the panel. */
  quickSwitcher: boolean
}

export interface Settings {
  theme: Theme
  layout: LayoutMode
  horizontalStyle: HorizontalStyle
  density: Density
  /** Rest as a pill and expand on hover; when false the full panel always shows. */
  collapseToPill: boolean
  alwaysOnTop: boolean
  notifyWaiting: boolean
  sound: boolean
  launchAtLogin: boolean
  /** Opens the quick switcher (or toggles the panel when the switcher is off). */
  hotkey: string
  /** Always toggles the panel. */
  panelHotkey: string
  features: Features
  tokenMetric: TokenMetric
  limitsRefreshMinutes: number
  trayIcon: TrayIcon
  /** How the crab icon moves while sessions run. */
  crabDance: CrabDance
  /** Text shown next to the menu-bar icon. */
  trayText: TrayText
  /** Gap (px) kept between a snapped panel and the screen edge. */
  snapGap: number
  /** Snap to the real screen edges, overlapping the Dock, instead of the work area. */
  snapOverDock: boolean
  /** Square window corners instead of macOS's rounded ones. */
  squareCorners: boolean
}

export const defaultSettings: Settings = {
  theme: 'glass',
  layout: 'auto',
  horizontalStyle: 'chips',
  density: 'comfortable',
  collapseToPill: true,
  alwaysOnTop: true,
  notifyWaiting: true,
  sound: true,
  launchAtLogin: false,
  hotkey: 'Control+Alt+C',
  panelHotkey: 'Control+Alt+P',
  features: { paceForecast: true, pendingQuestion: true, blockedTime: true, quickSwitcher: true },
  tokenMetric: 'noCacheRead',
  limitsRefreshMinutes: 5,
  trayIcon: 'crab',
  crabDance: 'walk',
  trayText: 'counts',
  snapGap: 0,
  snapOverDock: true,
  squareCorners: false,
}

/** Where the panel sits; owned by the main process. */
export interface PanelState {
  orientation: Orientation
  /** Screen edges the panel is snapped to (two for a corner). */
  edges: Edge[]
  /** Largest size the panel may grow to on its display. */
  maxWidth: number
  maxHeight: number
  /** The hotkey or menu asked for the full panel. */
  forceExpanded: boolean
}

export interface PulseApi {
  onSnapshot: (cb: (snapshot: Snapshot) => void) => () => void
  onSettings: (cb: (settings: Settings) => void) => () => void
  onPanelState: (cb: (state: PanelState) => void) => () => void
  ready: () => void
  setSize: (width: number, height: number) => void
  dragStart: () => void
  dragEnd: () => void
  openSession: (id: string) => void
  markRead: (id: string) => void
  setSettings: (patch: Partial<Settings>) => void
  showMenu: () => void
  /** Snooze a waiting session for `minutes`; 0 clears it. */
  snooze: (id: string, minutes: number) => void
  closeSwitcher: () => void
  /** PNG data URL drawn at 2x for the menu bar; empty for none. */
  setTrayImage: (dataUrl: string) => void
}

export const IPC = {
  snapshot: 'pulse:snapshot',
  settings: 'pulse:settings',
  panelState: 'pulse:panel-state',
  ready: 'pulse:ready',
  setSize: 'pulse:set-size',
  dragStart: 'pulse:drag-start',
  dragEnd: 'pulse:drag-end',
  openSession: 'pulse:open-session',
  markRead: 'pulse:mark-read',
  setSettings: 'pulse:set-settings',
  showMenu: 'pulse:show-menu',
  snooze: 'pulse:snooze',
  closeSwitcher: 'pulse:close-switcher',
  trayImage: 'pulse:tray-image',
} as const

/** Messages between the main process and the collector utility process. */
export type ToWorker
  = | { type: 'markRead', id: string }
    | { type: 'refreshLimits' }
    | { type: 'snooze', id: string, until: number | null }
    | { type: 'configure', limitsRefreshMinutes: number }

export type FromWorker = { type: 'snapshot', snapshot: Snapshot }
