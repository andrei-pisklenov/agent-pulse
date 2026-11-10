import type { CodexUsage, LimitWindow, Snapshot } from '../core/types.js'
import type { UsageProviders } from './types.js'

const unavailableCodex: CodexUsage = { windows: [], dailyTokens: null, limitError: 'Codex limits unavailable' }

/** Codex usage to show; a placeholder stands in when Codex is the only provider and has no data yet. */
export const displayedCodex = (providers: UsageProviders, usage?: CodexUsage): CodexUsage | undefined => {
  if (!providers.codex) return undefined
  return usage ?? (providers.claude ? undefined : unavailableCodex)
}

export const formatLimitWindow = (minutes: number): string =>
  minutes % 1440 === 0 ? `${minutes / 1440}d` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`

export interface UsageGauge {
  provider: 'Claude' | 'Codex'
  period: string
  window: LimitWindow | null
}

/** Use one gauge per provider in the compact views when both are visible; none when neither is. */
export const usageGauges = (providers: UsageProviders, snapshot: Pick<Snapshot, 'limits' | 'codex'>): UsageGauge[] => {
  const codex = displayedCodex(providers, snapshot.codex)
  const claude = snapshot.limits
  const claudeGauges: UsageGauge[] = [
    { provider: 'Claude', period: '5h', window: claude?.session ?? null },
    { provider: 'Claude', period: '7d', window: claude?.week ?? null },
  ]
  if (!codex) return providers.claude ? claudeGauges : []
  const codexGauges = codex.windows.map((window): UsageGauge => ({
    provider: 'Codex', period: formatLimitWindow(window.durationMinutes), window,
  }))
  if (!codexGauges.length) codexGauges.push({ provider: 'Codex', period: '', window: null })
  if (!providers.claude) return codexGauges
  return [
    claudeGauges.find(gauge => gauge.window) ?? claudeGauges[0]!,
    codexGauges.find(gauge => gauge.period === '5h') ?? codexGauges[0]!,
  ]
}
