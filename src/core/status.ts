import { basename, sep } from 'node:path'
import type { DesktopSession } from './desktopSessions.js'
import type { LiveSession } from './liveSessions.js'
import type { RawStatus, SessionStatus } from './types.js'

/** What the tracker remembers about a session between polls (persisted across app restarts). */
export interface TrackState {
  raw: RawStatus
  /** When the current raw status began. */
  rawSince: number
  /** Set when a turn ended (busy → idle) and the session has not been opened since. */
  finishedAt: number | null
}

export interface Derived {
  state: TrackState
  status: SessionStatus
  statusSince: number
}

export const deriveStatus = (
  prev: TrackState | undefined,
  live: LiveSession,
  desktop: DesktopSession | undefined,
  now: number,
): Derived => {
  const since = live.statusUpdatedAt || now
  if (live.status !== 'idle') {
    return { state: { raw: live.status, rawSince: since, finishedAt: null }, status: live.status, statusSince: since }
  }
  let finishedAt = prev?.finishedAt ?? null
  if (prev && prev.raw === 'busy') finishedAt = since
  // Opening the session in the desktop app counts as reading it.
  if (finishedAt !== null && desktop && desktop.lastFocusedAt > finishedAt) finishedAt = null
  return {
    state: { raw: 'idle', rawSince: since, finishedAt },
    status: finishedAt === null ? 'idle' : 'finished',
    statusSince: finishedAt ?? since,
  }
}

/** Folder name for a working directory; worktrees show their repository's name. */
export const projectName = (cwd: string): string => {
  const marker = `${sep}.claude${sep}worktrees${sep}`
  const i = cwd.indexOf(marker)
  return basename(i >= 0 ? cwd.slice(0, i) : cwd) || cwd
}

const ORDER: Record<SessionStatus, number> = { waiting: 0, busy: 1, finished: 2, idle: 3, ended: 4 }

/** Needs-input first (longest waiting on top), then running, finished, idle and ended (newest first). */
export const compareSessions = (
  a: { status: SessionStatus, statusSince: number },
  b: { status: SessionStatus, statusSince: number },
): number => {
  if (a.status !== b.status) return ORDER[a.status] - ORDER[b.status]
  return a.status === 'waiting' ? a.statusSince - b.statusSince : b.statusSince - a.statusSince
}
