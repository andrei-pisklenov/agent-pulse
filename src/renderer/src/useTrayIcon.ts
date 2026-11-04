import { useEffect, useMemo } from 'react'
import type { Snapshot } from '../../core/types'
import type { CrabDance, TrayIcon } from '../../shared/types'
import { drawTrayIcon, isAnimated, type TrayMood } from './trayIcon'

const FPS = 8

/** Keeps the menu-bar icon in sync with the snapshot, animating it while something is going on. */
export const useTrayIcon = (icon: TrayIcon, dance: CrabDance, snapshot: Snapshot) => {
  const s = snapshot.sessions
  const busy = s.filter(x => x.status === 'busy').length
  const waiting = s.filter(x => x.status === 'waiting' && !x.snoozedUntil).length
  const finished = s.filter(x => x.status === 'finished').length
  const sessionPercent = snapshot.limits?.session?.percent ?? null
  const weekPercent = snapshot.limits?.week?.percent ?? null
  const mood = useMemo<TrayMood>(
    () => ({ busy, waiting, finished, sessionPercent, weekPercent }),
    [busy, waiting, finished, sessionPercent, weekPercent],
  )

  useEffect(() => {
    let frame = 0
    let last = ''
    const paint = () => {
      const drawn = drawTrayIcon(icon, mood, frame++, dance) ?? ''
      if (drawn === last) return
      last = drawn
      window.pulse.setTrayImage(drawn)
    }
    paint()
    if (!isAnimated(icon, mood)) return
    const timer = window.setInterval(paint, 1000 / FPS)
    return () => window.clearInterval(timer)
  }, [icon, dance, mood])
}
