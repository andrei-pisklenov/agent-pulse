// Prints a live snapshot of this machine's Claude sessions: `yarn snapshot [--limits]`.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Collector, probeUsage, totalTokens } from '../src/core/index.js'

// The repo is not an ES module package, so tsx runs this as CommonJS: no top-level await.
async function main() {
  const probeDir = join(homedir(), 'Library', 'Application Support', 'agent-pulse', 'probe')
  const collector = new Collector({ hiddenCwds: [probeDir] })
  const started = Date.now()
  await collector.pollDesktop()
  await collector.pollTokens()
  const tokensMs = Date.now() - started
  if (process.argv.includes('--limits')) collector.setLimits(await probeUsage({ cwd: probeDir }))
  await collector.pollSessions()
  const snap = collector.snapshot()
  for (const s of snap.sessions) {
    const tokens = String(totalTokens(s.tokens)).padStart(10)
    console.log(s.status.padEnd(9), s.source.padEnd(8), tokens, s.project.padEnd(24).slice(0, 24), s.title)
  }
  console.log('limits', JSON.stringify(snap.limits))
  console.log('today', totalTokens(snap.totals.today), 'week', totalTokens(snap.totals.week), `(token scan ${tokensMs}ms)`)
}

void main()
