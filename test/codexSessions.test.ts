import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCodexSessions } from '../src/core/codexSessions.js'

const NOW = Date.UTC(2026, 10, 18, 12)
const SECONDS = NOW / 1000

describe('readCodexSessions', () => {
  let root: string
  let state: DatabaseSync
  let history: DatabaseSync

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pulse-codex-'))
    vi.stubEnv('CODEX_HOME', root)
    state = new DatabaseSync(join(root, 'state_5.sqlite'))
    history = new DatabaseSync(join(root, 'thread_history_1.sqlite'))
    state.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, cwd TEXT, name TEXT, title TEXT, model TEXT,
        updated_at INTEGER, archived INTEGER, originator TEXT, thread_source TEXT,
        source TEXT, attached_thread_parent_id TEXT
      );
    `)
    history.exec(`
      CREATE TABLE thread_turns (
        thread_id TEXT, started_at INTEGER, status TEXT,
        completed_at INTEGER, rollout_ordinal INTEGER
      );
    `)
  })

  afterEach(async () => {
    state.close()
    history.close()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  const addThread = (threadSource: string | null) => {
    state.prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'video', '/projects/videos', 'FieldCraft video', 'Original prompt', 'gpt-6.1-sol',
      SECONDS, 0, 'Codex Desktop', threadSource, 'vscode', null,
    )
    history.prepare('INSERT INTO thread_turns VALUES (?, ?, ?, ?, ?)').run('video', SECONDS - 60, 'inProgress', null, 1)
  }

  it.each(['user', 'agent_created_thread', 'agent_forked_thread', null])('includes an active %s chat', async (source) => {
    addThread(source)
    expect(await readCodexSessions(NOW)).toEqual([
      expect.objectContaining({
        id: 'codex:video', source: 'codex', title: 'FieldCraft video',
        status: 'busy', startedAt: NOW - 60_000,
      }),
    ])
  })

  it.each(['subagent', 'guardian_review', 'onboarding_checklist'])('excludes internal %s threads', async (source) => {
    addThread(source)
    expect(await readCodexSessions(NOW)).toEqual([])
  })

  it('excludes subagents even when their thread source is user', async () => {
    addThread('user')
    state.prepare('UPDATE threads SET source = ?').run(JSON.stringify({ subagent: { thread_spawn: {} } }))
    expect(await readCodexSessions(NOW)).toEqual([])
  })

  it('uses the latest turn so an older unfinished turn cannot keep a chat running', async () => {
    addThread('agent_created_thread')
    history.prepare('INSERT INTO thread_turns VALUES (?, ?, ?, ?, ?)').run('video', SECONDS - 30, 'completed', SECONDS, 2)
    expect(await readCodexSessions(NOW)).toEqual([])
  })

  it('excludes stale unfinished turns', async () => {
    addThread('agent_created_thread')
    state.prepare('UPDATE threads SET updated_at = ?').run(SECONDS - 1801)
    expect(await readCodexSessions(NOW)).toEqual([])
  })

  it('excludes archived chats', async () => {
    addThread('agent_forked_thread')
    state.exec('UPDATE threads SET archived = 1')
    expect(await readCodexSessions(NOW)).toEqual([])
  })
})
