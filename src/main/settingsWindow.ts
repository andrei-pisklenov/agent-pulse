import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IPC, type SettingsPage } from '../shared/types'

type Target = SettingsPage | 'welcome'

/**
 * The settings window. It exists only while open: closing it destroys it, so it costs no memory
 * the rest of the time. While it is open the app shows in the Dock and the app switcher, like
 * other menu-bar apps with a settings window.
 */
export class SettingsWindow {
  window: BrowserWindow | null = null
  private pending: Target | null = null
  private loaded = false

  constructor(private readonly load: (win: BrowserWindow, hash: string) => void) {}

  show(target?: Target): void {
    if (target) this.navigate(target)
    if (this.window) {
      if (this.window.isMinimized()) this.window.restore()
      this.window.show()
      this.window.focus()
      return
    }
    const win = new BrowserWindow({
      width: 900,
      height: 640,
      minWidth: 760,
      minHeight: 520,
      show: false,
      title: 'Agent Pulse Settings',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'followWindow',
      backgroundColor: '#00000000',
      fullscreenable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true },
    })
    this.window = win
    this.loaded = false
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.once('ready-to-show', () => {
      void app.dock?.show()
      app.focus({ steal: true })
      win.show()
    })
    win.on('closed', () => {
      this.window = null
      app.dock?.hide()
    })
    this.load(win, '#settings')
  }

  /** The renderer said it is listening; send it anything asked for before it loaded. */
  rendererReady(): void {
    this.loaded = true
    if (this.pending) this.window?.webContents.send(IPC.navigate, this.pending)
    this.pending = null
  }

  send(channel: string, value: unknown): void {
    this.window?.webContents.send(channel, value)
  }

  private navigate(target: Target): void {
    if (this.window && this.loaded) this.window.webContents.send(IPC.navigate, target)
    else this.pending = target
  }
}
