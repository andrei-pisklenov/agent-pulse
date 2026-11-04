import { describe, expect, it } from 'vitest'
import { parsePendingPrompt } from '../src/core/pending.js'

const assistant = (content: unknown[]) => JSON.stringify({ type: 'assistant', message: { content } })
const result = (id: string) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id }] } })

describe('parsePendingPrompt', () => {
  it('returns the question of an unanswered AskUserQuestion', () => {
    const tail = [
      assistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
      result('t1'),
      assistant([{ type: 'text', text: 'Done.' }, {
        type: 'tool_use', id: 't2', name: 'AskUserQuestion', input: { questions: [{ question: 'Merge it into master?' }] },
      }]),
    ].join('\n')
    expect(parsePendingPrompt(tail)).toBe('Merge it into master?')
  })

  it('describes a pending permission request', () => {
    const tail = assistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf out', description: 'Clean build output' } }])
    expect(parsePendingPrompt(tail)).toBe('Allow Bash: Clean build output')
  })

  it('falls back to the last line the assistant wrote', () => {
    const tail = [
      assistant([{ type: 'tool_use', id: 't1', name: 'Read', input: {} }]),
      result('t1'),
      assistant([{ type: 'text', text: 'All tests pass.\n\nShall I open the PR?' }]),
    ].join('\n')
    expect(parsePendingPrompt(tail)).toBe('Shall I open the PR?')
  })
})
