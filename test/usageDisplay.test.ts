import { describe, expect, it } from 'vitest'
import type { CodexUsage, Limits } from '../src/core/types.js'
import { displayedCodex, usageGauges } from '../src/shared/usageDisplay.js'

const window = (percent: number) => ({ percent, resetsAt: null, resetsText: '' })
const limits: Limits = { session: window(35), week: window(50), weekModels: [], fetchedAt: 0, error: null }
const codex: CodexUsage = {
  windows: [{ ...window(62), durationMinutes: 10080 }],
  dailyTokens: [{ date: '2026-11-07', tokens: 1000 }],
  limitError: null,
}
const claudeOnly = { claude: true, codex: false }
const codexOnly = { claude: false, codex: true }
const both = { claude: true, codex: true }
const neither = { claude: false, codex: false }

describe('usage provider selection', () => {
  it('keeps a hidden provider out of the compact gauges and usage totals', () => {
    expect(usageGauges(claudeOnly, { limits, codex }).map(g => g.window?.percent)).toEqual([35, 50])
    expect(displayedCodex(claudeOnly, codex)).toBeUndefined()
    expect(usageGauges(codexOnly, { limits, codex })).toEqual([
      { provider: 'Codex', period: '7d', window: codex.windows[0] },
    ])
  })

  it('shows one window per provider when both are on, with the actual fallback period', () => {
    expect(usageGauges(both, { limits, codex }).map(g => [g.provider, g.period, g.window?.percent])).toEqual([
      ['Claude', '5h', 35],
      ['Codex', '7d', 62],
    ])
  })

  it('shows an unavailable Codex gauge when only Codex is on and no data has arrived', () => {
    expect(usageGauges(codexOnly, { limits })).toEqual([{ provider: 'Codex', period: '', window: null }])
    expect(displayedCodex(codexOnly)?.limitError).toBe('Codex limits unavailable')
    expect(displayedCodex(both)).toBeUndefined()
  })

  it('shows no gauges and no Codex usage when neither provider is on', () => {
    expect(usageGauges(neither, { limits, codex })).toEqual([])
    expect(displayedCodex(neither, codex)).toBeUndefined()
  })
})
