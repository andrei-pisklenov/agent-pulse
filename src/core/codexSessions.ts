import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { projectName } from './status.js'
import type { Session } from './types.js'

const STALE_SECONDS = 30 * 60

const latestDatabase = (files: string[], prefix: string): string | undefined =>
  files.filter(file => file.startsWith(prefix) && /^\d+\.sqlite$/.test(file.slice(prefix.length)))
    .sort((a, b) => Number.parseInt(b.slice(prefix.length)) - Number.parseInt(a.slice(prefix.length)))[0]

/** Codex Desktop projects its current turn and thread metadata into two local databases. */
export const readCodexSessions = async (now = Date.now()): Promise<Session[]> => {
  const root = process.env.CODEX_HOME || join(homedir(), '.codex')
  let db: DatabaseSync | undefined
  try {
    const files = await readdir(root)
    const state = latestDatabase(files, 'state_')
    const history = latestDatabase(files, 'thread_history_')
    if (!state || !history) return []
    db = new DatabaseSync(join(root, state), { readOnly: true })
    const historyUrl = pathToFileURL(join(root, history))
    historyUrl.searchParams.set('mode', 'ro')
    db.prepare('ATTACH DATABASE ? AS history').run(historyUrl.href)
    // A crash can leave an unfinished turn behind. Omit entries without recent thread activity.
    const rows = db.prepare(`
      SELECT thread.id, thread.cwd, thread.name, thread.title, thread.model,
             COALESCE(turn.started_at, thread.updated_at) AS started_at
      FROM threads AS thread
      JOIN history.thread_turns AS turn ON turn.thread_id = thread.id
      WHERE thread.archived = 0
        AND thread.originator = 'Codex Desktop'
        AND (thread.thread_source = 'user' OR thread.thread_source IS NULL)
        AND thread.source NOT LIKE '%subagent%'
        AND thread.attached_thread_parent_id IS NULL
        AND thread.updated_at >= ?
        AND turn.status = 'inProgress'
        AND turn.completed_at IS NULL
        AND turn.rollout_ordinal = (
          SELECT MAX(latest.rollout_ordinal) FROM history.thread_turns AS latest WHERE latest.thread_id = thread.id
        )
      ORDER BY started_at DESC
    `).all(Math.floor(now / 1000) - STALE_SECONDS)

    return rows.flatMap((row): Session[] => {
      if (typeof row.id !== 'string' || typeof row.cwd !== 'string' || typeof row.started_at !== 'number') return []
      const title = [row.name, row.title].find(value => typeof value === 'string' && value.trim())
      const project = projectName(row.cwd)
      const startedAt = row.started_at * 1000
      return [{
        id: `codex:${row.id}`,
        pid: null,
        source: 'codex',
        title: typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : project || 'Codex task',
        cwd: row.cwd,
        project,
        status: 'busy',
        waitingFor: null,
        pendingPrompt: null,
        snoozedUntil: null,
        statusSince: startedAt,
        startedAt,
        hostSessionId: null,
        model: typeof row.model === 'string' ? row.model : null,
        tokens: null,
      }]
    })
  } catch {
    // A missing, busy, or newer database must not interrupt Claude session collection.
    return []
  } finally {
    db?.close()
  }
}
