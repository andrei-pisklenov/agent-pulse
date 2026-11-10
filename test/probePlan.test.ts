import { describe, expect, it } from 'vitest'
import { IDLE_PROBE_MS, probeDue } from '../src/core/probePlan.js'

const MIN = 60_000
const EVERY = 5 * MIN

describe('probeDue', () => {
  it('probes right away the first time', () => {
    expect(probeDue({ lastAt: null, active: false, resetsAt: [] }, EVERY, 0)).toBe(true)
  })

  it('keeps the normal interval while sessions run', () => {
    const track = { lastAt: 0, active: true, resetsAt: [] }
    expect(probeDue(track, EVERY, 2 * MIN)).toBe(false)
    expect(probeDue(track, EVERY, EVERY - 1000)).toBe(true)
  })

  it('waits for the idle interval when nothing ran', () => {
    const track = { lastAt: 0, active: false, resetsAt: [] }
    expect(probeDue(track, EVERY, 10 * MIN)).toBe(false)
    expect(probeDue(track, EVERY, IDLE_PROBE_MS)).toBe(true)
  })

  it('reads a limit again once it has reset', () => {
    const track = { lastAt: 0, active: false, resetsAt: [8 * MIN, null] }
    expect(probeDue(track, EVERY, 7 * MIN)).toBe(false)
    expect(probeDue(track, EVERY, 9 * MIN)).toBe(true)
  })

  it('never probes less often than the chosen interval when it is longer than the idle one', () => {
    expect(probeDue({ lastAt: 0, active: false, resetsAt: [] }, 30 * MIN, 25 * MIN)).toBe(false)
  })
})
