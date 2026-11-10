import { open, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { addTokens, emptyTokens, type TokenCounts } from './types.js'

const HOUR = 3_600_000
export const TRANSCRIPT_CHUNK = 8 * 1024 * 1024
const CHUNK = TRANSCRIPT_CHUNK

export interface TranscriptFile {
  path: string
  /** The top-level session this file is billed to. */
  sessionId: string
  subagent: boolean
}

/** Every transcript under ~/.claude/projects: one per session, plus its subagents' files. */
export const listTranscriptFiles = async (root: string): Promise<TranscriptFile[]> => {
  const files: TranscriptFile[] = []
  const entries = async (dir: string) => {
    try {
      return await readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
  }
  for (const project of await entries(root)) {
    if (!project.isDirectory()) continue
    const projectDir = join(root, project.name)
    for (const entry of await entries(projectDir)) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push({ path: join(projectDir, entry.name), sessionId: basename(entry.name, '.jsonl'), subagent: false })
      } else if (entry.isDirectory()) {
        const subagents = join(projectDir, entry.name, 'subagents')
        for (const sub of await entries(subagents)) {
          if (sub.isFile() && sub.name.endsWith('.jsonl')) {
            files.push({ path: join(subagents, sub.name), sessionId: entry.name, subagent: true })
          }
        }
      }
    }
  }
  return files
}

interface FileCursor {
  offset: number
  /** Bytes after the last newline, kept until the line is complete. */
  partial: string
}

interface SessionTally {
  tokens: TokenCounts
  model: string | null
  seen: Set<string>
}

interface UsageLine {
  key: string | null
  at: number
  model: string | null
  tokens: TokenCounts
}

/** Pulls token usage out of one transcript line, or null when the line carries none. */
export const parseUsageLine = (line: string): UsageLine | null => {
  // Cheap filter first: most lines are tool output, not assistant turns.
  if (!line.includes('"usage"')) return null
  let d: Record<string, unknown>
  try {
    d = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  if (d.type !== 'assistant') return null
  const message = d.message as Record<string, unknown> | undefined
  const usage = message?.usage as Record<string, unknown> | undefined
  if (!usage) return null
  const n = (v: unknown) => (typeof v === 'number' ? v : 0)
  const id = typeof message?.id === 'string' ? message.id : null
  const at = typeof d.timestamp === 'string' ? Date.parse(d.timestamp) : NaN
  return {
    // One API response is written as several lines (one per content block) that repeat the same usage.
    key: id ? `${id}:${typeof d.requestId === 'string' ? d.requestId : ''}` : null,
    at: Number.isNaN(at) ? Date.now() : at,
    model: typeof message?.model === 'string' ? message.model : null,
    tokens: {
      input: n(usage.input_tokens),
      output: n(usage.output_tokens),
      cacheWrite: n(usage.cache_creation_input_tokens),
      cacheRead: n(usage.cache_read_input_tokens),
    },
  }
}

/**
 * Incrementally tallies token usage from ~/.claude/projects transcripts: per session (subagents
 * count towards their parent) and in hourly buckets for the today/week totals. Only bytes appended
 * since the previous scan are read.
 */
export class TokenLedger {
  private readonly cursors = new Map<string, FileCursor>()
  private readonly sessions = new Map<string, SessionTally>()
  private readonly hourly = new Map<number, TokenCounts>()
  private readonly paths = new Map<string, string>()

  constructor(private readonly root: string, private readonly horizonMs = 8 * 24 * HOUR) {}

  async scan(now = Date.now()): Promise<void> {
    const since = now - this.horizonMs
    for (const file of await listTranscriptFiles(this.root)) {
      if (!file.subagent) this.paths.set(file.sessionId, file.path)
      try {
        const info = await stat(file.path)
        if (info.mtimeMs < since) continue
        const cursor = this.cursors.get(file.path) ?? { offset: 0, partial: '' }
        if (info.size < cursor.offset) Object.assign(cursor, { offset: 0, partial: '' })
        if (info.size > cursor.offset) await this.readFrom(file, cursor, info.size)
        this.cursors.set(file.path, cursor)
      } catch {
        // Deleted between listing and reading.
      }
    }
    const oldest = Math.floor(since / HOUR) * HOUR
    for (const hour of this.hourly.keys()) if (hour < oldest) this.hourly.delete(hour)
  }

  sessionTokens(sessionId: string): TokenCounts {
    return this.sessions.get(sessionId)?.tokens ?? emptyTokens()
  }

  /** The main transcript file of a session, once a scan has seen it. */
  transcriptPath(sessionId: string): string | null {
    return this.paths.get(sessionId) ?? null
  }

  sessionModel(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.model ?? null
  }

  /** Tokens used from `fromMs` until now, at hour granularity. */
  totalSince(fromMs: number): TokenCounts {
    const start = Math.floor(fromMs / HOUR) * HOUR
    let sum = emptyTokens()
    for (const [hour, tokens] of this.hourly) if (hour >= start) sum = addTokens(sum, tokens)
    return sum
  }

  private async readFrom(file: TranscriptFile, cursor: FileCursor, size: number): Promise<void> {
    const handle = await open(file.path, 'r')
    try {
      while (cursor.offset < size) {
        const buffer = Buffer.alloc(Math.min(size - cursor.offset, CHUNK))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, cursor.offset)
        if (bytesRead === 0) break
        cursor.offset += bytesRead
        const lines = (cursor.partial + buffer.subarray(0, bytesRead).toString('utf8')).split('\n')
        cursor.partial = lines.pop() ?? ''
        for (const line of lines) this.record(parseUsageLine(line), file)
      }
    } finally {
      await handle.close()
    }
  }

  private record(usage: UsageLine | null, file: TranscriptFile): void {
    if (!usage) return
    // Subagent transcripts are billed to their parent session.
    const tally = this.sessions.get(file.sessionId) ?? { tokens: emptyTokens(), model: null, seen: new Set<string>() }
    this.sessions.set(file.sessionId, tally)
    if (usage.key) {
      if (tally.seen.has(usage.key)) return
      tally.seen.add(usage.key)
    }
    tally.tokens = addTokens(tally.tokens, usage.tokens)
    if (!file.subagent && usage.model && !usage.model.startsWith('<')) tally.model = usage.model
    const hour = Math.floor(usage.at / HOUR) * HOUR
    this.hourly.set(hour, addTokens(this.hourly.get(hour) ?? emptyTokens(), usage.tokens))
  }
}
