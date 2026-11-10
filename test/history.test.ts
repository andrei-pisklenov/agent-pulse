import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { localDay, UsageHistory } from '../src/core/history.js'

const NOW = new Date(2026, 10, 10, 15).getTime()
const DAY = 86_400_000

const assistant = (id: string, at: number, output: number) => JSON.stringify({
  type: 'assistant',
  timestamp: new Date(at).toISOString(),
  requestId: `req_${id}`,
  message: { id, usage: { input_tokens: 10, output_tokens: output, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } },
}) + '\n'

describe('UsageHistory', () => {
  let root: string
  let project: string
  let cache: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pulse-history-'))
    project = join(root, '-Users-me-app')
    cache = join(root, 'history.json')
    await mkdir(join(project, 'abc', 'subagents'), { recursive: true })
  })

  it('sums tokens per local day, counting a repeated response once', async () => {
    await writeFile(join(project, 'abc.jsonl'),
      assistant('m1', NOW - 2 * DAY, 5)
      + assistant('m1', NOW - 2 * DAY, 5)
      + assistant('m2', NOW - 1000, 7))
    await writeFile(join(project, 'abc', 'subagents', 'agent-1.jsonl'), assistant('m3', NOW - 500, 1))

    const history = new UsageHistory(root, cache, 7)
    await history.update(NOW)
    const days = history.daily(NOW)
    expect(days).toHaveLength(7)
    expect(days.at(-1)).toEqual({ date: localDay(NOW), tokens: { input: 20, output: 8, cacheWrite: 200, cacheRead: 2000 } })
    expect(days.at(-3)?.tokens.output).toBe(5)
    expect(days[0]?.tokens.output).toBe(0)
  })

  it('reads only appended lines, also after a restart from the cache', async () => {
    const file = join(project, 'abc.jsonl')
    await writeFile(file, assistant('m1', NOW - 1000, 5) + '{"type":"assistant","message":{"id":"m2","usa')
    await new UsageHistory(root, cache, 7).update(NOW)

    // The unfinished line is completed later; a fresh instance carries on from the cache.
    await appendFile(file, 'ge":{"output_tokens":3}},"timestamp":"' + new Date(NOW - 500).toISOString() + '"}\n')
    const later = new UsageHistory(root, cache, 7)
    await later.update(NOW)
    expect(later.daily(NOW).at(-1)?.tokens.output).toBe(8)
    expect(JSON.parse(await readFile(cache, 'utf8')).v).toBe(1)
  })

  it('leaves out days before the window', async () => {
    await writeFile(join(project, 'abc.jsonl'), assistant('old', NOW - 10 * DAY, 50) + assistant('new', NOW - 1000, 1))
    const history = new UsageHistory(root, null, 7)
    await history.update(NOW)
    expect(history.daily(NOW).reduce((sum, d) => sum + d.tokens.output, 0)).toBe(1)
  })
})
