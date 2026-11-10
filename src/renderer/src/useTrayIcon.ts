import { useEffect, useMemo, useRef } from 'react'
import type { Session } from '../../core/types'
import type { CrabDance, TrayIcon } from '../../shared/types'
import type { UsageGauge } from '../../shared/usageDisplay'
import { drawTrayIcon, isAnimated, type TrayMood } from './trayIcon'

const FPS = 8
/** Asleep, the crab and octopus only breathe and snore, so a quarter of the frames is enough. */
const ASLEEP_FPS = 2
/** Frames repeat after this many, so each is drawn once and then served from the cache. */
const LOOP = 240
const MAX_CACHED = 2 * LOOP

const cache = new Map<string, string>()

/** A frame as a PNG data URL, drawn the first time it is needed. */
const frameOf = (icon: TrayIcon, mood: TrayMood, frame: number, dance: CrabDance): string => {
  const key = `${icon}|${dance}|${mood.busy}|${mood.waiting}|${mood.finished}|${mood.sessionPercent}|${mood.weekPercent}|${frame}`
  let drawn = cache.get(key)
  if (drawn === undefined) {
    if (cache.size >= MAX_CACHED) cache.clear()
    drawn = drawTrayIcon(icon, mood, frame, dance) ?? ''
    cache.set(key, drawn)
  }
  return drawn
}

/** Keeps the menu-bar icon in sync with the snapshot, animating it while something is going on. */
export const useTrayIcon = (icon: TrayIcon, dance: CrabDance, s: Session[], gauges: UsageGauge[]) => {
  const busy = s.filter(x => x.status === 'busy').length
  const waiting = s.filter(x => x.status === 'waiting' && !x.snoozedUntil).length
  const finished = s.filter(x => x.status === 'finished').length
  const sessionPercent = gauges[0]?.window?.percent ?? null
  const weekPercent = gauges[1]?.window?.percent ?? null
  const mood = useMemo<TrayMood>(
    () => ({ busy, waiting, finished, sessionPercent, weekPercent }),
    [busy, waiting, finished, sessionPercent, weekPercent],
  )

  // Survives mood changes, so a new session count doesn't snap the animation back to its start.
  const frame = useRef(0)

  useEffect(() => {
    let last = ''
    // Asleep it ticks less often but steps further, so it moves at the same pace.
    const asleep = mood.busy === 0 && mood.waiting === 0
    const fps = asleep ? ASLEEP_FPS : FPS
    const stride = FPS / fps
    const paint = () => {
      const drawn = frameOf(icon, mood, frame.current, dance)
      frame.current = (frame.current + stride) % LOOP
      if (drawn === last) return
      last = drawn
      window.pulse.setTrayImage(drawn)
    }
    paint()
    if (!isAnimated(icon, mood)) return
    const timer = window.setInterval(paint, 1000 / fps)
    return () => window.clearInterval(timer)
  }, [icon, dance, mood])
}
