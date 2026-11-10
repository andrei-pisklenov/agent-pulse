import { useState } from 'react'
import { forecastLimit, formatReset, SESSION_WINDOW_MS, WEEK_WINDOW_MS } from '../../../core/forecast'
import { localDay as localDayKey } from '../../../core/days'
import type { LimitWindow, Snapshot } from '../../../core/types'
import type { Settings, UsageHistory } from '../../../shared/types'
import { formatLimitWindow } from '../../../shared/usageDisplay'
import { formatClock, formatDuration, formatTokens, tokenValue } from '../format'
import { api, Group, icons, PageHeader, Row, save, Segmented, Select, Switch, Tile } from './ui'

const DAY = 86_400_000

interface Day {
  date: string
  claude: number
  codex: number
}

/** Daily totals for the last `count` days, oldest first; today's Claude figure is the live one. */
const daysOf = (count: number, settings: Settings, snapshot: Snapshot, history: UsageHistory | null, now: number): Day[] => {
  const claude = new Map(history?.claude.map(d => [d.date, tokenValue(d.tokens, settings.tokenMetric)]))
  const codex = new Map(snapshot.codex?.dailyTokens?.map(d => [d.date, d.tokens]))
  const today = localDayKey(now)
  claude.set(today, tokenValue(snapshot.totals.today, settings.tokenMetric))
  return Array.from({ length: count }, (_, i) => {
    const date = localDayKey(now - (count - 1 - i) * DAY)
    return {
      date,
      claude: settings.usageProviders.claude ? claude.get(date) ?? 0 : 0,
      codex: settings.usageProviders.codex ? codex.get(date) ?? 0 : 0,
    }
  })
}

const sum = (days: Day[]) => days.reduce((a, d) => ({ claude: a.claude + d.claude, codex: a.codex + d.codex }), { claude: 0, codex: 0 })

/** A round top for the axis: 1, 2 or 5 times a power of ten. */
const niceMax = (n: number) => {
  if (n <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(n))
  return ([1, 2, 5, 10].find(m => m * p >= n) ?? 10) * p
}

const resetText = (w: LimitWindow, now: number) => {
  const reset = formatReset(w, now)
  if (!reset) return ''
  return w.resetsAt !== null && w.resetsAt - now < DAY ? `resets in ${reset}` : `resets ${reset}`
}

const paceText = (w: LimitWindow, lengthMs: number, now: number) => {
  const f = forecastLimit(w, lengthMs, now)
  if (!f) return null
  return f.exhaustsAt ? `At this pace it runs out ${formatClock(f.exhaustsAt, now)}` : `At this pace: about ${f.projectedPercent}% at the reset`
}

const LimitRow = ({ label, window, lengthMs, color, pace, now }: {
  label: string
  window: LimitWindow
  lengthMs: number
  color: string
  pace: boolean
  now: number
}) => {
  const forecast = pace ? paceText(window, lengthMs, now) : null
  return (
    <div className="s-limit-row">
      <div className="s-limit-text"><span>{label} · {window.percent}%</span><span>{resetText(window, now)}</span></div>
      <div className="s-bar"><i style={{ width: `${Math.min(100, window.percent)}%`, background: color }} /></div>
      {forecast && <div className="s-row-hint">{forecast}</div>}
    </div>
  )
}

const LimitCards = ({ settings, snapshot, now }: { settings: Settings, snapshot: Snapshot, now: number }) => {
  const pace = settings.features.paceForecast
  const limits = snapshot.limits
  const codex = snapshot.codex
  return (
    <div className="s-limits">
      <div className="s-group-body s-limit-card">
        <div className="s-limit-head"><span className="s-dot" style={{ background: 'var(--claude)' }} />Claude</div>
        {!settings.usageProviders.claude && <div className="s-row-hint">Turned off. Limits and tokens are not read.</div>}
        {settings.usageProviders.claude && !limits?.session && !limits?.week && <div className="s-row-hint">{limits?.error ?? 'Reading the limits…'}</div>}
        {settings.usageProviders.claude && limits?.session && <LimitRow label="5-hour limit" window={limits.session} lengthMs={SESSION_WINDOW_MS} color="var(--claude)" pace={pace} now={now} />}
        {settings.usageProviders.claude && limits?.week && <LimitRow label="Weekly limit" window={limits.week} lengthMs={WEEK_WINDOW_MS} color="var(--claude)" pace={pace} now={now} />}
      </div>
      <div className="s-group-body s-limit-card">
        <div className="s-limit-head"><span className="s-dot" style={{ background: 'var(--codex)' }} />Codex</div>
        {!settings.usageProviders.codex && <div className="s-row-hint">Turned off. Limits and tokens are not read.</div>}
        {settings.usageProviders.codex && !codex?.windows.length && <div className="s-row-hint">{codex?.limitError ?? 'Reading the limits…'}</div>}
        {settings.usageProviders.codex && codex?.windows.map(w => (
          <LimitRow
            key={w.durationMinutes}
            label={w.durationMinutes === 10_080 ? 'Weekly limit' : `${formatLimitWindow(w.durationMinutes)} limit`}
            window={w}
            lengthMs={w.durationMinutes * 60_000}
            color="var(--codex)"
            pace={pace}
            now={now}
          />
        ))}
      </div>
    </div>
  )
}

const Chart = ({ days, now }: { days: Day[], now: number }) => {
  const top = niceMax(Math.max(...days.map(d => d.claude + d.codex)))
  const total = sum(days)
  const columns = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: days.length > 10 ? 3 : 18 }
  const label = (date: string, i: number) => {
    if (date === localDayKey(now)) return 'Today'
    if (days.length > 10 && i % 5 !== (days.length - 1) % 5) return ''
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return (
    <div className="s-group-body s-chart">
      <div className="s-chart-head">
        <span>
          <strong>{formatTokens(total.claude)}</strong> <span className="s-row-hint" style={{ display: 'inline' }}>Claude</span>
          {'   '}
          <strong>{formatTokens(total.codex)}</strong> <span className="s-row-hint" style={{ display: 'inline' }}>Codex</span>
        </span>
        <span className="s-legend"><span><b style={{ background: 'var(--claude)' }} />Claude</span><span><b style={{ background: 'var(--codex)' }} />Codex</span></span>
      </div>
      <div className="s-plot">
        <div className="s-axis" aria-hidden="true"><span>{formatTokens(top)}</span><span>{formatTokens(top / 2)}</span><span>0</span></div>
        <div className="s-bars" style={columns} role="img" aria-label={`Tokens per day for the last ${days.length} days, Claude and Codex stacked`}>
          {days.map(d => (
            <div className="s-col" key={d.date} title={`${d.date}: Claude ${formatTokens(d.claude)}, Codex ${formatTokens(d.codex)}`}>
              {d.codex > 0 && <i style={{ height: `${(d.codex / top) * 100}%`, background: 'var(--codex)' }} />}
              {d.claude > 0 && <i style={{ height: `${(d.claude / top) * 100}%`, background: 'var(--claude)' }} />}
            </div>
          ))}
        </div>
      </div>
      <div className="s-xaxis" style={columns} aria-hidden="true">
        {days.map((d, i) => <span key={d.date}>{label(d.date, i)}</span>)}
      </div>
    </div>
  )
}

const REFRESH_OPTIONS = [
  { value: 2, label: 'Every 2 minutes' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
]

export const UsagePage = ({ settings, snapshot, history, now }: {
  settings: Settings
  snapshot: Snapshot
  history: UsageHistory | null
  now: number
}) => {
  const [range, setRange] = useState<7 | 30>(7)
  const month = daysOf(30, settings, snapshot, history, now)
  const week = month.slice(-7)
  const shown = range === 7 ? week : month
  const card = (days: Day[]) => {
    const t = sum(days)
    return { value: formatTokens(t.claude + t.codex), sub: `Claude ${formatTokens(t.claude)} · Codex ${formatTokens(t.codex)}` }
  }
  const today = card(month.slice(-1))
  const seven = card(week)
  const thirty = card(month)
  const providers = (patch: Partial<Settings['usageProviders']>) => save({ usageProviders: { ...settings.usageProviders, ...patch } })
  const checked = Math.max(snapshot.limits?.fetchedAt ?? 0, 0)
  const refreshOptions = REFRESH_OPTIONS.some(o => o.value === settings.limitsRefreshMinutes)
    ? REFRESH_OPTIONS
    : [...REFRESH_OPTIONS, { value: settings.limitsRefreshMinutes, label: `Every ${settings.limitsRefreshMinutes} minutes` }]

  return (
    <>
      <PageHeader tile={<Tile color="#f08c00">{icons.usage}</Tile>} title="Usage" subtitle="Plan limits and tokens from Claude Code and Codex, read on this Mac." />

      <LimitCards settings={settings} snapshot={snapshot} now={now} />

      <div className="s-cards">
        <div className="s-card"><div className="s-card-key">Today</div><div className="s-card-value">{today.value}</div><div className="s-card-sub">{today.sub}</div></div>
        <div className="s-card"><div className="s-card-key">7 days</div><div className="s-card-value">{seven.value}</div><div className="s-card-sub">{seven.sub}</div></div>
        <div className="s-card"><div className="s-card-key">30 days</div><div className="s-card-value">{history ? thirty.value : '…'}</div><div className="s-card-sub">{history ? thirty.sub : 'Reading transcripts…'}</div></div>
        <div className="s-card"><div className="s-card-key">Waited on you</div><div className="s-card-value">{formatDuration(snapshot.attention.blockedMs)}</div><div className="s-card-sub">today</div></div>
      </div>

      <section>
        <div className="s-chart-head" style={{ margin: '0 0 7px 12px' }}>
          <h3 className="s-group-title" style={{ margin: 0 }}>Tokens per day</h3>
          <Segmented label="Days shown" options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }]} value={range} onChange={setRange} />
        </div>
        <Chart days={shown} now={now} />
        <p className="s-group-footer">
          {settings.tokenMetric === 'all'
            ? 'Counts every token, cache reads included, so totals are much larger.'
            : 'Input, output and cache writes. Cache reads are left out, since they re-read the same context on every turn.'}
          {' '}Codex counts come from the Codex app’s own daily totals.
        </p>
      </section>

      <Group title="Limit warnings" footer="Quiet hours apply to these too.">
        <Row label="Warn when a limit passes" hint="One notification per limit and reset">
          <Segmented
            label="Warn when a limit passes"
            options={[{ value: 80, label: '80%' }, { value: 90, label: '90%' }, { value: 95, label: '95%' }, { value: 0, label: 'Never' }]}
            value={settings.limitWarnPercent}
            onChange={limitWarnPercent => save({ limitWarnPercent })}
          />
        </Row>
        <Row label="Warn if it will run out before the reset" hint="Uses the pace forecast, once a limit is 30% used">
          <Switch label="Warn if a limit will run out before the reset" checked={settings.warnRunOut} onChange={warnRunOut => save({ warnRunOut })} />
        </Row>
      </Group>

      <Group title="Settings" footer="Turned off, a provider’s limits and tokens are hidden and never fetched. The session list always shows every session.">
        <Row label="Claude" hint="Limits from /usage, tokens from transcripts">
          <Switch label="Claude usage" checked={settings.usageProviders.claude} onChange={claude => providers({ claude })} />
        </Row>
        <Row label="Codex" hint="Limits and daily totals from the Codex CLI">
          <Switch label="Codex usage" checked={settings.usageProviders.codex} onChange={codex => providers({ codex })} />
        </Row>
        <Row label="Count tokens">
          <Segmented
            label="Count tokens"
            options={[{ value: 'noCacheRead', label: 'Input, output, cache writes' }, { value: 'all', label: 'Also cache reads' }]}
            value={settings.tokenMetric}
            onChange={tokenMetric => save({ tokenMetric })}
          />
        </Row>
        <Row label="Limit pace forecast" hint="Like “runs out Thu 11:40” or “about 84% at the reset”">
          <Switch label="Limit pace forecast" checked={settings.features.paceForecast} onChange={paceForecast => save({ features: { ...settings.features, paceForecast } })} />
        </Row>
        <Row label="Check limits" hint={checked ? `Last checked ${formatClock(checked, now)}` : undefined}>
          <Select label="How often to check limits" options={refreshOptions} value={settings.limitsRefreshMinutes} onChange={limitsRefreshMinutes => save({ limitsRefreshMinutes })} />
          <button type="button" className="s-button" disabled={!settings.usageProviders.claude && !settings.usageProviders.codex} onClick={() => api.refreshLimits()}>Check now</button>
        </Row>
      </Group>
    </>
  )
}
