import { execFile, spawn } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Limits } from './types.js'
import { TRUST_PROMPT, cleanTerminalText, parseUsageScreen, trustPromptSelection } from './usageScreen.js'

export interface ProbeOptions {
  /** Empty folder the probe runs in; sessions started there are hidden from the panel. */
  cwd: string
  claudeBin?: string
  timeoutMs?: number
}

const CANDIDATES = [
  join(homedir(), '.local', 'bin', 'claude'),
  join(homedir(), '.claude', 'local', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
]

/** Finds the `claude` binary; GUI apps don't inherit the shell's PATH. */
export const findClaudeBinary = async (): Promise<string | null> => {
  for (const path of CANDIDATES) {
    try {
      await access(path)
      return path
    } catch {
      // try next
    }
  }
  try {
    const { stdout } = await promisify(execFile)('/bin/zsh', ['-lc', 'command -v claude'], { timeout: 5000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Reads plan limits the same way a person would: starts `claude` in a pseudo-terminal (via
 * macOS `script`), types `/usage` and parses the screen. It uses Claude Code's own sign-in,
 * spends no model tokens and writes no transcript.
 */
export const probeUsage = async (options: ProbeOptions): Promise<Limits> => {
  const bin = options.claudeBin ?? await findClaudeBinary()
  if (!bin) return failed('claude CLI not found')
  await mkdir(options.cwd, { recursive: true })

  return new Promise<Limits>((resolve) => {
    // `script` needs real pipes (Node's stdio pipes are sockets), hence the `cat`s around it.
    const pty = `/usr/bin/script -q /dev/null /bin/sh -c 'stty cols 160 rows 60 2>/dev/null; exec "$0" --permission-mode default' "$0"`
    const child = spawn('/bin/sh', ['-c', `cat | ${pty} | cat`, bin], {
      cwd: options.cwd,
      env: { ...process.env, TERM: 'xterm-256color', AGENT_PULSE_PROBE: '1' },
      stdio: ['pipe', 'pipe', 'ignore'],
      // Own process group, so the whole pipeline can be stopped at once.
      detached: true,
    })
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal)
      } catch {
        // already gone
      }
    }
    let output = ''
    let ready = false
    let typed = false
    // The folder trust prompt: not seen yet, waiting for an option to be marked, moving to "Yes", answered.
    let trust: 'none' | 'choosing' | 'moving' | 'accepted' = 'none'
    let downs = 0
    let done = false
    const timers: NodeJS.Timeout[] = []

    const finish = (limits: Limits) => {
      if (done) return
      done = true
      timers.forEach(clearTimeout)
      kill('SIGTERM')
      setTimeout(() => kill('SIGKILL'), 2000).unref()
      resolve(limits)
    }
    const type = (text: string, delay: number) => timers.push(setTimeout(() => child.stdin.write(text), delay))

    // The probe folder is our own empty directory, so it is trusted. Versions differ in which option
    // they pre-select, so go by the marker on the replayed screen: Enter on "Yes", else Down and wait
    // for the redraw that moves the marker (until then the screen still shows "No").
    const answerTrust = () => {
      const selected = trustPromptSelection(output)
      if (selected === 'yes') {
        trust = 'accepted'
        type('\r', 300)
      } else if (selected === 'no' && trust === 'choosing') {
        if (downs >= 3) return finish(failed('could not select "Yes" in the folder trust prompt'))
        downs++
        trust = 'moving'
        type('\x1b[B', 300)
        // No redraw with "Yes" marked: look again at what the screen shows.
        timers.push(setTimeout(() => {
          if (trust !== 'moving') return
          trust = 'choosing'
          answerTrust()
        }, 1800))
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      const screen = cleanTerminalText(output.slice(-20_000))
      if (trust === 'none' && TRUST_PROMPT.test(screen)) trust = 'choosing'
      if (trust === 'choosing' || trust === 'moving') {
        answerTrust()
        return
      }
      if (!typed && /for shortcuts|\? for|bypass|Try "/i.test(screen)) {
        ready = true
        typed = true
        type('/usage', 600)
        type('\r', 1500)
      }
      if (typed) {
        const limits = parseUsageScreen(output)
        if (limits?.session && limits.week) finish(limits)
      }
    })
    child.on('error', error => finish(failed(error.message)))
    child.stdin.on('error', () => undefined)
    child.on('exit', () => finish(parseUsageScreen(output) ?? failed(
      trust !== 'none' && !ready ? 'folder trust prompt was declined' : 'claude exited before showing /usage',
    )))
    // If the welcome prompt was not recognised, type anyway, unless the trust prompt is still open.
    timers.push(setTimeout(() => {
      if (!typed && (trust === 'none' || trust === 'accepted')) {
        typed = true
        type('/usage', 0)
        type('\r', 900)
      }
    }, 7000))
    timers.push(setTimeout(() => finish(parseUsageScreen(output) ?? failed(
      trust === 'choosing' || trust === 'moving' ? 'timed out at the folder trust prompt' : 'timed out reading /usage',
    )), options.timeoutMs ?? 30_000))
  })
}

const failed = (error: string): Limits => ({ session: null, week: null, weekModels: [], fetchedAt: Date.now(), error })
