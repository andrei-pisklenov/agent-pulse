/**
 * Collector utility process: polls session files, transcripts and plan limits off the main
 * process (the first transcript scan takes seconds) and posts snapshots back.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Collector, defaultClaudePaths, probeDue, probeUsage, UsageHistory, type CollectorState, type ProbeTrack } from '../core'
import { readCodexSessions } from '../core/codexSessions'
import { probeCodexUsage } from '../core/codexUsage'
import { compareSessions } from '../core/status'
import type { CodexUsage, Session } from '../core/types'
import { defaultSettings, type FromWorker, type ToWorker, type UsageProviders } from '../shared/types'

const SESSIONS_MS = 1500
const SLOW_MS = 10_000
/** Daily totals for the Usage page: once an hour, starting after the first scans have settled. */
const HISTORY_MS = 60 * 60_000
const HISTORY_FIRST_MS = 30_000

const userData = process.env.PULSE_USER_DATA ?? process.cwd()
const probeDir = join(userData, 'probe')
const statePath = join(userData, 'state.json')
const historyPath = join(userData, 'history.json')

const initialProviders = (): UsageProviders => {
  try {
    return { ...defaultSettings.usageProviders, ...JSON.parse(process.env.PULSE_USAGE_PROVIDERS ?? '{}') as Partial<UsageProviders> }
  } catch {
    return defaultSettings.usageProviders
  }
}

const port = process.parentPort
const post = (message: FromWorker) => port.postMessage(message)

const loadState = async (): Promise<Partial<CollectorState>> => {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as Partial<CollectorState>
    // Files from before the state had sections are dropped.
    return typeof state.sessions === 'object' ? state : {}
  } catch {
    return {}
  }
}

const main = async () => {
  const collector = new Collector({ hiddenCwds: [probeDir], initialState: await loadState() })
  let limitsEveryMs = 5 * 60_000
  let limitsTimer: NodeJS.Timeout | undefined
  let probing = false
  /** A refresh was asked for while a probe ran; run another when it ends. */
  let again = false
  let providers = initialProviders()
  let lastJson = ''
  let lastState = ''
  let codex: CodexUsage | null = null
  let codexSessions: Session[] = []
  // Per provider: when its limits were read and whether its sessions ran since.
  const tracks: Record<'claude' | 'codex', ProbeTrack> = {
    claude: { lastAt: null, active: false, resetsAt: [] },
    codex: { lastAt: null, active: false, resetsAt: [] },
  }
  const history = new UsageHistory(defaultClaudePaths().transcripts, historyPath)
  let historyTimer: NodeJS.Timeout | undefined
  let historyRunning = false

  const updateHistory = async () => {
    if (historyRunning) return
    clearTimeout(historyTimer)
    historyRunning = true
    try {
      await history.update()
      post({ type: 'history', history: { claude: history.daily(), updatedAt: Date.now() } })
    } catch {
      // Tried again on the next round.
    } finally {
      historyRunning = false
      historyTimer = setTimeout(() => void updateHistory(), HISTORY_MS)
    }
  }

  const publish = async () => {
    const local = collector.snapshot()
    const sessions = [...local.sessions, ...codexSessions].sort(compareSessions)
    const snapshot = { ...local, sessions, ...(codex ? { codex } : {}) }
    // generatedAt changes every time; compare the rest.
    const json = JSON.stringify({ ...snapshot, generatedAt: 0 })
    if (json !== lastJson) {
      lastJson = json
      post({ type: 'snapshot', snapshot })
    }
    const state = JSON.stringify(collector.exportState())
    if (state !== lastState) {
      lastState = state
      await writeFile(statePath, state).catch(() => undefined)
    }
  }

  /** Reads the plan limits of each provider that is switched on and due; `force` reads them all. */
  const refreshLimits = async (force = false) => {
    if (probing) {
      again = again || force
      return
    }
    clearTimeout(limitsTimer)
    probing = true
    again = false
    const now = Date.now()
    const due = (provider: 'claude' | 'codex') => providers[provider] && (force || probeDue(tracks[provider], limitsEveryMs, now))
    const mark = (provider: 'claude' | 'codex', resetsAt: (number | null)[]) => {
      tracks[provider] = { lastAt: now, active: false, resetsAt }
    }
    try {
      // A provider that is switched off, or idle since its last probe, is not probed.
      await Promise.allSettled([
        due('claude') && probeUsage({ cwd: probeDir }).then(async (limits) => {
          mark('claude', [limits.session?.resetsAt ?? null, limits.week?.resetsAt ?? null])
          collector.setLimits(limits)
          await publish()
        }),
        due('codex') && probeCodexUsage().then(async (usage) => {
          mark('codex', usage?.windows.map(w => w.resetsAt) ?? [])
          codex = usage
          await publish()
        }),
      ])
    } finally {
      probing = false
      if (again) void refreshLimits(true)
      else limitsTimer = setTimeout(() => void refreshLimits(), Math.min(limitsEveryMs, 60_000 * 5))
    }
  }

  const pollSessions = async () => {
    const [, sessions] = await Promise.all([
      collector.pollSessions().catch(() => undefined),
      readCodexSessions(),
    ])
    codexSessions = sessions
    // Limits only move while sessions run, so the probes follow the activity.
    if (collector.snapshot().sessions.some(s => s.status === 'busy')) tracks.claude.active = true
    if (sessions.some(s => s.status === 'busy')) tracks.codex.active = true
    await publish()
    setTimeout(() => void pollSessions(), SESSIONS_MS)
  }

  const pollSlow = async () => {
    await collector.pollDesktop().catch(() => undefined)
    await collector.pollTokens().catch(() => undefined)
    setTimeout(() => void pollSlow(), SLOW_MS)
  }

  port.on('message', (event: { data: ToWorker }) => {
    const message = event.data
    if (message.type === 'markRead') {
      collector.markRead(message.id)
      void publish()
    } else if (message.type === 'snooze') {
      collector.snooze(message.id, message.until)
      void publish()
    } else if (message.type === 'refreshHistory') {
      void updateHistory()
    } else if (message.type === 'refreshLimits') {
      void refreshLimits(true)
    } else if (message.type === 'configure') {
      limitsEveryMs = Math.max(1, message.limitsRefreshMinutes) * 60_000
      const turnedOn = (message.usageProviders.claude && !providers.claude) || (message.usageProviders.codex && !providers.codex)
      providers = message.usageProviders
      // Fetch a provider's limits right away when it is switched back on.
      if (turnedOn) void refreshLimits(true)
    }
  })

  // Statuses first so the panel fills immediately; tokens and limits follow.
  await collector.pollDesktop().catch(() => undefined)
  void pollSessions()
  void pollSlow()
  void refreshLimits()
  historyTimer = setTimeout(() => void updateHistory(), HISTORY_FIRST_MS)
}

void main()
