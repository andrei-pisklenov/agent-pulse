import type { DailyTokens, Snapshot } from '../core/types'

export type Theme = 'glass' | 'terminal'
export type LayoutMode = 'auto' | 'vertical' | 'horizontal'
export type Orientation = 'vertical' | 'horizontal'
export type HorizontalStyle = 'chips' | 'segments' | 'ticker'
export type Density = 'comfortable' | 'compact'
export type TokenMetric = 'noCacheRead' | 'all'
/** Which providers' plan limits and token usage are shown (and probed); any mix, including neither. */
export interface UsageProviders {
  claude: boolean
  codex: boolean
}
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

/** Optional behaviours, each switchable in Settings. */
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
  usageProviders: UsageProviders
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
  /** Size the compact pill to the Dock's thickness; falls back to compactScale when the Dock hides. */
  compactMatchDock: boolean
  /** Size of the compact pill, 1 being the original; set with the slider in Settings. */
  compactScale: number
  /** Notify (and ping) only once a session has waited this long; 0 = right away. */
  notifyAfterMinutes: number
  /** No alerts or sounds between these local times ("22:00" to "08:00"). */
  quietHours: QuietHours
  /** Notify when a plan limit passes this percent, once per limit window; 0 = never. */
  limitWarnPercent: number
  /** Notify when the pace forecast says a limit runs out before it resets. */
  warnRunOut: boolean
}

export interface QuietHours {
  enabled: boolean
  /** "HH:MM", local time. */
  from: string
  to: string
}

/** Range of the compact-size slider. */
export const COMPACT_SCALE = { min: 0.6, max: 1.8 } as const

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
  usageProviders: { claude: true, codex: true },
  limitsRefreshMinutes: 5,
  trayIcon: 'crab',
  crabDance: 'walk',
  trayText: 'counts',
  snapGap: 0,
  snapOverDock: true,
  squareCorners: false,
  compactMatchDock: true,
  compactScale: 1,
  notifyAfterMinutes: 0,
  quietHours: { enabled: false, from: '22:00', to: '08:00' },
  limitWarnPercent: 90,
  warnRunOut: true,
}

export type SettingsPage = 'setup' | 'general' | 'panel' | 'menubar' | 'usage'

/** Permission tests on the Setup page. */
export type CheckId = 'terminal' | 'iterm' | 'notifications'
/**
 * unchecked: never tested. ok: worked. denied: macOS refused (or the user said the test
 * notification never came). notRunning: the app must be open for the test. failed: another error.
 * sent: a test notification went out and waits for the user to say whether it arrived.
 */
export type CheckState = 'unchecked' | 'ok' | 'denied' | 'notRunning' | 'failed' | 'sent'

export interface SetupStatus {
  /** Where sessions can come from, as found on this Mac. */
  sources: { claudeCode: boolean, claudeDesktop: boolean, vscode: boolean, codex: boolean }
  /** Only installed apps are listed. */
  checks: { id: CheckId, state: CheckState }[]
  /** Whether each global shortcut could be registered (false: another app has it). */
  shortcuts: { hotkey: boolean, panelHotkey: boolean }
  /** Launch at login works only in the packaged app. */
  loginItemAvailable: boolean
  welcomeDone: boolean
}

/** Daily token totals for the Usage page. */
export interface UsageHistory {
  /** Claude Code, oldest day first, ending today. */
  claude: DailyTokens[]
  updatedAt: number
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
  /** Thickness (px) of the Dock on the panel's display; null when it is hidden or absent. */
  dockSize: number | null
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
  openSettings: (page?: SettingsPage) => void
  /** Settings window: main asks it to show a page (or the welcome guide). */
  onNavigate: (cb: (target: SettingsPage | 'welcome') => void) => () => void
  onSetup: (cb: (status: SetupStatus) => void) => () => void
  onHistory: (cb: (history: UsageHistory) => void) => () => void
  runCheck: (id: CheckId) => Promise<CheckState>
  /** After a test notification: did it arrive? */
  confirmCheck: (id: CheckId, worked: boolean) => void
  openPrivacySettings: (id: CheckId) => void
  refreshLimits: () => void
  /** Global shortcuts are off while a shortcut is being recorded. */
  pauseHotkeys: (paused: boolean) => void
  finishWelcome: () => void
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
  openSettings: 'pulse:open-settings',
  navigate: 'pulse:navigate',
  setup: 'pulse:setup',
  history: 'pulse:history',
  runCheck: 'pulse:run-check',
  confirmCheck: 'pulse:confirm-check',
  openPrivacy: 'pulse:open-privacy',
  refreshLimits: 'pulse:refresh-limits',
  pauseHotkeys: 'pulse:pause-hotkeys',
  finishWelcome: 'pulse:finish-welcome',
} as const

/** Messages between the main process and the collector utility process. */
export type ToWorker
  = | { type: 'markRead', id: string }
    | { type: 'refreshLimits' }
    | { type: 'snooze', id: string, until: number | null }
    | { type: 'configure', limitsRefreshMinutes: number, usageProviders: UsageProviders }
    | { type: 'refreshHistory' }

export type FromWorker
  = | { type: 'snapshot', snapshot: Snapshot }
    | { type: 'history', history: UsageHistory }
