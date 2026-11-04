import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Session } from '../core'
import { shell } from 'electron'

const run = promisify(execFile)

const osascript = async (script: string): Promise<string> => (await run('/usr/bin/osascript', ['-e', script])).stdout.trim()

/** Single-quotes `value` for sh, so `$(…)`, backticks and spaces in it stay literal. */
const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

/** An AppleScript string literal, which only knows the \" and \\ escapes. */
const appleScriptString = (value: string): string => `"${value.replace(/[\\"]/g, '\\$&')}"`

/** Brings the Terminal or iTerm tab running `tty` to the front. */
const focusTerminalTab = async (tty: string): Promise<boolean> => {
  const terminal = `tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is "${tty}" then
          set selected of t to true
          set index of w to 1
          activate
          return "ok"
        end if
      end repeat
    end repeat
  end tell`
  const iterm = `tell application "iTerm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if tty of s is "${tty}" then
            select w
            tell t to select
            tell s to select
            activate
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell`
  for (const [app, script] of [['Terminal', terminal], ['iTerm2', iterm]] as const) {
    try {
      const { stdout } = await run('/usr/bin/pgrep', ['-x', app === 'iTerm2' ? 'iTerm2' : 'Terminal'])
      if (stdout.trim() && (await osascript(script)) === 'ok') return true
    } catch {
      // not running, or no automation permission
    }
  }
  return false
}

/** Walks up from `pid` to the first process inside a .app bundle and activates that app. */
const activateOwningApp = async (pid: number): Promise<boolean> => {
  let current = pid
  for (let i = 0; i < 12 && current > 1; i++) {
    const { stdout } = await run('/bin/ps', ['-o', 'ppid=,comm=', '-p', String(current)])
    const match = /^\s*(\d+)\s+(.*)$/.exec(stdout.trim())
    if (!match) return false
    const bundle = /^(.*?\.app)\//.exec(match[2]!)
    if (bundle) {
      await run('/usr/bin/open', ['-a', bundle[1]!])
      return true
    }
    current = Number(match[1])
  }
  return false
}

/** Opens a session where it lives: the desktop app, VS Code or its terminal. */
export const openSession = async (session: Session): Promise<void> => {
  if (session.hostSessionId) {
    // `continue` opens any session by id; `needs-input` only finds sessions waiting on a permission
    // prompt and otherwise falls back to another session or a new one.
    await shell.openExternal(`claude://code/continue?session=${encodeURIComponent(session.hostSessionId)}`)
    return
  }
  if (session.source === 'vscode') {
    await shell.openExternal(`vscode://anthropic.claude-code/open?session=${encodeURIComponent(session.id)}`)
    return
  }
  if (session.pid) {
    try {
      const { stdout } = await run('/bin/ps', ['-o', 'tty=', '-p', String(session.pid)])
      const tty = stdout.trim()
      if (tty && tty !== '??' && await focusTerminalTab(`/dev/${tty}`)) return
      if (await activateOwningApp(session.pid)) return
    } catch {
      // fall through to resuming it in a new terminal
    }
  }
  const command = `cd ${shellQuote(session.cwd)} && claude --resume ${shellQuote(session.id)}`
  await osascript(`tell application "Terminal"
    activate
    do script ${appleScriptString(command)}
  end tell`)
}
