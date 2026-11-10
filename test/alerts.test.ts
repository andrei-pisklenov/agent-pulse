import { describe, expect, it } from 'vitest'
import type { Session } from '../src/core/types.js'
import { dueWaits, isQuiet, limitWarnings, waitKey } from '../src/main/alerts.js'
import { defaultSettings } from '../src/shared/types.js'

const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m).getTime()

const session = (id: string, patch: Partial<Session> = {}): Session => ({
  id, pid: 1, source: 'cli', title: id, cwd: '/x', project: 'x', status: 'waiting', waitingFor: null, pendingPrompt: null,
  snoozedUntil: null, statusSince: at(12), startedAt: at(11), hostSessionId: null, model: null, tokens: null, ...patch,
})

describe('isQuiet', () => {
  it('handles ranges inside a day and across midnight', () => {
    expect(isQuiet({ enabled: true, from: '22:00', to: '08:00' }, at(23))).toBe(true)
    expect(isQuiet({ enabled: true, from: '22:00', to: '08:00' }, at(7, 59))).toBe(true)
    expect(isQuiet({ enabled: true, from: '22:00', to: '08:00' }, at(8))).toBe(false)
    expect(isQuiet({ enabled: true, from: '13:00', to: '14:00' }, at(13, 30))).toBe(true)
    expect(isQuiet({ enabled: false, from: '00:00', to: '23:59' }, at(12))).toBe(false)
  })
})

describe('dueWaits', () => {
  it('alerts once a wait has lasted long enough, and says when the next one is due', () => {
    const early = session('a', { statusSince: at(12) })
    const late = session('b', { statusSince: at(12, 4) })
    const snoozed = session('c', { snoozedUntil: at(13) })
    const { due, next } = dueWaits([early, late, snoozed], new Set(), 5, at(12, 6))
    expect(due.map(s => s.id)).toEqual(['a'])
    expect(next).toBe(at(12, 9))
    expect(dueWaits([early], new Set([waitKey(early)]), 0, at(12, 6)).due).toEqual([])
  })
})

describe('limitWarnings', () => {
  const settings = { ...defaultSettings, limitWarnPercent: 90 }
  const limits = (percent: number, resetsAt: number) => ({
    session: { percent, resetsAt, resetsText: '' }, week: null, fetchedAt: 0, error: null,
  })

  it('warns once per window when a limit passes the threshold', () => {
    const snapshot = { limits: limits(92, at(14)) } as never
    const first = limitWarnings(settings, snapshot, new Set(), at(12))
    expect(first.map(w => w.title)).toEqual(['Claude 5-hour limit at 92%'])
    expect(limitWarnings(settings, snapshot, new Set(first.map(w => w.key)), at(12))).toEqual([])
  })

  it('warns when the pace runs out before the reset', () => {
    // 60% used 2 of 5 hours in: runs out well before the reset in 3 hours.
    const [warning] = limitWarnings(settings, { limits: limits(60, at(15)) } as never, new Set(), at(12))
    expect(warning?.title).toBe('Claude 5-hour limit may run out')
    expect(limitWarnings({ ...settings, warnRunOut: false }, { limits: limits(60, at(15)) } as never, new Set(), at(12))).toEqual([])
  })
})
