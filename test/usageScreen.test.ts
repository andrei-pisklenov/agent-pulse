import { describe, expect, it } from 'vitest'
import { parseResetTime, parseUsageScreen } from '../src/core/usageScreen.js'

// 2026-10-28 21:07 in New York (UTC-4; clocks go back to UTC-5 on Nov 1).
const NOW = Date.UTC(2026, 9, 29, 1, 7)

const SCREEN = '\x1b[1mStatus\x1b[0m   Config   Usage   Stats\r\n'
  + ' Current session\r\n \x1b[38;5;75m███████████▌\x1b[39m                                         41% used\r\n'
  + ' Resets 1:30am (America/New_York)\r\n\r\n'
  + ' Current week (all models)\r\n ██████████████████████████████████▌         57% used\r\n'
  + ' Resets Nov 1 at 8am (America/New_York)\r\n\r\n'
  + ' What\'s contributing to your limits usage?'

describe('parseUsageScreen', () => {
  it('reads session and weekly bars', () => {
    const limits = parseUsageScreen(SCREEN, NOW)
    expect(limits?.session?.percent).toBe(41)
    expect(limits?.session?.resetsText).toBe('1:30am (America/New_York)')
    expect(limits?.session?.resetsAt).toBe(Date.UTC(2026, 9, 29, 5, 30))
    expect(limits?.week?.percent).toBe(57)
    expect(limits?.week?.resetsAt).toBe(Date.UTC(2026, 10, 1, 13, 0))
    expect(limits?.weekModels).toEqual([])
  })

  it('keeps per-model weekly bars and the last redraw', () => {
    const redraw = SCREEN.replace('41%', '40%') + SCREEN
      + ' Current week (Sonnet only) ████ 12% used Resets Nov 1 at 8am (America/New_York)'
    const limits = parseUsageScreen(redraw, NOW)
    expect(limits?.session?.percent).toBe(41)
    expect(limits?.weekModels).toEqual([
      { label: 'sonnet only', window: expect.objectContaining({ percent: 12 }) },
    ])
  })

  it('returns null for a screen without bars', () => {
    expect(parseUsageScreen('Welcome back! ? for shortcuts', NOW)).toBeNull()
  })
})

describe('parseResetTime', () => {
  it('rolls a time already past today over to tomorrow', () => {
    expect(parseResetTime('9pm (America/New_York)', NOW)).toBe(Date.UTC(2026, 9, 30, 1, 0))
  })

  it('moves a January date seen in December into next year', () => {
    const dec = Date.UTC(2026, 11, 30, 12)
    expect(parseResetTime('Jan 2 at 8am (UTC)', dec)).toBe(Date.UTC(2027, 0, 2, 8))
  })

  it('returns null without a time', () => {
    expect(parseResetTime('soon', NOW)).toBeNull()
  })
})
