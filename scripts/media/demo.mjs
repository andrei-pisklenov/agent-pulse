// Made-up sessions for the README screenshots. Nothing here comes from a real machine.
import { defaultSettings } from '../../src/shared/types.ts'

const MIN = 60_000
const HOUR = 60 * MIN

const tokens = (input, output, cacheWrite, cacheRead) => ({ input, output, cacheWrite, cacheRead })

const session = (now, id, fields) => ({
  id,
  pid: null,
  source: 'cli',
  cwd: `/Users/demo/code/${fields.project}`,
  waitingFor: null,
  pendingPrompt: null,
  snoozedUntil: null,
  startedAt: now - 2 * HOUR,
  hostSessionId: null,
  model: 'claude-sonnet-5-5',
  ...fields,
  statusSince: now - fields.ago,
})

/** A busy afternoon: one session asking for permission, two working, one done, two quiet. */
export const demoSnapshot = (now = Date.now()) => ({
  generatedAt: now,
  sessions: [
    session(now, 'demo-1', {
      title: 'Add rate limiting to the API', project: 'orbit-api', status: 'waiting', ago: 3 * MIN,
      waitingFor: 'permission', pendingPrompt: 'Allow Bash: Run the integration tests',
      model: 'claude-opus-5-5', tokens: tokens(18_400, 41_200, 96_000, 2_100_000),
    }),
    session(now, 'demo-2', {
      title: 'Move settings to React 19', project: 'atlas-web', status: 'busy', ago: 11 * MIN,
      source: 'desktop', hostSessionId: 'local_demo2', model: 'claude-opus-5-5', tokens: tokens(9_800, 63_500, 120_000, 3_400_000),
    }),
    session(now, 'demo-3', {
      title: 'Document the billing webhooks', project: 'billing-service', status: 'busy', ago: 4 * MIN,
      source: 'vscode', tokens: tokens(5_200, 22_900, 48_000, 870_000),
    }),
    session(now, 'demo-4', {
      title: 'Fix the flaky checkout test', project: 'storefront', status: 'finished', ago: 7 * MIN,
      source: 'desktop', hostSessionId: 'local_demo4', tokens: tokens(3_100, 12_800, 30_000, 540_000),
    }),
    session(now, 'demo-5', {
      title: 'Speed up image thumbnails', project: 'photon', status: 'idle', ago: 52 * MIN,
      tokens: tokens(2_400, 9_100, 21_000, 310_000),
    }),
    session(now, 'demo-6', {
      title: 'Upgrade the CI runners', project: 'infra', status: 'ended', ago: 3 * HOUR,
      model: 'claude-haiku-5-5', tokens: tokens(1_200, 4_300, 9_000, 120_000),
    }),
  ],
  limits: {
    session: { percent: 42, resetsAt: now + 2 * HOUR + 14 * MIN, resetsText: '' },
    week: { percent: 63, resetsAt: now + 3 * 24 * HOUR + 5 * HOUR, resetsText: '' },
    weekModels: [],
    fetchedAt: now,
    error: null,
  },
  totals: { today: tokens(41_000, 158_000, 320_000, 7_300_000), week: tokens(212_000, 905_000, 1_800_000, 41_000_000) },
  attention: { blockedMs: 49 * MIN, longestMs: 12 * MIN, waits: 7 },
})

export const demoSettings = (patch = {}) => ({ ...defaultSettings, sound: false, ...patch })
