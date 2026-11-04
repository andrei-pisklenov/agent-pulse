import type { CrabDance, TrayIcon } from '../../shared/types'
import { drawCrab } from './crab'

/** What the menu-bar icon reflects. */
export interface TrayMood {
  busy: number
  waiting: number
  finished: number
  sessionPercent: number | null
  weekPercent: number | null
}

const H = 36 // 18 pt at 2x
const WIDTH: Record<Exclude<TrayIcon, 'text'>, number> = { crab: 50, octopus: 50, heartbeat: 52, rings: 36, spark: 36, bars: 28 }

type Ctx = CanvasRenderingContext2D

/** Whether this icon moves in this mood (drives the animation timer). */
export const isAnimated = (icon: TrayIcon, mood: TrayMood): boolean => {
  if (icon === 'text' || icon === 'bars') return false
  if (icon === 'rings') return mood.busy > 0 || mood.waiting > 0
  // The crab and octopus also breathe and snore when asleep.
  return icon === 'crab' || icon === 'octopus' || mood.busy > 0 || mood.waiting > 0
}

/** Draws a pixel glyph, 2 px per pixel, like the crab. */
const pixelGlyph = (c: Ctx, rows: string[], x: number, y: number) => {
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x + i * 2, y + r * 2, 2, 2)
  })
}

/** A bobbing pixel "?", shown when a session needs you and nothing is running. */
const questionMark = (c: Ctx, x: number, y: number, f: number) => {
  pixelGlyph(c, ['.##.', '#..#', '..#.', '.#..', '....', '.#..'], x, y + (Math.floor(f / 4) % 2) * 2)
}

/*
 * Crab and octopus moods: nothing running and nothing waiting → asleep; nothing running but a
 * session needs you → awake and puzzled with a "?"; running → moving, waving too if one waits.
 */

const octopus = (c: Ctx, fg: string, m: TrayMood, f: number) => {
  const swim = m.busy > 0
  const asleep = !swim && m.waiting === 0
  const puzzled = !swim && m.waiting > 0
  const waving = swim && m.waiting > 0
  const bob = swim ? Math.sin(f / 2) * 1.2 : asleep ? Math.sin(f / 6) * 0.6 : 0
  const cx = 22
  const cy = 13 + bob

  // Tentacles: wavy when swimming, curled when asleep.
  c.strokeStyle = fg
  c.lineWidth = 2.6
  c.lineCap = 'round'
  const feet = [-8, -4, 0, 4, 8]
  feet.forEach((dx, i) => {
    if (waving && i === feet.length - 1) return
    const x0 = cx + dx * 0.9
    const y0 = cy + 6
    const sway = swim ? Math.sin(f / 1.5 + i * 1.1) * 2.6 : asleep ? 1.5 * Math.sign(dx || 1) : Math.sin(i) * 1.2
    c.beginPath()
    c.moveTo(x0, y0)
    c.quadraticCurveTo(x0 + sway, y0 + 6, x0 + dx * 0.35 - sway * 0.6, H - 4 + (asleep ? -2 : 0))
    c.stroke()
  })

  // Waiting while others run: one tentacle up, waving.
  if (waving) {
    const wave = Math.sin(f / 1.3) * 3
    c.strokeStyle = fg
    c.beginPath()
    c.moveTo(cx + 8, cy + 3)
    c.quadraticCurveTo(cx + 15, cy, cx + 15 + wave, cy - 10)
    c.stroke()
  }

  // Head: a filled dome with the face cut out.
  c.fillStyle = fg
  c.beginPath()
  c.ellipse(cx, cy, 10, 9.5, 0, 0, Math.PI * 2)
  c.fill()

  c.save()
  c.globalCompositeOperation = 'destination-out'
  c.lineWidth = 1.8
  c.lineCap = 'round'
  if (asleep) {
    for (const ex of [-4, 4]) {
      c.beginPath()
      c.arc(cx + ex, cy + 1, 2.2, 0.15 * Math.PI, 0.85 * Math.PI)
      c.stroke()
    }
  } else {
    const look = swim ? Math.sin(f / 3) * 1.2 : 0
    const r = m.waiting ? 3 : 2.4
    for (const ex of [-4, 4]) {
      c.beginPath()
      c.arc(cx + ex + look, cy + 0.5, r, 0, Math.PI * 2)
      c.fill()
    }
  }
  c.restore()

  // Sweat drop when a limit is nearly used up.
  if (Math.max(m.sessionPercent ?? 0, m.weekPercent ?? 0) >= 85) {
    c.fillStyle = fg
    c.beginPath()
    c.moveTo(cx - 13, cy - 7)
    c.quadraticCurveTo(cx - 10, cy - 1, cx - 13, cy)
    c.quadraticCurveTo(cx - 16, cy - 1, cx - 13, cy - 7)
    c.fill()
  }

  c.fillStyle = fg
  if (puzzled) questionMark(c, 38, 4, f)
  // Snores drift up while asleep.
  if (asleep) {
    const rise = (f % 24) / 24
    c.globalAlpha = 1 - rise
    c.font = 'bold 11px -apple-system, sans-serif'
    c.fillText('z', cx + 11, cy - 4 - rise * 6)
    c.globalAlpha = 1
  }
}

const heartbeat = (c: Ctx, fg: string, m: TrayMood, f: number) => {
  const w = WIDTH.heartbeat
  const base = 20
  c.strokeStyle = fg
  c.lineWidth = 2.4
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.beginPath()
  if (m.busy || m.waiting) {
    const period = 26
    const shift = (f * 3) % period
    c.moveTo(2, base)
    for (let x = 2; x <= w - 2; x++) {
      const p = (x + shift) % period
      let y = base
      if (p >= 8 && p < 10) y = base - 3
      else if (p >= 12 && p < 14) y = base - 14 + (p - 12) * 2
      else if (p >= 14 && p < 16) y = base + 8 - (p - 14) * 4
      c.lineTo(x, y)
    }
  } else {
    c.moveTo(2, base)
    c.lineTo(w - (m.finished ? 10 : 2), base)
  }
  c.stroke()
  if (m.waiting || m.finished) {
    c.fillStyle = fg
    c.globalAlpha = m.waiting ? 0.6 + 0.4 * Math.abs(Math.sin(f / 2)) : 1
    c.beginPath()
    c.arc(w - 5, m.waiting ? 7 : base, 4, 0, Math.PI * 2)
    c.fill()
    c.globalAlpha = 1
  }
}

const rings = (c: Ctx, fg: string, m: TrayMood, f: number) => {
  const cx = 18
  const cy = 18
  const ring = (r: number, percent: number | null) => {
    c.lineWidth = 3.4
    c.strokeStyle = fg
    c.globalAlpha = 0.3
    c.beginPath()
    c.arc(cx, cy, r, 0, Math.PI * 2)
    c.stroke()
    c.globalAlpha = 1
    if (percent === null) return
    c.beginPath()
    c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(percent, 100)) / 100)
    c.stroke()
  }
  ring(15, m.sessionPercent)
  ring(9, m.weekPercent)
  if (m.waiting) {
    c.fillStyle = fg
    c.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(f / 2))
    c.beginPath()
    c.arc(cx, cy, 3.6, 0, Math.PI * 2)
    c.fill()
    c.globalAlpha = 1
  } else if (m.busy) {
    const a = f / 2
    c.fillStyle = fg
    c.beginPath()
    c.arc(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, 2, 0, Math.PI * 2)
    c.fill()
  }
}

const spark = (c: Ctx, fg: string, m: TrayMood, f: number) => {
  const cx = 18
  const cy = 18
  const scale = m.waiting ? 1 + 0.08 * Math.sin(f / 1.5) : 1
  c.save()
  c.translate(cx, cy)
  c.rotate(m.busy ? (f * Math.PI) / 24 : 0)
  c.scale(scale, scale)
  c.strokeStyle = fg
  c.globalAlpha = m.busy || m.waiting || m.finished ? 1 : 0.55
  c.lineWidth = 3.4
  c.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const len = i % 2 ? 9 : 13
    c.beginPath()
    c.moveTo(Math.cos(a) * 3, Math.sin(a) * 3)
    c.lineTo(Math.cos(a) * len, Math.sin(a) * len)
    c.stroke()
  }
  c.restore()
}

const bars = (c: Ctx, fg: string, m: TrayMood) => {
  const bar = (x: number, percent: number | null) => {
    const top = 4
    const height = 28
    c.strokeStyle = fg
    c.lineWidth = 1.6
    c.beginPath()
    c.roundRect(x, top, 9, height, 2.5)
    c.stroke()
    // Height shows what is left until the limit.
    const left = percent === null ? 0 : Math.max(0, 100 - percent) / 100
    c.fillStyle = fg
    c.beginPath()
    c.roundRect(x + 2, top + 2 + (height - 4) * (1 - left), 5, (height - 4) * left, 1.5)
    c.fill()
  }
  bar(3, m.sessionPercent)
  bar(16, m.weekPercent)
}

const crab = (c: Ctx, fg: string, m: TrayMood, f: number, dance: CrabDance) => {
  const sweating = Math.max(m.sessionPercent ?? 0, m.weekPercent ?? 0) >= 85
  c.fillStyle = fg
  drawCrab(c, { running: m.busy > 0, waiting: m.waiting > 0, sweating }, dance, f)
  if (!m.busy && m.waiting) questionMark(c, 42, 2, f)
  // A solid pixel "Z" above the claw, rising and falling with the sleeping crab's breath.
  if (!m.busy && !m.waiting) pixelGlyph(c, ['#####', '...#.', '..#..', '.#...', '#####'], 38, 2 + (Math.floor(f / 8) % 2) * 2)
}

/** Draws one frame of the chosen menu-bar icon as a template image (macOS tints it to match the menu bar). */
export const drawTrayIcon = (icon: TrayIcon, mood: TrayMood, frame: number, dance: CrabDance = 'scuttle'): string | null => {
  if (icon === 'text') return null
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH[icon]
  canvas.height = H
  const c = canvas.getContext('2d')!
  // Template images only use alpha, so the colour is irrelevant.
  const fg = '#000000'
  if (icon === 'crab') crab(c, fg, mood, frame, dance)
  else if (icon === 'octopus') octopus(c, fg, mood, frame)
  else if (icon === 'heartbeat') heartbeat(c, fg, mood, frame)
  else if (icon === 'rings') rings(c, fg, mood, frame)
  else if (icon === 'spark') spark(c, fg, mood, frame)
  else bars(c, fg, mood)
  return canvas.toDataURL('image/png')
}
