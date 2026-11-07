import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { formatReset } from '../core/forecast'
import type { Session, Snapshot } from '../core/types'
import {
  app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray, utilityProcess,
  type MenuItemConstructorOptions, type UtilityProcess,
} from 'electron'
import { CRAB_DANCES, IPC, RUNNING_MARK, type Features, type FromWorker, type Settings, type ToWorker } from '../shared/types'
import { openSession } from './openSession'
import { Panel } from './panel'
import { loadStored, saveStored, type SavedPosition } from './settings'

app.setName('Agent Pulse')
app.setPath('userData', join(app.getPath('appData'), 'agent-pulse'))

if (!app.requestSingleInstanceLock()) app.quit()

let settings: Settings
let position: SavedPosition | null
let panel: Panel
let tray: Tray
let switcher: BrowserWindow | null = null
let worker: UtilityProcess | null = null
let snapshot: Snapshot | null = null
let previous: Map<string, Session['status']> | null = null
let quitting = false

const persist = () => saveStored({ settings, position })
const toWorker = (message: ToWorker) => worker?.postMessage(message)
const rendererUrl = (hash = '') => process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}${hash}` : null
const loadRenderer = (win: BrowserWindow, hash = '') => {
  const url = rendererUrl(hash)
  if (url) void win.loadURL(url)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace('#', '') })
}

/** Waiting sessions the user has not snoozed. */
const needsYou = (s: Session) => s.status === 'waiting' && !s.snoozedUntil

const startWorker = () => {
  worker = utilityProcess.fork(join(__dirname, 'worker.js'), [], {
    serviceName: 'Agent Pulse collector',
    env: { ...process.env, PULSE_USER_DATA: app.getPath('userData') },
  })
  worker.on('message', (message: FromWorker) => {
    if (message.type === 'snapshot') onSnapshot(message.snapshot)
  })
  // Restart if it crashes; state lives on disk.
  worker.on('exit', () => {
    worker = null
    if (!quitting) setTimeout(startWorker, 2000)
  })
  toWorker({ type: 'configure', limitsRefreshMinutes: settings.limitsRefreshMinutes })
}

const playSound = (name: 'Ping' | 'Glass') => {
  if (settings.sound) execFile('/usr/bin/afplay', [`/System/Library/Sounds/${name}.aiff`], () => undefined)
}

const broadcast = (channel: string, value: unknown) => {
  panel.window?.webContents.send(channel, value)
  switcher?.webContents.send(channel, value)
}

const onSnapshot = (next: Snapshot) => {
  snapshot = next
  broadcast(IPC.snapshot, next)
  if (previous) {
    const newlyWaiting = next.sessions.filter(s => needsYou(s) && previous?.get(s.id) !== 'waiting')
    const newlyFinished = next.sessions.filter(s => s.status === 'finished' && previous?.get(s.id) === 'busy')
    if (newlyWaiting.length) {
      playSound('Ping')
      if (settings.notifyWaiting) for (const s of newlyWaiting) notify(s)
    } else if (newlyFinished.length) {
      playSound('Glass')
    }
  }
  previous = new Map(next.sessions.map(s => [s.id, s.status]))
  updateTrayTitle()
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
  const pct = snapshot?.limits?.session?.percent
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
  if ((text === 'countsAndSession' || settings.trayIcon === 'text') && pct !== undefined) parts.push(`${pct}%`)
  tray.setTitle(parts.length ? ` ${parts.join(' ')}` : '', { fontType: 'monospacedDigit' })
}

const setTrayImage = (dataUrl: string) => {
  if (settings.trayIcon === 'text' || !dataUrl) {
    tray.setImage(nativeImage.createEmpty())
    return
  }
  const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
  const image = nativeImage.createFromBuffer(buffer, { scaleFactor: 2 })
  // Template images are tinted by macOS to match the menu bar, like the system's own icons.
  image.setTemplateImage(true)
  tray.setImage(image)
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
  if (settings.limitsRefreshMinutes !== before.limitsRefreshMinutes) {
    toWorker({ type: 'configure', limitsRefreshMinutes: settings.limitsRefreshMinutes })
  }
  broadcast(IPC.settings, settings)
  updateTrayTitle()
}

/** Registers or removes the macOS login item; only a packaged app can be one. */
const syncLoginItem = () => {
  if (app.isPackaged && app.getLoginItemSettings().openAtLogin !== settings.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
  }
}

const setFeature = (key: keyof Features, on: boolean) => applySettings({ features: { ...settings.features, [key]: on } })

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
  const bind = (accelerator: string, action: () => void) => {
    try {
      globalShortcut.register(accelerator, action)
    } catch {
      // Invalid accelerator in settings.json; the menu still works.
    }
  }
  bind(settings.hotkey, () => (settings.features.quickSwitcher ? showSwitcher() : togglePanel()))
  if (settings.panelHotkey !== settings.hotkey) bind(settings.panelHotkey, togglePanel)
}

const buildMenu = (): Menu => {
  const sessions = snapshot?.sessions ?? []
  const attention = sessions.filter(s => s.status === 'waiting' || s.status === 'busy' || s.status === 'finished').slice(0, 8)
  const mark = { waiting: '!', busy: RUNNING_MARK, finished: '✓', idle: '·', ended: '·' } as const
  const radio = <K extends keyof Settings>(key: K, value: Settings[K], label: string): MenuItemConstructorOptions => ({
    label, type: 'radio', checked: settings[key] === value, click: () => applySettings({ [key]: value }),
  })
  const check = (key: keyof Settings, label: string): MenuItemConstructorOptions => ({
    label, type: 'checkbox', checked: settings[key] === true, click: () => applySettings({ [key]: !settings[key] }),
  })
  const feature = (key: keyof Features, label: string): MenuItemConstructorOptions => ({
    label, type: 'checkbox', checked: settings.features[key], click: () => setFeature(key, !settings.features[key]),
  })
  const limits = snapshot?.limits
  const now = Date.now()
  // Greyed info lines: "Weekly limit  88% · resets Sun 07:00".
  const limitLines = ([['5-hour limit', limits?.session], ['Weekly limit', limits?.week]] as const)
    .flatMap(([name, w]): MenuItemConstructorOptions[] => {
      if (!w) return []
      const soon = w.resetsAt !== null && w.resetsAt - now < 86_400_000
      return [{ label: `${name}  ${w.percent}% · resets ${soon ? 'in ' : ''}${formatReset(w, now)}`, enabled: false }]
    })
  const template: MenuItemConstructorOptions[] = [
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
    ...(settings.features.quickSwitcher
      ? [{ label: 'Find session…', accelerator: settings.hotkey, registerAccelerator: false, click: showSwitcher }]
      : []),
    {
      label: 'Theme',
      submenu: [
        radio('theme', 'glass', 'Glass'),
        radio('theme', 'terminal', 'Terminal HUD'),
        { type: 'separator' },
        { label: 'Horizontal layout', enabled: false },
        radio('horizontalStyle', 'chips', 'Chips with details'),
        radio('horizontalStyle', 'segments', 'Status segments'),
        radio('horizontalStyle', 'ticker', 'Thin ticker'),
        { type: 'separator' },
        { label: 'Rows', enabled: false },
        radio('density', 'comfortable', 'Comfortable (two lines)'),
        radio('density', 'compact', 'Compact (one line)'),
      ],
    },
    {
      label: 'Menu bar',
      submenu: [
        { label: 'Icon', enabled: false },
        radio('trayIcon', 'crab', 'Crab'),
        ...(settings.trayIcon === 'crab'
          ? [{
              label: `    ↳ Dance: ${CRAB_DANCES.find(d => d.id === settings.crabDance)?.label ?? ''}`,
              submenu: CRAB_DANCES.map(d => radio('crabDance', d.id, d.label)),
            }]
          : []),
        radio('trayIcon', 'octopus', 'Octopus'),
        radio('trayIcon', 'heartbeat', 'Heartbeat line'),
        radio('trayIcon', 'rings', 'Twin limit rings'),
        radio('trayIcon', 'spark', 'Spark'),
        radio('trayIcon', 'bars', 'Signal bars'),
        radio('trayIcon', 'text', 'Text only'),
        { type: 'separator' },
        { label: 'Text', enabled: false },
        radio('trayText', 'none', 'None'),
        radio('trayText', 'counts', `Status counts (! ${RUNNING_MARK} ✓)`),
        radio('trayText', 'countsAndSession', 'Status counts + session %'),
      ],
    },
    {
      label: 'Layout',
      submenu: [
        radio('layout', 'auto', 'Auto (by screen edge)'),
        radio('layout', 'vertical', 'Vertical'),
        radio('layout', 'horizontal', 'Horizontal'),
        { type: 'separator' },
        { label: 'Gap to screen edge', enabled: false },
        radio('snapGap', 0, 'None (flush)'),
        radio('snapGap', 4, '4 px'),
        radio('snapGap', 8, '8 px'),
        check('snapOverDock', 'Snap over the Dock'),
        check('squareCorners', 'Square corners'),
      ],
    },
    {
      label: 'Features',
      submenu: [
        feature('paceForecast', 'Limit pace forecast'),
        feature('pendingQuestion', 'Show what waiting sessions ask'),
        feature('blockedTime', 'Time sessions waited on you'),
        feature('quickSwitcher', 'Quick switcher on main hotkey'),
      ],
    },
    {
      label: 'Token counts',
      submenu: [
        radio('tokenMetric', 'noCacheRead', 'Input + output + cache writes'),
        radio('tokenMetric', 'all', 'Including cache reads'),
      ],
    },
    check('collapseToPill', 'Rest as pill, expand on hover'),
    check('alwaysOnTop', 'Always on top'),
    check('notifyWaiting', 'Notify when input needed'),
    check('sound', 'Sound on finish / waiting'),
    { ...check('launchAtLogin', 'Launch at login'), enabled: app.isPackaged, sublabel: app.isPackaged ? undefined : 'packaged app only' },
    { type: 'separator' },
    {
      label: limits?.error ? `Refresh limits (last: ${limits.error})` : 'Refresh limits now',
      click: () => toWorker({ type: 'refreshLimits' }),
    },
    { label: 'Quit Agent Pulse', accelerator: 'Command+Q', click: () => app.quit() },
  ]
  return Menu.buildFromTemplate(template)
}

app.whenReady().then(() => {
  app.dock?.hide()
  const stored = loadStored()
  settings = stored.settings
  position = stored.position

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
  })
  panel.create()

  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Agent Pulse')
  tray.on('click', () => tray.popUpContextMenu(buildMenu()))
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()))
  updateTrayTitle()

  ipcMain.on(IPC.ready, (event) => {
    event.sender.send(IPC.settings, settings)
    if (snapshot) event.sender.send(IPC.snapshot, snapshot)
    if (event.sender === panel.window?.webContents) panel.rendererReady()
  })
  ipcMain.on(IPC.setSize, (_e, width: number, height: number) => panel.setContentSize(width, height))
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

  syncLoginItem()
  registerHotkeys()
  startWorker()
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
