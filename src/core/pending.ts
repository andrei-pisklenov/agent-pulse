import { open, stat } from 'node:fs/promises'

const TAIL_BYTES = 256 * 1024
const MAX_LEN = 240

interface Block {
  type?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  text?: string
  tool_use_id?: string
}

const clip = (text: string) => {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > MAX_LEN ? `${oneLine.slice(0, MAX_LEN - 1)}…` : oneLine
}

/** Describes what a pending tool call is asking the user for. */
export const describeToolUse = (name: string, input: Record<string, unknown> = {}): string => {
  const str = (key: string) => (typeof input[key] === 'string' ? input[key] : '')
  switch (name) {
    case 'AskUserQuestion': {
      const questions = Array.isArray(input.questions) ? input.questions as { question?: string }[] : []
      return clip(questions.map(q => q.question ?? '').filter(Boolean).join(' · ') || 'Question for you')
    }
    case 'ExitPlanMode':
      return 'Approve the plan'
    case 'Bash':
      return clip(`Allow Bash: ${str('description') || str('command')}`)
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return clip(`Allow ${name}: ${str('file_path').split('/').slice(-2).join('/')}`)
    case 'WebFetch':
      return clip(`Allow WebFetch: ${str('url')}`)
    default:
      return clip(`Allow ${name.replace(/^mcp__[^_]+__/, '')}`)
  }
}

/**
 * Finds what a waiting session is asking: the last tool call without a result yet, or else
 * the last thing the assistant said. Reads only the end of the transcript.
 */
export const parsePendingPrompt = (tail: string): string | null => {
  const lines = tail.split('\n')
  const answered = new Set<string>()
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (!line.includes('"assistant"') && !line.includes('tool_result')) continue
    let d: { type?: string, message?: { content?: unknown } }
    try {
      d = JSON.parse(line) as typeof d
    } catch {
      continue
    }
    const content = Array.isArray(d.message?.content) ? d.message.content as Block[] : []
    if (d.type === 'user') {
      for (const b of content) if (b.type === 'tool_result' && b.tool_use_id) answered.add(b.tool_use_id)
      continue
    }
    if (d.type !== 'assistant') continue
    const pendingTool = [...content].reverse().find(b => b.type === 'tool_use' && b.id && !answered.has(b.id))
    if (pendingTool?.name) return describeToolUse(pendingTool.name, pendingTool.input)
    const text = [...content].reverse().find(b => b.type === 'text' && b.text?.trim())
    if (text?.text) return clip(text.text.split('\n').filter(l => l.trim()).slice(-1)[0] ?? text.text)
  }
  return null
}

const cache = new Map<string, { size: number, prompt: string | null }>()

export const readPendingPrompt = async (path: string): Promise<string | null> => {
  try {
    const { size } = await stat(path)
    const cached = cache.get(path)
    if (cached?.size === size) return cached.prompt
    const handle = await open(path, 'r')
    try {
      const length = Math.min(size, TAIL_BYTES)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      const prompt = parsePendingPrompt(buffer.toString('utf8'))
      cache.set(path, { size, prompt })
      return prompt
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}
