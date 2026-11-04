import { describe, expect, it } from 'vitest'
import type { DesktopSession } from '../src/core/desktopSessions.js'
import type { LiveSession } from '../src/core/liveSessions.js'
import { compareSessions, deriveStatus, projectName } from '../src/core/status.js'

const live = (status: LiveSession['status'], statusUpdatedAt: number): LiveSession => ({
  pid: 1, sessionId: 's', cwd: '/x', startedAt: 0, source: 'desktop', name: null,
  status, statusUpdatedAt, waitingFor: null, hostSessionId: 'local_1',
})
const desktop = (lastFocusedAt: number) => ({ lastFocusedAt }) as DesktopSession

describe('deriveStatus', () => {
  it('marks busy → idle as finished until the session is focused', () => {
    const busy = deriveStatus(undefined, live('busy', 10), undefined, 10)
    const done = deriveStatus(busy.state, live('idle', 20), desktop(5), 20)
    expect(done.status).toBe('finished')
    expect(done.statusSince).toBe(20)
    expect(deriveStatus(done.state, live('idle', 20), desktop(15), 30).status).toBe('finished')
    expect(deriveStatus(done.state, live('idle', 20), desktop(25), 30).status).toBe('idle')
  })

  it('does not mark sessions that were already idle when first seen', () => {
    expect(deriveStatus(undefined, live('idle', 5), undefined, 10).status).toBe('idle')
  })

  it('clears the finished mark when work resumes', () => {
    const done = { raw: 'idle' as const, rawSince: 20, finishedAt: 20 }
    expect(deriveStatus(done, live('waiting', 30), undefined, 30)).toMatchObject({
      status: 'waiting', state: { finishedAt: null },
    })
  })
})

describe('projectName', () => {
  it('uses the repository name for worktrees', () => {
    expect(projectName('/u/projects/app/.claude/worktrees/kind-babbage-1')).toBe('app')
    expect(projectName('/u/projects/app')).toBe('app')
  })
})

describe('compareSessions', () => {
  it('orders by priority, longest-waiting first', () => {
    const list = [
      { status: 'idle' as const, statusSince: 9 },
      { status: 'waiting' as const, statusSince: 5 },
      { status: 'busy' as const, statusSince: 1 },
      { status: 'waiting' as const, statusSince: 2 },
    ].sort(compareSessions)
    expect(list.map(s => `${s.status}:${s.statusSince}`)).toEqual(['waiting:2', 'waiting:5', 'busy:1', 'idle:9'])
  })
})
