import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { emptyTokens, type Snapshot } from '../../core/types'
import { defaultSettings, type PanelState, type Settings } from '../../shared/types'
import { displayedCodex, usageGauges } from '../../shared/usageDisplay'
import { compactScale } from './CompactSize'
import { Pill } from './Pill'
import { Strip } from './Strip'
import { useTrayIcon } from './useTrayIcon'
import { VerticalPanel } from './VerticalPanel'

const api = window.pulse

const DRAG_THRESHOLD = 4
const COLLAPSE_DELAY_MS = 600

const emptySnapshot: Snapshot = {
  sessions: [], limits: null, totals: { today: emptyTokens(), week: emptyTokens() },
  attention: { blockedMs: 0, longestMs: 0, waits: 0 }, generatedAt: 0,
}

const useNow = (everyMs: number) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/**
 * The whole panel: drag anywhere (a press that moves more than a few pixels), click to open,
 * hover to expand the pill. The window is resized to whatever this renders.
 */
export const App = () => {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [panel, setPanel] = useState<PanelState>({ orientation: 'vertical', edges: [], maxWidth: 1200, maxHeight: 800, forceExpanded: false, dockSize: null })
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number, y: number, id: number } | null>(null)
  const suppressClick = useRef(false)
  const leaveTimer = useRef<number | undefined>(undefined)
  const now = useNow(15_000)
  const gauges = usageGauges(settings.usageProviders, snapshot)
  useTrayIcon(settings.trayIcon, settings.crabDance, snapshot.sessions, gauges)

  useEffect(() => {
    const offs = [api.onSnapshot(setSnapshot), api.onSettings(setSettings), api.onPanelState(setPanel)]
    api.ready()
    return () => offs.forEach(off => off())
  }, [])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const report = () => {
      const r = el.getBoundingClientRect()
      api.setSize(Math.ceil(r.width), Math.ceil(r.height))
    }
    const observer = new ResizeObserver(report)
    observer.observe(el)
    report()
    return () => observer.disconnect()
  }, [])

  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 0) press.current = { x: e.screenX, y: e.screenY, id: e.pointerId }
  }
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current
    if (!p || dragging) return
    if (Math.hypot(e.screenX - p.x, e.screenY - p.y) > DRAG_THRESHOLD) {
      // Capture only once it is a drag, so plain clicks still reach their buttons.
      root.current?.setPointerCapture(p.id)
      setDragging(true)
      api.dragStart()
    }
  }
  const onPointerUp = () => {
    press.current = null
    if (!dragging) return
    setDragging(false)
    suppressClick.current = true
    api.dragEnd()
  }
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }

  const onEnter = () => {
    window.clearTimeout(leaveTimer.current)
    setHovered(true)
  }
  const onLeave = () => {
    if (dragging) return
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setHovered(false), COLLAPSE_DELAY_MS)
  }

  const open = useCallback((id: string) => api.openSession(id), [])

  const expanded = !settings.collapseToPill || hovered || dragging || panel.forceExpanded
  const view = {
    ...snapshot,
    codex: displayedCodex(settings.usageProviders, snapshot.codex),
    attention: snapshot.attention ?? emptySnapshot.attention,
    gauges, settings, now, open,
  }

  return (
    <div
      ref={root}
      className={`root theme-${settings.theme} density-${settings.density} ${settings.squareCorners ? 'square' : ''} ${dragging ? 'dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {!expanded
        ? <Pill {...view} theme={settings.theme} orientation={panel.orientation} scale={compactScale(settings, panel)} />
        : panel.orientation === 'vertical'
          ? <VerticalPanel {...view} panel={panel} />
          : <Strip {...view} panel={panel} />}
    </div>
  )
}
