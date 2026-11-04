import type { CrabDance } from '../../shared/types'

/*
 * A pixel-art crab, 2 px per pixel on a 25×18 grid. Everything is described as a pose
 * relative to the body's top-left corner; the right claw mirrors the left one.
 */

type Claw = 'side' | 'down' | 'up' | 'upHigh' | 'clapOpen' | 'clapClosed' | 'pinchOpen' | 'pinchClosed'
type Rect = [x: number, y: number, w: number, h: number]

interface Pose {
  /** Body origin in grid cells. */
  x: number
  y: number
  w: number
  h: number
  claws: [Claw, Claw]
  /** Heights of the four legs (0 = tucked in). */
  legs: [number, number, number, number]
  eyes: 'open' | 'wide' | 'closed'
  /** Pupils look left (-1), ahead (0) or right (1). */
  look: number
  /** Horizontal offset per body row, for wobbly dances. */
  rowShift?: (row: number) => number
}

/** Left-claw shapes relative to the body; the right claw is mirrored. */
const CLAWS: Record<Claw, Rect[]> = {
  side: [[-3, 3, 3, 2]],
  down: [[-3, 5, 3, 2]],
  up: [[-3, -2, 2, 2], [-2, 0, 2, 3]],
  upHigh: [[-3, -3, 2, 2], [-2, -1, 2, 4]],
  clapOpen: [[-2, -1, 2, 3], [-1, -3, 2, 2]],
  clapClosed: [[0, -2, 2, 2], [3, -3, 3, 2]],
  pinchOpen: [[-4, 2, 3, 1], [-4, 5, 3, 1], [-2, 3, 2, 2]],
  pinchClosed: [[-4, 3, 4, 2]],
}

const BASE: Pose = { x: 5, y: 3, w: 12, h: 8, claws: ['side', 'side'], legs: [3, 3, 3, 3], eyes: 'open', look: 0 }

const beat = (f: number, every: number) => Math.floor(f / every) % 2

/** Poses for the "sessions are running" animation, one per dance. */
const DANCES: Record<CrabDance, (f: number) => Pose> = {
  // Shuffles side to side, stepping its legs in pairs.
  scuttle: (f) => {
    const step = beat(f, 2)
    return { ...BASE, x: BASE.x + (step ? 1 : -1), legs: step ? [2, 3, 2, 3] : [3, 2, 3, 2] }
  },
  // Bounces to the beat, pointing one claw up and the other down, eyes following.
  disco: (f) => {
    const b = beat(f, 3)
    return { ...BASE, y: BASE.y - b, claws: b ? ['up', 'down'] : ['down', 'up'], look: b ? -1 : 1 }
  },
  // Claps above its head, dipping and squinting on each clap.
  clap: (f) => {
    const phase = Math.floor(f / 2) % 4
    const claw = (['clapOpen', 'clapClosed', 'clapOpen', 'side'] as const)[phase]!
    return { ...BASE, y: BASE.y + (phase === 1 ? 1 : 0), claws: [claw, claw], eyes: phase === 1 ? 'closed' : 'open' }
  },
  // Squashes, hops with legs dangling, lands with a squash.
  jump: (f) => {
    const p = f % 10
    if (p === 0 || p === 6) return { ...BASE, x: BASE.x - 1, y: BASE.y + 1, w: BASE.w + 2, h: BASE.h - 1, legs: [2, 2, 2, 2] }
    if (p >= 2 && p <= 5) {
      const lift = [1, 2, 2, 1][p - 2]!
      return { ...BASE, y: BASE.y - lift, claws: ['down', 'down'], legs: [1, 2, 2, 1], eyes: 'wide' }
    }
    return BASE
  },
  // Wobbles its whole body like a wave, claws and legs alternating.
  shimmy: (f) => {
    const b = beat(f, 2)
    return {
      ...BASE,
      claws: b ? ['side', 'down'] : ['down', 'side'],
      legs: b ? [3, 2, 3, 2] : [2, 3, 2, 3],
      rowShift: row => Math.round(Math.sin(f / 1.2 + row * 0.9)),
    }
  },
  // Strolls back and forth across the icon, looking where it goes.
  walk: (f) => {
    const t = f % 24
    const right = t < 12
    const pos = Math.floor((right ? t : 24 - t) / 2)
    return { ...BASE, x: 3 + pos, legs: beat(f, 1) ? [2, 3, 2, 3] : [3, 2, 3, 2], look: right ? 1 : -1 }
  },
  // Snaps its pincers in turn, looking at the open one.
  pinch: (f) => {
    const b = beat(f, 2)
    return { ...BASE, y: BASE.y + (f % 4 === 0 ? 1 : 0), claws: b ? ['pinchOpen', 'pinchClosed'] : ['pinchClosed', 'pinchOpen'], look: b ? -1 : 1 }
  },
}

const drawPose = (c: CanvasRenderingContext2D, p: Pose) => {
  const px = (x: number, y: number, w = 1, h = 1) => c.fillRect((p.x + x) * 2, (p.y + y) * 2, w * 2, h * 2)
  for (let row = 0; row < p.h; row++) px(p.rowShift?.(row) ?? 0, row, p.w, 1)
  CLAWS[p.claws[0]].forEach(([x, y, w, h]) => px(x, y, w, h))
  CLAWS[p.claws[1]].forEach(([x, y, w, h]) => px(p.w - x - w, y, w, h))
  const legX = [1, 3, p.w - 4, p.w - 2]
  p.legs.forEach((h, i) => h && px(legX[i]!, p.h, 1, h))

  // Face, cut out of the body.
  c.save()
  c.globalCompositeOperation = 'destination-out'
  const eyeX = [3, p.w - 4]
  for (const x of eyeX) {
    if (p.eyes === 'closed') px(x - 1, 3, 2, 1)
    else px(x + p.look, 2, 1, p.eyes === 'wide' ? 3 : 2)
  }
  c.restore()
}

export interface CrabMood {
  running: boolean
  waiting: boolean
  sweating: boolean
}

/**
 * Sleeps when nothing runs or waits, looks puzzled (the caller adds a "?") when only waiting
 * sessions are left, dances while sessions run and waves both claws if one also waits.
 */
export const drawCrab = (c: CanvasRenderingContext2D, m: CrabMood, dance: CrabDance, f: number) => {
  let pose: Pose
  if (m.running) {
    pose = DANCES[dance](f)
    // Raised claws need the body at rest height to stay inside the icon.
    if (m.waiting) pose = { ...pose, y: Math.max(pose.y, BASE.y), claws: beat(f, 2) ? ['up', 'upHigh'] : ['upHigh', 'up'], eyes: 'wide' }
  } else if (m.waiting) {
    pose = { ...BASE, eyes: 'wide' }
  } else {
    pose = { ...BASE, y: BASE.y + 1 + beat(f, 8), legs: [0, 0, 0, 0], eyes: 'closed' }
  }
  drawPose(c, pose)
  if (m.sweating) {
    c.fillRect(40, 0, 2, 2)
    c.fillRect(38, 2, 4, 4)
  }
}
