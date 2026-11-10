import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { defaultClaudePaths } from '../core/paths'
import type { CheckId, CheckState, SetupStatus } from '../shared/types'

const run = promisify(execFile)

/** The process name pgrep looks for and the name AppleScript knows each terminal by. */
const TERMINALS = {
  terminal: { process: 'Terminal', app: 'Terminal' },
  iterm: { process: 'iTerm2', app: 'iTerm2' },
} as const

const itermInstalled = () =>
  ['/Applications/iTerm.app', join(homedir(), 'Applications', 'iTerm.app')].some(path => existsSync(path))

const hasVsCodeExtension = () => {
  try {
    return readdirSync(join(homedir(), '.vscode', 'extensions')).some(name => name.startsWith('anthropic.claude-code'))
  } catch {
    return false
  }
}

/** What the Setup page lists: sources found on this Mac and the apps whose permissions matter. */
export const findSources = (): Pick<SetupStatus, 'sources'> & { checkIds: CheckId[] } => {
  const paths = defaultClaudePaths()
  return {
    sources: {
      claudeCode: existsSync(paths.transcripts),
      claudeDesktop: existsSync(paths.desktopSessions),
      vscode: hasVsCodeExtension(),
      codex: existsSync(process.env.CODEX_HOME || join(homedir(), '.codex')),
    },
    checkIds: ['terminal', ...(itermInstalled() ? ['iterm' as const] : []), 'notifications'],
  }
}

/**
 * Asks Terminal or iTerm for its window count: harmless, but it needs the same Automation
 * permission as bringing a tab forward, so macOS asks for it the first time.
 */
export const testAutomation = async (id: 'terminal' | 'iterm'): Promise<CheckState> => {
  const { process: name, app } = TERMINALS[id]
  try {
    await run('/usr/bin/pgrep', ['-x', name])
  } catch {
    return 'notRunning'
  }
  try {
    // The permission dialog keeps osascript waiting until it is answered.
    await run('/usr/bin/osascript', ['-e', `tell application "${app}" to count windows`], { timeout: 120_000 })
    return 'ok'
  } catch (error) {
    const text = `${(error as { stderr?: string }).stderr ?? ''} ${String(error)}`
    return /-1743|not allowed|Not authori[sz]ed/i.test(text) ? 'denied' : 'failed'
  }
}

/** System Settings panes for each permission. */
export const privacyUrl = (id: CheckId): string => id === 'notifications'
  ? 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
  : 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'
