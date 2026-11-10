import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { formatReset } from '../core/forecast'
import type { Session, Snapshot } from '../core/types'
import {
  app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray, utilityProcess,
  type MenuItemConstructorOptions, type UtilityProcess,
} from 'electron'
import {
  IPC, RUNNING_MARK, type CheckId, type CheckState, type FromWorker, type Settings, type SettingsPage, type SetupStatus, type ToWorker,
  type UsageHistory,
} from '../shared/types'
import { displayedCodex, formatLimitWindow, usageGauges } from '../shared/usageDisplay'
import { dueWaits, isQuiet, limitWarnings, needsYou, waitKey } from './alerts'
import { openSession } from './openSession'
import { Panel } from './panel'
import { loadStored, saveStored, type SavedPosition, type SetupState } from './settings'
import { SettingsWindow } from './settingsWindow'
import { findSources, privacyUrl, testAutomation } from './setup'

app.setName('Agent Pulse')
app.setPath('userData', join(app.getPath('appData'), 'agent-pulse'))

if (!app.requestSingleInstanceLock()) app.quit()

/** Limit warnings remembered; older ones belong to windows that reset long ago. */
const MAX_WARNED = 60
/** The Usage page asks for fresh daily totals when the last ones are older than this. */
const HISTORY_STALE_MS = 15 * 60_000

let settings: Settings
let position: SavedPosition | null
let setup: SetupState
let warned: string[]
let panel: Panel
let tray: Tray
let switcher: BrowserWindow | null = null
let settingsWindow: SettingsWindow
let worker: UtilityProcess | null = null
let snapshot: Snapshot | null = null
let history: UsageHistory | null = null
let previous: Map<string, Session['status']> | null = null
/** Waits already alerted about (or skipped), by waitKey. */
let alerted = new Set<string>()
let waitTimer: NodeJS.Timeout | undefined
/** Test notifications sent and not yet confirmed. */
const sent = new Set<CheckId>()
let hotkeysOk = { hotkey: true, panelHotkey: true }
let quitting = false

const persist = () => saveStored({ settings, position, setup, warned })
const toWorker = (message: ToWorker) => worker?.postMessage(message)
const rendererUrl = (hash = '') => process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}${hash}` : null
const loadRenderer = (win: BrowserWindow, hash = '') => {
  const url = rendererUrl(hash)
  if (url) void win.loadURL(url)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace('#', '') })
}

const startWorker = () => {
  worker = utilityProcess.fork(join(__dirname, 'worker.js'), [], {
    serviceName: 'Agent Pulse collector',
    // The providers go in the environment too, so the first limits probe already skips a disabled one.
    env: { ...process.env, PULSE_USER_DATA: app.getPath('userData'), PULSE_USAGE_PROVIDERS: JSON.stringify(settings.usageProviders) },
  })
  worker.on('message', (message: FromWorker) => {
    if (message.type === 'snapshot') onSnapshot(message.snapshot)
    else if (message.type === 'history') {
      history = message.history
      settingsWindow.send(IPC.history, history)
    }
  })
  // Restart if it crashes; state lives on disk.
  worker.on('exit', () => {
    worker = null
    if (!quitting) setTimeout(startWorker, 2000)
  })
  configureWorker()
}

const configureWorker = () =>
  toWorker({ type: 'configure', limitsRefreshMinutes: settings.limitsRefreshMinutes, usageProviders: settings.usageProviders })

const quiet = () => isQuiet(settings.quietHours, Date.now())

const playSound = (name: 'Ping' | 'Glass') => {
  if (settings.sound && !quiet()) execFile('/usr/bin/afplay', [`/System/Library/Sounds/${name}.aiff`], () => undefined)
}

const broadcast = (channel: string, value: unknown) => {
  panel.window?.webContents.send(channel, value)
  switcher?.webContents.send(channel, value)
  settingsWindow.send(channel, value)
}

/** Alerts about waits that have lasted long enough, then sets a timer for the next one. */
const checkWaits = () => {
  clearTimeout(waitTimer)
  const sessions = snapshot?.sessions ?? []
  const now = Date.now()
  const { due, next } = dueWaits(sessions, alerted, settings.notifyAfterMinutes, now)
  for (const s of due) alerted.add(waitKey(s))
  // Waits that come due in quiet hours are dropped, not saved for the morning.
  if (due.length && !quiet()) {
    playSound('Ping')
    if (settings.notifyWaiting) for (const s of due) notify(s)
  }
  // Forget waits that are over.
  const open = new Set(sessions.filter(s => s.status === 'waiting').map(waitKey))
  alerted = new Set([...alerted].filter(key => open.has(key)))
  if (next !== null) waitTimer = setTimeout(checkWaits, Math.max(1000, next - now + 250))
}

const checkLimits = () => {
  if (!snapshot || quiet()) return
  const warnings = limitWarnings(settings, snapshot, new Set(warned), Date.now())
  if (!warnings.length) return
  for (const w of warnings) notifyText(w.title, w.body, () => settingsWindow.show('usage'))
  warned = [...warned, ...warnings.map(w => w.key)].slice(-MAX_WARNED)
  persist()
}

const onSnapshot = (next: Snapshot) => {
  snapshot = next
  broadcast(IPC.snapshot, next)
  if (previous) {
    const newlyFinished = next.sessions.some(s => s.status === 'finished' && previous?.get(s.id) === 'busy')
    const newlyWaiting = next.sessions.some(s => needsYou(s) && !alerted.has(waitKey(s)) && previous?.get(s.id) !== 'waiting')
    // A session that starts waiting gets the Ping (now or after the delay), not the Glass too.
    if (newlyFinished && !newlyWaiting) playSound('Glass')
  } else {
    // Sessions already waiting when the app starts were seen before; don't alert about them again.
    for (const s of next.sessions) if (needsYou(s)) alerted.add(waitKey(s))
  }
  previous = new Map(next.sessions.map(s => [s.id, s.status]))
  checkWaits()
  checkLimits()
  updateTrayTitle()
}

const notifyText = (title: string, body: string, onClick: () => void) => {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: true })
  n.on('click', onClick)
  n.show()
}

const notify = (session: Session) => {
  if (!Notification.isSupported()) return
  const question = settings.features.pendingQuestion ? session.pendingPrompt : null
  const n = new Notification({
    title: session.title,
    subtitle: session.project,
    body: question ?? (session.waitingFor ? `Needs input: ${session.waitingFor}` : 'Needs input'),
    silent: true,
  })
  n.on('click', () => void open(session.id))
  n.show()
}

const open = async (id: string) => {
  const session = snapshot?.sessions.find(s => s.id === id)
  if (!session) return
  toWorker({ type: 'markRead', id })
  await openSession(session).catch(() => undefined)
}

const updateTrayTitle = () => {
  const sessions = snapshot?.sessions ?? []
  const gauges = usageGauges(settings.usageProviders, { limits: snapshot?.limits ?? null, codex: snapshot?.codex })
  const text = settings.trayText
  const parts: string[] = []
  if (settings.trayIcon === 'text') parts.push('◆')
  // The same counts as the panel's pill: needs input, running, finished; zero counts are left out.
  if (text !== 'none') {
    const counts = [
      ['!', sessions.filter(needsYou).length],
      [RUNNING_MARK, sessions.filter(s => s.status === 'busy').length],
      ['✓', sessions.filter(s => s.status === 'finished').length],
    ] as const
    for (const [mark, n] of counts) if (n) parts.push(`${mark}${n}`)
  }
  if (text === 'countsAndSession' || settings.trayIcon === 'text') {
    const providers = new Set(gauges.map(gauge => gauge.provider))
    for (const provider of providers) {
      const own = gauges.filter(gauge => gauge.provider === provider)
      const gauge = own.find(g => g.period === '5h' && g.window) ?? own.find(g => g.window)
      if (gauge?.window) parts.push(`${providers.size > 1 ? `${provider} ` : ''}${gauge.window.percent}%`)
    }
  }
  tray.setTitle(parts.length ? ` ${parts.join(' ')}` : '', { fontType: 'monospacedDigit' })
}

/** Decoded menu-bar frames: the animation loops, so each PNG is decoded once. */
const trayImages = new Map<string, Electron.NativeImage>()
const MAX_TRAY_IMAGES = 500

const setTrayImage = (dataUrl: string) => {
  if (settings.trayIcon === 'text' || !dataUrl) {
    tray.setImage(nativeImage.createEmpty())
    return
  }
  let image = trayImages.get(dataUrl)
  if (!image) {
    if (trayImages.size >= MAX_TRAY_IMAGES) trayImages.clear()
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
    image = nativeImage.createFromBuffer(buffer, { scaleFactor: 2 })
    // Template images are tinted by macOS to match the menu bar, like the system's own icons.
    image.setTemplateImage(true)
    trayImages.set(dataUrl, image)
  }
  tray.setImage(image)
}

const setupStatus = (): SetupStatus => {
  const found = findSources()
  return {
    sources: found.sources,
    checks: found.checkIds.map(id => ({ id, state: sent.has(id) ? 'sent' : setup.checks[id] ?? 'unchecked' })),
    shortcuts: hotkeysOk,
    loginItemAvailable: app.isPackaged,
    welcomeDone: setup.welcomeDone,
  }
}

const sendSetup = () => settingsWindow.send(IPC.setup, setupStatus())

const setCheck = (id: CheckId, state: CheckState) => {
  sent.delete(id)
  if (state === 'sent') sent.add(id)
  else setup = { ...setup, checks: { ...setup.checks, [id]: state } }
  persist()
  sendSetup()
}

const runCheck = async (id: CheckId): Promise<CheckState> => {
  if (id === 'notifications') {
    if (!Notification.isSupported()) {
      setCheck(id, 'failed')
      return 'failed'
    }
    new Notification({ title: 'Agent Pulse', body: 'Notifications work. You’ll see one like this when a session needs you.', silent: true }).show()
    setCheck(id, 'sent')
    return 'sent'
  }
  const state = await testAutomation(id)
  setCheck(id, state)
  return state
}

/** Something on the Setup page that needs the user: a refused permission or a taken shortcut. */
const setupProblems = (): number => {
  const status = setupStatus()
  const denied = status.checks.filter(c => c.state === 'denied').length
  const shortcuts = Object.values(status.shortcuts).filter(ok => !ok).length
  return denied + shortcuts + (status.sources.claudeCode || status.sources.codex ? 0 : 1)
}

const applySettings = (patch: Partial<Settings>) => {
  const before = settings
  settings = { ...settings, ...patch }
  persist()
  if (settings.theme !== before.theme) panel.setTheme(settings.theme)
  if (settings.layout !== before.layout) panel.setLayout(settings.layout)
  if (settings.alwaysOnTop !== before.alwaysOnTop) panel.setAlwaysOnTop(settings.alwaysOnTop)
  if (settings.snapGap !== before.snapGap) panel.setSnapGap(settings.snapGap)
  if (settings.snapOverDock !== before.snapOverDock) panel.setSnapOverDock(settings.snapOverDock)
  if (settings.squareCorners !== before.squareCorners) panel.setSquareCorners(settings.squareCorners)
  if (settings.hotkey !== before.hotkey || settings.panelHotkey !== before.panelHotkey
    || settings.features.quickSwitcher !== before.features.quickSwitcher) registerHotkeys()
  if (settings.launchAtLogin !== before.launchAtLogin) syncLoginItem()
  if (settings.limitsRefreshMinutes !== before.limitsRefreshMinutes || settings.usageProviders !== before.usageProviders) {
    configureWorker()
  }
  if (settings.notifyAfterMinutes !== before.notifyAfterMinutes) checkWaits()
  if (settings.limitWarnPercent !== before.limitWarnPercent || settings.warnRunOut !== before.warnRunOut) checkLimits()
  broadcast(IPC.settings, settings)
  updateTrayTitle()
}

/** Registers or removes the macOS login item; only a packaged app can be one. */
const syncLoginItem = () => {
  if (app.isPackaged && app.getLoginItemSettings().openAtLogin !== settings.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
  }
}

const togglePanel = () => {
  const win = panel.window
  if (!win) return
  if (!win.isVisible()) {
    panel.show()
    panel.setForceExpanded(true)
  } else {
    panel.setForceExpanded(!panel.panelState.forceExpanded)
  }
}

/** A Spotlight-like window, centred on the display under the cursor; closes when it loses focus. */
const showSwitcher = () => {
  if (!switcher) {
    switcher = new BrowserWindow({
      width: 560,
      height: 420,
      show: false,
      frame: false,
      vibrancy: 'popover',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true },
    })
    switcher.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    switcher.on('blur', () => switcher?.hide())
    switcher.on('closed', () => {
      switcher = null
    })
    loadRenderer(switcher, '#switcher')
  }
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  switcher.setPosition(Math.round(wa.x + (wa.width - 560) / 2), Math.round(wa.y + wa.height * 0.18))
  app.focus({ steal: true })
  switcher.show()
  switcher.focus()
  switcher.webContents.send(IPC.settings, settings)
  if (snapshot) switcher.webContents.send(IPC.snapshot, snapshot)
}

const registerHotkeys = () => {
  globalShortcut.unregisterAll()
  const bind = (accelerator: string, action: () => void): boolean => {
    try {
      return globalShortcut.register(accelerator, action)
    } catch {
      // Invalid accelerator in settings.json; the menu still works.
      return false
    }
  }
  const hotkey = bind(settings.hotkey, () => (settings.features.quickSwitcher ? showSwitcher() : togglePanel()))
  const panelHotkey = settings.panelHotkey === settings.hotkey || bind(settings.panelHotkey, togglePanel)
  hotkeysOk = { hotkey, panelHotkey }
  sendSetup()
}

const openSettings = (page?: SettingsPage | 'welcome') => {
  settingsWindow.show(page)
  if (!history || Date.now() - history.updatedAt > HISTORY_STALE_MS) toWorker({ type: 'refreshHistory' })
}

const buildMenu = (): Menu => {
  const sessions = snapshot?.sessions ?? []
  const attention = sessions.filter(s => s.status === 'waiting' || s.status === 'busy' || s.status === 'finished').slice(0, 8)
  const mark = { waiting: '!', busy: RUNNING_MARK, finished: '✓', idle: '·', ended: '·' } as const
  const check = (key: 'collapseToPill' | 'alwaysOnTop', label: string): MenuItemConstructorOptions => ({
    label, type: 'checkbox', checked: settings[key], click: () => applySettings({ [key]: !settings[key] }),
  })
  const showClaude = settings.usageProviders.claude
  const limits = showClaude ? snapshot?.limits : null
  const codex = displayedCodex(settings.usageProviders, snapshot?.codex)
  const now = Date.now()
  // Greyed info lines: "Weekly limit  88% · resets Sun 07:00".
  const claudePrefix = codex ? 'Claude ' : ''
  const limitLines = [
    [`${claudePrefix}5-hour limit`, limits?.session] as const,
    [`${claudePrefix}Weekly limit`, limits?.week] as const,
    ...codex?.windows.map(window => [`Codex ${formatLimitWindow(window.durationMinutes)} limit`, window] as const) ?? [],
  ]
    .flatMap(([name, w]): MenuItemConstructorOptions[] => {
      if (!w) return []
      const soon = w.resetsAt !== null && w.resetsAt - now < 86_400_000
      const reset = formatReset(w, now)
      return [{ label: `${name}  ${w.percent}%${reset ? ` · resets ${soon ? 'in ' : ''}${reset}` : ''}`, enabled: false }]
    })
  if (codex?.limitError) limitLines.push({ label: codex.limitError, enabled: false })
  const problems = setupProblems()
  const template: MenuItemConstructorOptions[] = [
    ...(problems
      ? [
          { label: `Finish setup: ${problems === 1 ? '1 thing needs' : `${problems} things need`} you…`, click: () => openSettings('setup') },
          { type: 'separator' as const },
        ]
      : []),
    ...limitLines,
    ...(limitLines.length ? [{ type: 'separator' as const }] : []),
    ...attention.map(s => ({
      label: `${mark[s.status]}  ${s.title}`,
      sublabel: settings.features.pendingQuestion && s.pendingPrompt ? s.pendingPrompt : s.project,
      click: () => void open(s.id),
    })),
    ...(attention.length ? [{ type: 'separator' as const }] : []),
    {
      label: panel.window?.isVisible() ? 'Hide panel' : 'Show panel',
      accelerator: settings.panelHotkey,
      registerAccelerator: false,
      click: () => (panel.window?.isVisible() ? panel.window.hide() : panel.show()),
    },
    check('collapseToPill', 'Rest as pill, expand on hover'),
    check('alwaysOnTop', 'Always on top'),
    { type: 'separator' },
    {
      label: limits?.error || codex?.limitError ? `Refresh limits (last: ${limits?.error ?? codex?.limitError})` : 'Refresh limits now',
      enabled: settings.usageProviders.claude || settings.usageProviders.codex,
      click: () => toWorker({ type: 'refreshLimits' }),
    },
    { label: 'Settings…', accelerator: 'Command+,', registerAccelerator: false, click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Agent Pulse', accelerator: 'Command+Q', click: () => app.quit() },
  ]
  return Menu.buildFromTemplate(template)
}

/** The menu bar shown while the settings window is in front: ⌘, ⌘W ⌘Q and text editing. */
const setAppMenu = () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Agent Pulse',
      submenu: [
        { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { label: 'Quit Agent Pulse', accelerator: 'Command+Q', click: () => app.quit() },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]))
}

app.whenReady().then(() => {
  app.dock?.hide()
  const stored = loadStored()
  settings = stored.settings
  position = stored.position
  setup = stored.setup
  warned = stored.warned
  settingsWindow = new SettingsWindow(loadRenderer)
  setAppMenu()

  panel = new Panel({
    theme: settings.theme,
    layout: settings.layout,
    alwaysOnTop: settings.alwaysOnTop,
    snapGap: settings.snapGap,
    snapOverDock: settings.snapOverDock,
    squareCorners: settings.squareCorners,
    position,
    onMoved: (p) => {
      position = p
      persist()
    },
    // The settings window previews the pill at the panel's size.
    onState: state => settingsWindow.send(IPC.panelState, state),
  })
  panel.create()
  // Resizing, moving or hiding the Dock changes the work area; the pill follows it when matching the Dock.
  screen.on('display-metrics-changed', () => panel.refreshDock())
  screen.on('display-removed', () => panel.refreshDock())

  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Agent Pulse')
  tray.on('click', () => tray.popUpContextMenu(buildMenu()))
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()))
  updateTrayTitle()

  ipcMain.on(IPC.ready, (event) => {
    event.sender.send(IPC.settings, settings)
    if (snapshot) event.sender.send(IPC.snapshot, snapshot)
    if (event.sender === panel.window?.webContents) panel.rendererReady()
    if (event.sender === settingsWindow.window?.webContents) {
      event.sender.send(IPC.panelState, panel.panelState)
      event.sender.send(IPC.setup, setupStatus())
      if (history) event.sender.send(IPC.history, history)
      settingsWindow.rendererReady()
    }
  })
  ipcMain.on(IPC.setSize, (event, width: number, height: number) => {
    if (event.sender === panel.window?.webContents) panel.setContentSize(width, height)
  })
  ipcMain.on(IPC.dragStart, () => panel.dragStart())
  ipcMain.on(IPC.dragEnd, () => panel.dragEnd())
  ipcMain.on(IPC.openSession, (_e, id: string) => {
    switcher?.hide()
    void open(id)
  })
  ipcMain.on(IPC.markRead, (_e, id: string) => toWorker({ type: 'markRead', id }))
  ipcMain.on(IPC.snooze, (_e, id: string, minutes: number) => {
    toWorker({ type: 'snooze', id, until: minutes > 0 ? Date.now() + minutes * 60_000 : null })
  })
  ipcMain.on(IPC.setSettings, (_e, patch: Partial<Settings>) => applySettings(patch))
  ipcMain.on(IPC.showMenu, () => buildMenu().popup({ window: panel.window ?? undefined }))
  ipcMain.on(IPC.closeSwitcher, () => switcher?.hide())
  ipcMain.on(IPC.trayImage, (event, dataUrl: string) => {
    // Only the panel renderer draws the menu-bar icon.
    if (event.sender === panel.window?.webContents) setTrayImage(dataUrl)
  })
  ipcMain.on(IPC.openSettings, (_e, page?: SettingsPage) => openSettings(page))
  ipcMain.handle(IPC.runCheck, (_e, id: CheckId) => runCheck(id))
  ipcMain.on(IPC.confirmCheck, (_e, id: CheckId, worked: boolean) => {
    setCheck(id, worked ? 'ok' : 'denied')
    if (!worked) void shell.openExternal(privacyUrl(id))
  })
  ipcMain.on(IPC.openPrivacy, (_e, id: CheckId) => void shell.openExternal(privacyUrl(id)))
  ipcMain.on(IPC.refreshLimits, () => toWorker({ type: 'refreshLimits' }))
  ipcMain.on(IPC.pauseHotkeys, (_e, paused: boolean) => (paused ? globalShortcut.unregisterAll() : registerHotkeys()))
  ipcMain.on(IPC.finishWelcome, () => {
    setup = { ...setup, welcomeDone: true }
    persist()
    sendSetup()
  })

  syncLoginItem()
  registerHotkeys()
  startWorker()
  if (!setup.welcomeDone) openSettings('welcome')
})

app.on('second-instance', () => {
  panel.show()
  panel.setForceExpanded(true)
})

app.on('before-quit', () => {
  quitting = true
  worker?.kill()
  globalShortcut.unregisterAll()
})

// A menu-bar app keeps running without windows.
app.on('window-all-closed', () => undefined)
