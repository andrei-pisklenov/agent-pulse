import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** What the Claude desktop app records about one of its Code sessions. */
export interface DesktopSession {
  hostSessionId: string
  cliSessionId: string | null
  title: string | null
  cwd: string | null
  model: string | null
  isArchived: boolean
  createdAt: number
  lastActivityAt: number
  /** Last time the user had this session open in the app. */
  lastFocusedAt: number
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export const parseDesktopSession = (json: unknown): DesktopSession | null => {
  if (typeof json !== 'object' || json === null) return null
  const d = json as Record<string, unknown>
  const hostSessionId = str(d.sessionId)
  if (!hostSessionId?.startsWith('local_')) return null
  return {
    hostSessionId,
    cliSessionId: str(d.cliSessionId),
    title: str(d.title),
    cwd: str(d.cwd),
    model: str(d.model),
    isArchived: d.isArchived === true,
    createdAt: num(d.createdAt),
    lastActivityAt: num(d.lastActivityAt),
    lastFocusedAt: num(d.lastFocusedAt),
  }
}

/**
 * Reads desktop session records changed within `sinceMs`. The store is
 * `<root>/<account>/<org>/local_<id>.json`.
 */
export const readDesktopSessions = async (root: string, sinceMs: number): Promise<Map<string, DesktopSession>> => {
  const result = new Map<string, DesktopSession>()
  const list = async (dir: string) => {
    try {
      return await readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
  }
  for (const account of await list(root)) {
    if (!account.isDirectory()) continue
    for (const org of await list(join(root, account.name))) {
      if (!org.isDirectory()) continue
      const orgDir = join(root, account.name, org.name)
      for (const file of await list(orgDir)) {
        if (!file.name.startsWith('local_') || !file.name.endsWith('.json')) continue
        const path = join(orgDir, file.name)
        try {
          if ((await stat(path)).mtimeMs < sinceMs) continue
          const session = parseDesktopSession(JSON.parse(await readFile(path, 'utf8')))
          if (session) result.set(session.hostSessionId, session)
        } catch {
          // Being rewritten; next poll.
        }
      }
    }
  }
  return result
}
