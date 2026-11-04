import { basename } from 'node:path'
import { readDesktopSessions, type DesktopSession } from './desktopSessions.js'
import { readLiveSessions } from './liveSessions.js'
import { defaultClaudePaths, type ClaudePaths } from './paths.js'
import { readPendingPrompt } from './pending.js'
import { compareSessions, deriveStatus, projectName, type TrackState } from './status.js'
import { TokenLedger } from './transcripts.js'
import type { AttentionStats, Limits, Session, Snapshot } from './types.js'

const DAY = 86_400_000

/** Everything the collector persists between app runs. */
export interface CollectorState {
  sessions: Record<string, TrackState>
  /** Local date (YYYY-MM-DD) the wait stats belong to. */
  day: string
  /** Finished waits today; open waits are added at snapshot time. */
  waits: AttentionStats
  /** Session id → snoozed until (ms epoch). */
  snoozed: Record<string, number>
}

export interface CollectorOptions {
  paths?: ClaudePaths
  /** Sessions running in this folder (the limits probe) are hidden. */
  hiddenCwds?: string[]
  /** How long ended desktop sessions stay listed. */
  recentMs?: number
  initialState?: Partial<CollectorState>
}

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const noWaits = (): AttentionStats => ({ blockedMs: 0, longestMs: 0, waits: 0 })

/**
 * Builds panel snapshots. `pollSessions` is cheap (small JSON files) and meant to run every
 * second or two; `pollTokens` and `pollDesktop` read more and can run every ~10 seconds.
 */
export class Collector {
  private readonly paths: ClaudePaths
  private readonly ledger: TokenLedger
  private readonly states: Map<string, TrackState>
  private readonly snoozed: Map<string, number>
  private day: string
  private waits: AttentionStats
  private desktop = new Map<string, DesktopSession>()
  private limits: Limits | null = null
  private sessions: Session[] = []

  constructor(private readonly options: CollectorOptions = {}) {
    this.paths = options.paths ?? defaultClaudePaths()
    this.ledger = new TokenLedger(this.paths.transcripts)
    const initial = options.initialState ?? {}
    this.states = new Map(Object.entries(initial.sessions ?? {}))
    this.snoozed = new Map(Object.entries(initial.snoozed ?? {}))
    this.day = initial.day ?? dayKey(Date.now())
    this.waits = initial.day === dayKey(Date.now()) && initial.waits ? initial.waits : noWaits()
  }

  async pollDesktop(now = Date.now()): Promise<void> {
    this.desktop = await readDesktopSessions(this.paths.desktopSessions, now - (this.options.recentMs ?? DAY))
  }

  async pollTokens(now = Date.now()): Promise<void> {
    await this.ledger.scan(now)
  }

  setLimits(limits: Limits): void {
    // Keep the last good numbers when a probe fails.
    this.limits = limits.error && this.limits ? { ...this.limits, error: limits.error } : limits
  }

  async pollSessions(now = Date.now()): Promise<void> {
    if (dayKey(now) !== this.day) {
      this.day = dayKey(now)
      this.waits = noWaits()
    }
    const hidden = new Set(this.options.hiddenCwds ?? [])
    const live = (await readLiveSessions(this.paths.liveSessions)).filter(s => !hidden.has(s.cwd))
    const seen = new Set<string>()
    const sessions: Session[] = []

    for (const l of live) {
      if (seen.has(l.sessionId)) continue
      seen.add(l.sessionId)
      const desktop = l.hostSessionId ? this.desktop.get(l.hostSessionId) : undefined
      const prev = this.states.get(l.sessionId)
      const derived = deriveStatus(prev, l, desktop, now)
      if (prev?.raw === 'waiting' && derived.state.raw !== 'waiting') this.recordWait(derived.state.rawSince - prev.rawSince)
      this.states.set(l.sessionId, derived.state)
      const waiting = derived.status === 'waiting'
      const path = waiting ? this.ledger.transcriptPath(l.sessionId) : null
      sessions.push({
        id: l.sessionId,
        pid: l.pid,
        source: l.source,
        title: l.name ?? desktop?.title ?? basename(l.cwd),
        cwd: l.cwd,
        project: projectName(l.cwd),
        status: derived.status,
        waitingFor: waiting ? l.waitingFor : null,
        pendingPrompt: path ? await readPendingPrompt(path) : null,
        snoozedUntil: waiting ? this.activeSnooze(l.sessionId, now) : null,
        statusSince: derived.statusSince,
        startedAt: l.startedAt,
        hostSessionId: l.hostSessionId,
        model: this.ledger.sessionModel(l.sessionId) ?? desktop?.model ?? null,
        tokens: this.ledger.sessionTokens(l.sessionId),
      })
    }

    const recentFrom = now - (this.options.recentMs ?? DAY)
    for (const d of this.desktop.values()) {
      const id = d.cliSessionId ?? d.hostSessionId
      if (seen.has(id) || d.isArchived || d.lastActivityAt < recentFrom || (d.cwd && hidden.has(d.cwd))) continue
      seen.add(id)
      sessions.push({
        id,
        pid: null,
        source: 'desktop',
        title: d.title ?? (d.cwd ? basename(d.cwd) : 'Session'),
        cwd: d.cwd ?? '',
        project: d.cwd ? projectName(d.cwd) : '',
        status: 'ended',
        waitingFor: null,
        pendingPrompt: null,
        snoozedUntil: null,
        statusSince: d.lastActivityAt,
        startedAt: d.createdAt,
        hostSessionId: d.hostSessionId,
        model: d.model,
        tokens: this.ledger.sessionTokens(id),
      })
    }

    // Forget sessions that are gone so the persisted state stays small; a wait cut short by the
    // process exiting still counts.
    for (const [id, state] of this.states) {
      if (seen.has(id)) continue
      if (state.raw === 'waiting') this.recordWait(now - state.rawSince)
      this.states.delete(id)
    }
    for (const [id] of this.snoozed) {
      if (!sessions.some(s => s.id === id && s.snoozedUntil)) this.snoozed.delete(id)
    }
    this.sessions = sessions.sort(compareSessions)
  }

  /** Clears the "finished" mark, e.g. after the session was opened from the panel. */
  markRead(id: string): void {
    const state = this.states.get(id)
    if (state) state.finishedAt = null
    const session = this.sessions.find(s => s.id === id)
    if (session?.status === 'finished') session.status = 'idle'
  }

  /** Hides a waiting session from alerts until `until`; null clears the snooze. */
  snooze(id: string, until: number | null): void {
    if (until === null) this.snoozed.delete(id)
    else this.snoozed.set(id, until)
    const session = this.sessions.find(s => s.id === id)
    if (session?.status === 'waiting') session.snoozedUntil = until
  }

  exportState(): CollectorState {
    return {
      sessions: Object.fromEntries(this.states),
      day: this.day,
      waits: this.waits,
      snoozed: Object.fromEntries(this.snoozed),
    }
  }

  snapshot(now = Date.now()): Snapshot {
    const startOfDay = new Date(now).setHours(0, 0, 0, 0)
    const weekReset = this.limits?.week?.resetsAt
    const weekStart = weekReset && weekReset > now ? weekReset - 7 * DAY : now - 7 * DAY
    const attention = { ...this.waits }
    for (const s of this.sessions) {
      if (s.status !== 'waiting') continue
      const open = now - Math.max(s.statusSince, startOfDay)
      attention.blockedMs += open
      attention.longestMs = Math.max(attention.longestMs, open)
      attention.waits += 1
    }
    return {
      sessions: this.sessions,
      limits: this.limits,
      totals: { today: this.ledger.totalSince(startOfDay), week: this.ledger.totalSince(weekStart) },
      attention,
      generatedAt: now,
    }
  }

  private activeSnooze(id: string, now: number): number | null {
    const until = this.snoozed.get(id)
    return until && until > now ? until : null
  }

  private recordWait(ms: number): void {
    if (ms <= 0) return
    this.waits = {
      blockedMs: this.waits.blockedMs + ms,
      longestMs: Math.max(this.waits.longestMs, ms),
      waits: this.waits.waits + 1,
    }
  }
}
