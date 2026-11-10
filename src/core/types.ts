export type SessionSource = 'desktop' | 'vscode' | 'cli' | 'codex'

/** Raw status Claude Code writes to ~/.claude/sessions/<pid>.json. */
export type RawStatus = 'busy' | 'waiting' | 'idle'

/**
 * Status shown in the panel. `finished` is an idle session whose last turn ended while
 * nobody looked at it (cleared once it is opened); `ended` is a recent session whose process is gone.
 */
export type SessionStatus = 'waiting' | 'busy' | 'finished' | 'idle' | 'ended'

export interface TokenCounts {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export interface Session {
  /** Stable key: the Claude session id or a prefixed Codex thread id. */
  id: string
  pid: number | null
  source: SessionSource
  title: string
  cwd: string
  /** Folder name shown under the title. */
  project: string
  status: SessionStatus
  /** e.g. "input needed" while waiting. */
  waitingFor: string | null
  /** What a waiting session is asking (question text or the permission it needs). */
  pendingPrompt: string | null
  /** Waiting, but snoozed by the user until this time (ms epoch). */
  snoozedUntil: number | null
  /** When the current status began (ms epoch). */
  statusSince: number
  startedAt: number
  /** Desktop app session id (`local_…`), when the session belongs to the desktop app. */
  hostSessionId: string | null
  model: string | null
  tokens: TokenCounts | null
}

export interface LimitWindow {
  /** 0–100. */
  percent: number
  /** ms epoch, or null when the reset text could not be parsed. */
  resetsAt: number | null
  /** The original text, e.g. "Nov 1 at 8am (America/New_York)". */
  resetsText: string
}

export interface Limits {
  session: LimitWindow | null
  week: LimitWindow | null
  /** Separate Sonnet/Opus weekly bars, when the plan shows them. */
  weekModels: { label: string, window: LimitWindow }[]
  fetchedAt: number
  error: string | null
}

export interface UsageTotals {
  today: TokenCounts
  /** Since the start of the current weekly limit window (or the last 7 days when unknown). */
  week: TokenCounts
}

export interface CodexLimitWindow extends LimitWindow {
  durationMinutes: number
}

export interface CodexUsage {
  windows: CodexLimitWindow[]
  dailyTokens: { date: string, tokens: number }[] | null
  limitError: string | null
}

/** How long sessions sat waiting for the user today (finished waits plus the ones still open). */
export interface AttentionStats {
  blockedMs: number
  longestMs: number
  waits: number
}

export interface Snapshot {
  sessions: Session[]
  limits: Limits | null
  totals: UsageTotals
  attention: AttentionStats
  generatedAt: number
  /** Populated by the worker when a Codex CLI is available. */
  codex?: CodexUsage
}

export const emptyTokens = (): TokenCounts => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })

export const addTokens = (a: TokenCounts, b: TokenCounts): TokenCounts => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  cacheRead: a.cacheRead + b.cacheRead,
})

export const totalTokens = (t: TokenCounts): number => t.input + t.output + t.cacheWrite + t.cacheRead
