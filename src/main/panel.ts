import { join } from 'node:path'
import { BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { IPC, type Edge, type LayoutMode, type Orientation, type PanelState, type Theme } from '../shared/types'
import type { SavedPosition } from './settings'

/** How close (px) to a screen edge the panel must be released to snap. */
const SNAP_DISTANCE = 28

export interface PanelOptions {
  theme: Theme
  layout: LayoutMode
  alwaysOnTop: boolean
  snapGap: number
  snapOverDock: boolean
  squareCorners: boolean
  position: SavedPosition | null
  onMoved: (position: SavedPosition) => void
}

/**
 * The floating panel window. It has no frame: the renderer reports the size of its content and
 * the window follows it, growing away from the screen edge it is snapped to. Dragging is done
 * here (the renderer only says when a drag starts and ends) so hover and clicks keep working.
 */
/** The menu-bar extras' window level: above the Dock (which covers 'floating' windows), still below menus and notifications. */
const TOP_LEVEL = 'status'

export class Panel {
  window: BrowserWindow | null = null
  private state: PanelState
  private dragTimer: NodeJS.Timeout | null = null
  private dragOffset = { x: 0, y: 0 }
  private theme: Theme
  private layout: LayoutMode
  private alwaysOnTop: boolean
  private gap: number
  private overDock: boolean
  private square: boolean
  private bounds: Rectangle

  constructor(private readonly options: PanelOptions) {
    this.theme = options.theme
    this.layout = options.layout
    this.alwaysOnTop = options.alwaysOnTop
    this.gap = options.snapGap
    this.overDock = options.snapOverDock
    this.square = options.squareCorners
    const display = screen.getAllDisplays().find(d => d.id === options.position?.displayId) ?? screen.getPrimaryDisplay()
    const wa = this.area(display)
    const saved = options.position
    this.bounds = saved && saved.x >= wa.x && saved.y >= wa.y && saved.x < wa.x + wa.width && saved.y < wa.y + wa.height
      ? { x: saved.x, y: saved.y, width: 60, height: 60 }
      : { x: wa.x + wa.width - 60 - this.gap, y: wa.y + this.gap, width: 60, height: 60 }
    this.state = {
      orientation: this.forcedOrientation() ?? saved?.orientation ?? 'vertical',
      edges: saved?.edges ?? ['top', 'right'],
      maxWidth: wa.width - 2 * this.gap,
      maxHeight: wa.height - 2 * this.gap,
      forceExpanded: false,
    }
  }

  get panelState(): PanelState {
    return this.state
  }

  create(): void {
    const glass = this.theme === 'glass'
    const win = new BrowserWindow({
      ...this.bounds,
      show: false,
      frame: false,
      type: 'panel',
      transparent: !glass,
      vibrancy: glass ? 'popover' : undefined,
      roundedCorners: !this.square,
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      hasShadow: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      acceptFirstMouse: true,
      // Stops AppKit from pushing the window off the Dock, so it can sit flush in a corner.
      enableLargerThanScreen: true,
      alwaysOnTop: this.alwaysOnTop,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        // The renderer also animates the menu-bar icon, which must keep running while hidden.
        backgroundThrottling: false,
      },
    })
    win.setAlwaysOnTop(this.alwaysOnTop, TOP_LEVEL)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.on('closed', () => {
      if (this.window === win) this.window = null
    })
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void win.loadFile(join(__dirname, '../renderer/index.html'))
    this.window = win
  }

  /** Rebuilds the window, e.g. for a theme change (vibrancy and transparency are fixed at creation). */
  setTheme(theme: Theme): void {
    if (theme === this.theme) return
    this.theme = theme
    this.recreate()
  }

  setSquareCorners(on: boolean): void {
    if (on === this.square) return
    this.square = on
    this.recreate()
  }

  private recreate(): void {
    const old = this.window
    this.create()
    old?.destroy()
  }

  setLayout(layout: LayoutMode): void {
    this.layout = layout
    this.update({ orientation: this.forcedOrientation() ?? this.orientationForEdges(this.state.edges) })
  }

  setAlwaysOnTop(on: boolean): void {
    this.alwaysOnTop = on
    this.window?.setAlwaysOnTop(on, TOP_LEVEL)
  }

  /** Moves a snapped panel to the new distance from its edges. */
  setSnapGap(gap: number): void {
    this.gap = gap
    const win = this.window
    if (!win) return
    const b = win.getBounds()
    const wa = this.area(screen.getDisplayMatching(b))
    const edges = this.state.edges
    const x = edges.includes('left') ? wa.x + gap : edges.includes('right') ? wa.x + wa.width - b.width - gap : b.x
    const y = edges.includes('top') ? wa.y + gap : edges.includes('bottom') ? wa.y + wa.height - b.height - gap : b.y
    win.setBounds({ ...b, x, y })
    this.update({ maxWidth: wa.width - 2 * gap, maxHeight: wa.height - 2 * gap })
  }

  setSnapOverDock(on: boolean): void {
    this.overDock = on
    this.setSnapGap(this.gap)
  }

  setForceExpanded(on: boolean): void {
    this.update({ forceExpanded: on })
  }

  show(): void {
    if (this.window && !this.window.isVisible()) this.window.showInactive()
  }

  /** Called once the renderer has painted. */
  rendererReady(): void {
    // Re-apply the saved snap, in case the gap or Dock setting changed since.
    this.setSnapGap(this.gap)
    this.send()
    this.show()
  }

  /** Resizes to the renderer's content, keeping the snapped side fixed. */
  setContentSize(width: number, height: number): void {
    const win = this.window
    if (!win || this.dragTimer) return
    const w = Math.max(20, Math.min(Math.ceil(width), this.state.maxWidth))
    const h = Math.max(20, Math.min(Math.ceil(height), this.state.maxHeight))
    const b = win.getBounds()
    if (b.width === w && b.height === h) return
    const wa = this.area(screen.getDisplayMatching(b))
    const anchorRight = this.state.edges.includes('right')
      || (!this.state.edges.includes('left') && b.x + b.width / 2 > wa.x + wa.width / 2)
    const anchorBottom = this.state.edges.includes('bottom')
      || (!this.state.edges.includes('top') && b.y + b.height / 2 > wa.y + wa.height / 2)
    const next = {
      x: anchorRight ? b.x + b.width - w : b.x,
      y: anchorBottom ? b.y + b.height - h : b.y,
      width: w,
      height: h,
    }
    win.setBounds(this.clamp(next, wa))
    win.invalidateShadow()
  }

  dragStart(): void {
    const win = this.window
    if (!win) return
    const cursor = screen.getCursorScreenPoint()
    const [x, y] = win.getPosition() as [number, number]
    this.dragOffset = { x: cursor.x - x, y: cursor.y - y }
    this.stopDrag()
    this.dragTimer = setInterval(() => {
      const p = screen.getCursorScreenPoint()
      win.setPosition(p.x - this.dragOffset.x, p.y - this.dragOffset.y)
    }, 16)
  }

  dragEnd(): void {
    const win = this.window
    if (!win || !this.dragTimer) return
    this.stopDrag()
    const b = win.getBounds()
    const display = screen.getDisplayMatching(b)
    const wa = this.area(display)
    const edges: Edge[] = []
    const next = { ...b }
    if (b.x - wa.x <= SNAP_DISTANCE) {
      next.x = wa.x + this.gap
      edges.push('left')
    } else if (wa.x + wa.width - (b.x + b.width) <= SNAP_DISTANCE) {
      next.x = wa.x + wa.width - b.width - this.gap
      edges.push('right')
    }
    if (b.y - wa.y <= SNAP_DISTANCE) {
      next.y = wa.y + this.gap
      edges.push('top')
    } else if (wa.y + wa.height - (b.y + b.height) <= SNAP_DISTANCE) {
      next.y = wa.y + wa.height - b.height - this.gap
      edges.push('bottom')
    }
    win.setBounds(this.clamp(next, wa), true)
    this.update({
      edges,
      orientation: this.forcedOrientation() ?? this.orientationForEdges(edges),
      maxWidth: wa.width - 2 * this.gap,
      maxHeight: wa.height - 2 * this.gap,
    })
    const final = win.getBounds()
    this.options.onMoved({
      displayId: display.id, x: final.x, y: final.y, edges, orientation: this.state.orientation,
    })
  }

  send(): void {
    this.window?.webContents.send(IPC.panelState, this.state)
  }

  private update(patch: Partial<PanelState>): void {
    this.state = { ...this.state, ...patch }
    this.send()
  }

  private stopDrag(): void {
    if (this.dragTimer) clearInterval(this.dragTimer)
    this.dragTimer = null
  }

  /**
   * Where the panel may sit: the work area, or (over the Dock) the whole screen below the menu bar,
   * so a panel can sit flush in a corner even when the Dock is on that side.
   */
  private area(display: Display): Rectangle {
    if (!this.overDock) return display.workArea
    const { bounds, workArea } = display
    return { x: bounds.x, y: workArea.y, width: bounds.width, height: bounds.y + bounds.height - workArea.y }
  }

  private forcedOrientation(): Orientation | null {
    return this.layout === 'auto' ? null : this.layout
  }

  /** A single top/bottom edge means a strip, a single side edge a column; corners keep the current shape. */
  private orientationForEdges(edges: Edge[]): Orientation {
    if (edges.length !== 1) return this.state.orientation
    return edges[0] === 'top' || edges[0] === 'bottom' ? 'horizontal' : 'vertical'
  }

  private clamp(b: Rectangle, wa: Rectangle): Rectangle {
    return {
      ...b,
      x: Math.round(Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width)),
      y: Math.round(Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height)),
    }
  }
}
