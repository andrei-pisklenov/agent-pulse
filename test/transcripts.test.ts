import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { TokenLedger } from '../src/core/transcripts.js'

const NOW = Date.UTC(2026, 9, 28, 12)

const assistant = (id: string, at: number, output: number, model = 'claude-opus-5-5') => JSON.stringify({
  type: 'assistant',
  timestamp: new Date(at).toISOString(),
  requestId: `req_${id}`,
  message: {
    id, model,
    usage: { input_tokens: 10, output_tokens: output, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 },
  },
}) + '\n'

describe('TokenLedger', () => {
  let root: string
  let project: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pulse-ledger-'))
    project = join(root, '-Users-me-app')
    await mkdir(join(project, 'abc', 'subagents'), { recursive: true })
  })

  it('counts each API response once and bills subagents to the parent', async () => {
    await writeFile(join(project, 'abc.jsonl'),
      '{"type":"user","message":{"content":"hi"}}\n'
      + assistant('m1', NOW - 1000, 5)
      + assistant('m1', NOW - 1000, 5)
      + assistant('m2', NOW - 500, 7))
    await writeFile(join(project, 'abc', 'subagents', 'agent-1.jsonl'), assistant('m3', NOW - 100, 1, 'claude-haiku-5-5'))

    const ledger = new TokenLedger(root)
    await ledger.scan(NOW)
    expect(ledger.sessionTokens('abc')).toEqual({ input: 30, output: 13, cacheWrite: 300, cacheRead: 3000 })
    expect(ledger.sessionModel('abc')).toBe('claude-opus-5-5')
  })

  it('reads only appended lines, including a line split across scans', async () => {
    const file = join(project, 'abc.jsonl')
    const line = assistant('m2', NOW, 7)
    await writeFile(file, assistant('m1', NOW, 5) + line.slice(0, 40))
    const ledger = new TokenLedger(root)
    await ledger.scan(NOW)
    expect(ledger.sessionTokens('abc').output).toBe(5)
    await appendFile(file, line.slice(40))
    await ledger.scan(NOW)
    expect(ledger.sessionTokens('abc').output).toBe(12)
  })

  it('sums tokens by time window', async () => {
    await writeFile(join(project, 'abc.jsonl'), assistant('old', NOW - 3 * 86_400_000, 50) + assistant('new', NOW - 60_000, 7))
    const ledger = new TokenLedger(root)
    await ledger.scan(NOW)
    expect(ledger.totalSince(NOW - 3_600_000).output).toBe(7)
    expect(ledger.totalSince(NOW - 7 * 86_400_000).output).toBe(57)
  })
})
