import { describe, expect, it } from 'vitest'
import { TRUST_PROMPT, parseResetTime, parseUsageScreen, renderScreen, trustPromptSelection } from '../src/core/usageScreen.js'

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

// The folder trust prompt as Claude Code 2.1.308 draws it, with "No, exit" selected by default.
const TRUST = '\x1b[1mQuick safety check:\x1b[22m Is this a project you created or one you trust?\r\r\n\r\r\n'
  + ' \x1b[38;5;75m❯\x1b[39m No, exit\r\r\n'
  + '   Yes, I trust this folder\r\r\n\r\r\n'
  + ' Enter to confirm · Esc to cancel\r\r\n'

// Claude Code 2.1.317 places each word with a column jump, and after Down only repaints the
// marker: up to the "No" line, a space over the old `❯`, down one line, a new `❯`.
const TRUST_2_1_317 = '\x1b[2GQuick\x1b[8Gsafety\x1b[15Gcheck:\r\r\n\r\r\n'
  + '\x1b[2G❯\x1b[4GNo,\x1b[8Gexit\r\r\n'
  + '\x1b[4GYes,\x1b[9GI\x1b[11Gtrust\x1b[17Gthis\x1b[22Gfolder\r\r\n\r\r\n'
  + '\x1b[2GEnter\x1b[8Gto\x1b[11Gconfirm\r\r\n\x1b[1C\x1b[4A\x1b]11;?\x07\x1b[c'
const DOWN_2_1_317 = '\x1b[1D\x1b[4B\r\x1b[1C\x1b[4A \r\x1b[1C\x1b[1B❯\r\r\n\r\n\r\n\x1b[1C\x1b[3A'

describe('trustPromptSelection', () => {
  it('reads "No" selected by default', () => {
    expect(TRUST_PROMPT.test(TRUST)).toBe(true)
    expect(trustPromptSelection(TRUST)).toBe('no')
    expect(trustPromptSelection(TRUST_2_1_317)).toBe('no')
  })

  it('reads "Yes" selected', () => {
    const yes = TRUST.replace(' \x1b[38;5;75m❯\x1b[39m No, exit\r\r\n   Yes', '   No, exit\r\r\n \x1b[38;5;75m❯\x1b[39m Yes')
    expect(trustPromptSelection(yes)).toBe('yes')
  })

  it('reads the screen after Down', () => {
    expect(trustPromptSelection('No, exit ❯ Yes, I trust this folder')).toBe('yes')
    expect(trustPromptSelection(TRUST + '\x1b[5A\x1b[2K   No, exit\r\n\x1b[2K \x1b[38;5;75m❯\x1b[39m Yes, I trust this folder')).toBe('yes')
  })

  it('follows a repaint that only moves the marker', () => {
    expect(trustPromptSelection(TRUST_2_1_317 + DOWN_2_1_317)).toBe('yes')
  })

  it('reads the older numbered wording', () => {
    const older = 'Do you trust the files in this folder?\r\r\n ❯ 1. Yes, proceed\r\r\n   2. No, exit'
    expect(TRUST_PROMPT.test(older)).toBe(true)
    expect(trustPromptSelection(older)).toBe('yes')
  })

  it('returns null before an option is marked', () => {
    expect(trustPromptSelection('Quick safety check: Is this a project you created or one you trust?')).toBeNull()
  })
})

describe('renderScreen', () => {
  it('applies cursor moves and overwrites', () => {
    // Up a line, overwrite "b" with "q", then erase from column 3 to the end of the line.
    expect(renderScreen('abc\r\nxyz\x1b[1A\x1b[2Gq\x1b[3G\x1b[K')).toEqual(['aq', 'xyz'])
  })

  it('skips mode switches and charset selection', () => {
    expect(renderScreen('\x1b[?1006l\x1b[>4m\x1b[<u\x1b(B\x0fok\x1b]11;?\x07')).toEqual(['ok'])
  })
})
