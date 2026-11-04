/**
 * Collector utility process: polls session files, transcripts and plan limits off the main
 * process (the first transcript scan takes seconds) and posts snapshots back.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Collector, probeUsage, type CollectorState } from '../core'
import type { FromWorker, ToWorker } from '../shared/types'

const SESSIONS_MS = 1500
const SLOW_MS = 10_000

const userData = process.env.PULSE_USER_DATA ?? process.cwd()
const probeDir = join(userData, 'probe')
const statePath = join(userData, 'state.json')

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
  let lastJson = ''
  let lastState = ''

  const publish = async () => {
    const snapshot = collector.snapshot()
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

  const refreshLimits = async () => {
    clearTimeout(limitsTimer)
    if (!probing) {
      probing = true
      try {
        collector.setLimits(await probeUsage({ cwd: probeDir }))
        await publish()
      } finally {
        probing = false
      }
    }
    limitsTimer = setTimeout(() => void refreshLimits(), limitsEveryMs)
  }

  const pollSessions = async () => {
    await collector.pollSessions().catch(() => undefined)
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
    } else if (message.type === 'refreshLimits') {
      void refreshLimits()
    } else if (message.type === 'configure') {
      limitsEveryMs = Math.max(1, message.limitsRefreshMinutes) * 60_000
    }
  })

  // Statuses first so the panel fills immediately; tokens and limits follow.
  await collector.pollDesktop().catch(() => undefined)
  void pollSessions()
  void pollSlow()
  void refreshLimits()
}

void main()
