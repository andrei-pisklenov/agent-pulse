import { describe, expect, it } from 'vitest'
import { forecastLimit, SESSION_WINDOW_MS, WEEK_WINDOW_MS } from '../src/core/forecast.js'

const H = 3_600_000
const NOW = Date.UTC(2026, 9, 28, 20)

describe('forecastLimit', () => {
  it('predicts when the session limit runs out before the reset', () => {
    // 1h into a 5h window at 40% → 40%/h → full 1.5h from now, 2.5h before reset.
    const f = forecastLimit({ percent: 40, resetsAt: NOW + 4 * H, resetsText: '' }, SESSION_WINDOW_MS, NOW)
    expect(f?.exhaustsAt).toBe(NOW + 1.5 * H)
    expect(f?.projectedPercent).toBe(200)
    expect(f?.safePerHour).toBe(15)
  })

  it('reports projected use when the pace is safe', () => {
    // 4 days into the week at 40% → 70% at reset.
    const f = forecastLimit({ percent: 40, resetsAt: NOW + 3 * 24 * H, resetsText: '' }, WEEK_WINDOW_MS, NOW)
    expect(f?.exhaustsAt).toBeNull()
    expect(f?.projectedPercent).toBe(70)
  })

  it('needs a known reset and some elapsed time', () => {
    expect(forecastLimit({ percent: 5, resetsAt: null, resetsText: '' }, SESSION_WINDOW_MS, NOW)).toBeNull()
    expect(forecastLimit({ percent: 5, resetsAt: NOW + 5 * H - 1000, resetsText: '' }, SESSION_WINDOW_MS, NOW)).toBeNull()
  })
})
