import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RawStatus, SessionSource } from './types.js'

export interface LiveSession {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  source: SessionSource
  name: string | null
  status: RawStatus
  statusUpdatedAt: number
  waitingFor: string | null
  hostSessionId: string | null
}

const sourceOf = (entrypoint: unknown): SessionSource => {
  if (entrypoint === 'claude-desktop') return 'desktop'
  if (entrypoint === 'claude-vscode') return 'vscode'
  return 'cli'
}

const rawStatusOf = (status: unknown): RawStatus =>
  status === 'busy' || status === 'waiting' ? status : 'idle'

export const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export const parseLiveSession = (json: unknown): LiveSession | null => {
  if (typeof json !== 'object' || json === null) return null
  const d = json as Record<string, unknown>
  if (typeof d.pid !== 'number' || typeof d.sessionId !== 'string' || typeof d.cwd !== 'string') return null
  if (d.kind !== undefined && d.kind !== 'interactive') return null
  const startedAt = typeof d.startedAt === 'number' ? d.startedAt : Date.now()
  return {
    pid: d.pid,
    sessionId: d.sessionId,
    cwd: d.cwd,
    startedAt,
    source: sourceOf(d.entrypoint),
    name: typeof d.name === 'string' && d.name.trim() ? d.name : null,
    status: rawStatusOf(d.status),
    statusUpdatedAt: typeof d.statusUpdatedAt === 'number' ? d.statusUpdatedAt : startedAt,
    waitingFor: typeof d.waitingFor === 'string' ? d.waitingFor : null,
    hostSessionId: typeof d.hostSessionId === 'string' ? d.hostSessionId : null,
  }
}

/** Reads every running session; files left behind by dead processes are skipped. */
export const readLiveSessions = async (dir: string, alive = isPidAlive): Promise<LiveSession[]> => {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const sessions = await Promise.all(names.filter(n => n.endsWith('.json')).map(async (name) => {
    try {
      const session = parseLiveSession(JSON.parse(await readFile(join(dir, name), 'utf8')))
      return session && alive(session.pid) ? session : null
    } catch {
      // Claude rewrites these files constantly; a half-written one is picked up on the next poll.
      return null
    }
  }))
  return sessions.filter(s => s !== null)
}
