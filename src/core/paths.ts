import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ClaudePaths {
  /** ~/.claude/sessions: one JSON file per running Claude Code process. */
  liveSessions: string
  /** ~/.claude/projects: transcripts, one folder per working directory. */
  transcripts: string
  /** Claude desktop app's per-session metadata. */
  desktopSessions: string
}

export const defaultClaudePaths = (home = homedir()): ClaudePaths => ({
  liveSessions: join(home, '.claude', 'sessions'),
  transcripts: join(home, '.claude', 'projects'),
  desktopSessions: join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions'),
})
