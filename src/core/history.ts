import { open, readFile, stat, writeFile } from 'node:fs/promises'
import { localDay } from './days.js'
import { listTranscriptFiles, parseUsageLine, TRANSCRIPT_CHUNK } from './transcripts.js'
import { addTokens, emptyTokens, type DailyTokens, type TokenCounts } from './types.js'

const DAY = 86_400_000
/** Response ids remembered per file; one response's lines are written next to each other. */
const RECENT_KEYS = 8

type Packed = [input: number, output: number, cacheWrite: number, cacheRead: number]

interface FileEntry {
  /** Bytes read so far, up to the last complete line. */
  offset: number
  /** Tokens per local day ("2026-11-10"). */
  days: Record<string, Packed>
  keys: string[]
}

interface Cache {
  v: 1
  files: Record<string, FileEntry>
}

export { localDay }

const unpack = (p: Packed): TokenCounts => ({ input: p[0], output: p[1], cacheWrite: p[2], cacheRead: p[3] })

/**
 * Claude Code tokens per day for the last `days` days, from ~/.claude/projects transcripts.
 * Each file's byte offset and daily totals are kept in a small JSON cache, so an update reads
 * only what was appended since the last one, and files that did not change are not opened.
 */
export class UsageHistory {
  private cache: Cache = { v: 1, files: {} }
  private loaded = false

  constructor(private readonly root: string, private readonly cachePath: string | null, private readonly days = 31) {}

  async update(now = Date.now()): Promise<void> {
    await this.load()
    const since = new Date(now).setHours(0, 0, 0, 0) - (this.days - 1) * DAY
    const oldest = localDay(since)
    const current = new Set<string>()
    for (const file of await listTranscriptFiles(this.root)) {
      try {
        const info = await stat(file.path)
        // A file not written to since the window began holds nothing inside it.
        if (info.mtimeMs < since) continue
        current.add(file.path)
        let entry = this.cache.files[file.path]
        if (!entry || info.size < entry.offset) entry = { offset: 0, days: {}, keys: [] }
        if (info.size > entry.offset) await this.readFrom(file.path, entry, info.size, since)
        this.cache.files[file.path] = entry
      } catch {
        // Deleted between listing and reading.
      }
    }
    // Files that left the window go, and so do the days before it.
    this.cache.files = Object.fromEntries(Object.entries(this.cache.files)
      .filter(([path]) => current.has(path))
      .map(([path, entry]) => [path, { ...entry, days: Object.fromEntries(Object.entries(entry.days).filter(([day]) => day >= oldest)) }]))
    await this.save()
  }

  /** One entry per day, oldest first, ending today; days without use are zero. */
  daily(now = Date.now()): DailyTokens[] {
    const sums = new Map<string, TokenCounts>()
    for (const entry of Object.values(this.cache.files)) {
      for (const [day, packed] of Object.entries(entry.days)) sums.set(day, addTokens(sums.get(day) ?? emptyTokens(), unpack(packed)))
    }
    const today = new Date(now).setHours(12, 0, 0, 0)
    return Array.from({ length: this.days }, (_, i) => {
      const date = localDay(today - (this.days - 1 - i) * DAY)
      return { date, tokens: sums.get(date) ?? emptyTokens() }
    })
  }

  private async readFrom(path: string, entry: FileEntry, size: number, since: number): Promise<void> {
    const handle = await open(path, 'r')
    const recent = new Set(entry.keys)
    let partial = ''
    let offset = entry.offset
    try {
      while (offset < size) {
        const buffer = Buffer.alloc(Math.min(size - offset, TRANSCRIPT_CHUNK))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
        if (bytesRead === 0) break
        offset += bytesRead
        const lines = (partial + buffer.subarray(0, bytesRead).toString('utf8')).split('\n')
        partial = lines.pop() ?? ''
        for (const line of lines) {
          const usage = parseUsageLine(line)
          if (!usage || usage.at < since) continue
          if (usage.key) {
            if (recent.has(usage.key)) continue
            recent.add(usage.key)
            if (recent.size > RECENT_KEYS) recent.delete(recent.values().next().value!)
          }
          const day = localDay(usage.at)
          const p = entry.days[day] ?? [0, 0, 0, 0]
          const t = usage.tokens
          entry.days[day] = [p[0] + t.input, p[1] + t.output, p[2] + t.cacheWrite, p[3] + t.cacheRead]
        }
      }
    } finally {
      await handle.close()
    }
    // An unfinished last line is read again next time.
    entry.offset = offset - Buffer.byteLength(partial)
    entry.keys = [...recent]
  }

  private async load(): Promise<void> {
    if (this.loaded || !this.cachePath) return
    this.loaded = true
    try {
      const raw = JSON.parse(await readFile(this.cachePath, 'utf8')) as Partial<Cache>
      if (raw.v === 1 && raw.files && typeof raw.files === 'object') this.cache = { v: 1, files: raw.files }
    } catch {
      // No cache yet: the first update reads the whole window once.
    }
  }

  private async save(): Promise<void> {
    if (!this.cachePath) return
    await writeFile(this.cachePath, JSON.stringify(this.cache)).catch(() => undefined)
  }
}
