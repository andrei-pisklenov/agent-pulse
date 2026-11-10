import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import type { CodexLimitWindow, CodexUsage } from './types.js'

const executable = (path: string) => access(path, constants.X_OK).then(() => true, () => false)

const findCodex = async (): Promise<string | null> => {
  const candidates = [
    ...(process.env.PATH ?? '').split(delimiter).filter(isAbsolute).map(dir => join(dir, 'codex')),
    join(homedir(), '.local', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
  ]
  for (const path of new Set(candidates)) if (await executable(path)) return path
  // GUI launches can miss version manager shims on the user's login shell PATH.
  try {
    const { stdout } = await promisify(execFile)('/bin/zsh', ['-lc', 'command -v codex'], { timeout: 5000 })
    const path = stdout.trim().split('\n').at(-1) ?? ''
    return isAbsolute(path) && await executable(path) ? path : null
  } catch {
    return null
  }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const parseWindows = (value: unknown): CodexLimitWindow[] => {
  const response = record(value)
  const fallback = record(response?.rateLimits)
  // Keep the main Codex quota separate from model or feature-specific buckets.
  const bucket = record(record(response?.rateLimitsByLimitId)?.codex)
    ?? (fallback?.limitId == null || fallback.limitId === 'codex' ? fallback : undefined)
  const windows = new Map<number, CodexLimitWindow>()
  for (const raw of [record(bucket?.primary), record(bucket?.secondary)]) {
    const durationMinutes = raw?.windowDurationMins
    const used = raw?.usedPercent
    const reset = raw?.resetsAt
    if (typeof durationMinutes !== 'number' || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0
      || typeof used !== 'number' || !Number.isFinite(used)) continue
    windows.set(durationMinutes, {
      durationMinutes,
      percent: Math.min(100, Math.max(0, Math.round(used))),
      resetsAt: typeof reset === 'number' && Number.isFinite(reset) && reset > 0 && reset <= 8.64e12 ? reset * 1000 : null,
      resetsText: '',
    })
  }
  return [...windows.values()].sort((a, b) => a.durationMinutes - b.durationMinutes)
}

const parseDailyTokens = (value: unknown): CodexUsage['dailyTokens'] => {
  const buckets = record(value)?.dailyUsageBuckets
  if (!Array.isArray(buckets)) return null
  const days = new Map<string, number>()
  for (const bucket of buckets) {
    const date = record(bucket)?.startDate
    const tokens = record(bucket)?.tokens
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0) days.set(date, tokens)
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).slice(0, 31).map(([date, tokens]) => ({ date, tokens }))
}

/** Ask the installed CLI for account data over stdio. No login or model turn is started. */
export const probeCodexUsage = async (): Promise<CodexUsage | null> => {
  const bin = await findCodex()
  if (!bin) return null
  return new Promise((resolve) => {
    const child = spawn(bin, ['app-server', '--listen', 'stdio://'], {
      cwd: homedir(),
      env: { ...process.env, PATH: [dirname(bin), process.env.PATH].filter(Boolean).join(delimiter) },
      stdio: ['pipe', 'pipe', 'ignore'],
      detached: true,
    })
    const usage: CodexUsage = { windows: [], dailyTokens: null, limitError: 'Codex limits unavailable' }
    let buffer = ''
    let done = false
    let limitsReceived = false
    let tokensReceived = false
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal)
      } catch {
        // The process group already exited.
      }
    }
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timeout)
      child.stdin.end()
      kill('SIGTERM')
      setTimeout(() => kill('SIGKILL'), 1000).unref()
      resolve(usage)
    }
    const send = (message: object) => child.stdin.write(JSON.stringify(message) + '\n')
    const timeout = setTimeout(finish, 12_000)
    child.on('error', finish)
    child.on('close', finish)
    child.stdin.on('error', finish)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (done) return
      buffer += chunk
      if (buffer.length > 2_000_000) return finish()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        let reply: Record<string, unknown> | undefined
        try {
          reply = record(JSON.parse(line))
        } catch {
          continue
        }
        if (reply?.id === 1) {
          if (reply.error) return finish()
          send({ method: 'initialized' })
          send({ id: 2, method: 'account/rateLimits/read' })
          send({ id: 3, method: 'account/usage/read' })
        } else if (reply?.id === 2) {
          limitsReceived = true
          if (!reply.error) {
            usage.windows = parseWindows(reply.result)
            if (usage.windows.length) usage.limitError = null
          }
        } else if (reply?.id === 3) {
          tokensReceived = true
          if (!reply.error) usage.dailyTokens = parseDailyTokens(reply.result)
        }
        if (limitsReceived && tokensReceived) return finish()
      }
    })
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agent-pulse', version: '0.1.0' } } })
  })
}
