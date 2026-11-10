import { useEffect, useState, type ReactNode } from 'react'
import { emptyTokens, type Snapshot } from '../../../core/types'
import { defaultSettings, type PanelState, type Settings, type SettingsPage, type SetupStatus, type UsageHistory } from '../../../shared/types'
import { usageGauges } from '../../../shared/usageDisplay'
import { GeneralPage } from './GeneralPage'
import { MenuBarPage } from './MenuBarPage'
import { PanelPage } from './PanelPage'
import { checksLeft, SetupPage } from './SetupPage'
import { api, icons, Tile } from './ui'
import { UsagePage } from './UsagePage'
import { Welcome } from './Welcome'
import './settings.css'

const emptySnapshot: Snapshot = {
  sessions: [], limits: null, totals: { today: emptyTokens(), week: emptyTokens() },
  attention: { blockedMs: 0, longestMs: 0, waits: 0 }, generatedAt: 0,
}

const PAGES: { id: SettingsPage, label: string, color: string, icon: ReactNode, keywords: string }[] = [
  { id: 'setup', label: 'Setup', color: '#2fa84f', icon: icons.setup, keywords: 'permissions automation terminal iterm notifications sources found welcome' },
  { id: 'general', label: 'General', color: '#8e8e93', icon: icons.general, keywords: 'login startup alerts notify sound quiet hours shortcuts hotkey switcher question waited' },
  { id: 'panel', label: 'Panel', color: '#0a6cdc', icon: icons.panel, keywords: 'theme glass terminal rows density strip pill size dock always on top layout gap corners' },
  { id: 'menubar', label: 'Menu bar', color: '#5e5ce6', icon: icons.menubar, keywords: 'icon crab octopus dance heartbeat rings spark bars text counts' },
  { id: 'usage', label: 'Usage', color: '#f08c00', icon: icons.usage, keywords: 'limits tokens chart history warnings claude codex cache refresh forecast pace' },
]

const useNow = (everyMs: number) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export const SettingsApp = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [history, setHistory] = useState<UsageHistory | null>(null)
  const [panel, setPanel] = useState<PanelState>({ orientation: 'vertical', edges: [], maxWidth: 0, maxHeight: 0, forceExpanded: false, dockSize: null })
  const [page, setPage] = useState<SettingsPage>('setup')
  const [welcome, setWelcome] = useState(false)
  const [query, setQuery] = useState('')
  const now = useNow(30_000)

  useEffect(() => {
    const offs = [
      api.onSettings(setSettings),
      api.onSnapshot(setSnapshot),
      api.onSetup(setSetup),
      api.onHistory(setHistory),
      api.onPanelState(setPanel),
      api.onNavigate((target) => {
        if (target === 'welcome') setWelcome(true)
        else setPage(target)
      }),
    ]
    api.ready()
    return () => offs.forEach(off => off())
  }, [])

  if (!setup) return <div className="settings" />

  const q = query.trim().toLowerCase()
  const pages = PAGES.filter(p => !q || p.label.toLowerCase().includes(q) || p.keywords.includes(q))
  const left = checksLeft(setup)
  const problem = !setup.shortcuts.hotkey || !setup.shortcuts.panelHotkey || (!setup.sources.claudeCode && !setup.sources.codex)
  const active = snapshot.sessions.filter(s => s.status !== 'ended').length
  const gauges = usageGauges(settings.usageProviders, snapshot)

  return (
    <div className="settings">
      <nav className="s-sidebar" aria-label="Settings">
        <div className="s-drag" />
        <label className="s-search">
          {icons.search}
          <input placeholder="Search" aria-label="Search settings" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <ul className="s-nav">
          {pages.map(p => (
            <li key={p.id}>
              <button type="button" className={`s-nav-item${page === p.id ? ' selected' : ''}`} aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>
                <Tile color={p.color}>{p.icon}</Tile>
                <span className="s-nav-label">{p.label}</span>
                {p.id === 'setup' && (left > 0 || problem) && <span className="s-dot orange" aria-label="Needs attention" />}
              </button>
            </li>
          ))}
          {pages.length === 0 && <li className="s-nav-empty">No settings match</li>}
        </ul>
        <button type="button" className="s-status" onClick={() => setPage('setup')}>
          <span className={`s-dot ${left || problem ? 'orange' : 'green'}`} />
          <span>{left ? `${left} ${left === 1 ? 'check' : 'checks'} left` : problem ? 'Setup needs you' : `Watching ${active} ${active === 1 ? 'session' : 'sessions'}`}</span>
        </button>
      </nav>

      <main className="s-content">
        <div className="s-drag" />
        <div className="s-page">
          {page === 'setup' && <SetupPage setup={setup} settings={settings} sessions={snapshot.sessions} onWelcome={() => setWelcome(true)} />}
          {page === 'general' && <GeneralPage settings={settings} setup={setup} />}
          {page === 'panel' && <PanelPage settings={settings} panel={panel} sessions={snapshot.sessions} gauges={gauges} now={now} />}
          {page === 'menubar' && <MenuBarPage settings={settings} sessions={snapshot.sessions} now={now} percent={gauges[0]?.window?.percent ?? null} />}
          {page === 'usage' && <UsagePage settings={settings} snapshot={snapshot} history={history} now={now} />}
        </div>
      </main>

      {welcome && <Welcome settings={settings} setup={setup} sessions={snapshot.sessions} onClose={() => setWelcome(false)} />}
    </div>
  )
}
