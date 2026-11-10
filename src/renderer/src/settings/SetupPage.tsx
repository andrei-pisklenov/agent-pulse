import { useState } from 'react'
import type { Session } from '../../../core/types'
import type { CheckId, CheckState, Settings, SetupStatus } from '../../../shared/types'
import { api, Group, icons, Keycaps, PageHeader, Row, save, StatusPill, Switch, Tile } from './ui'

const CHECK_TEXT: Record<CheckId, { label: string, hint: string, test: string }> = {
  terminal: { label: 'Automation · Terminal', hint: 'Brings a session’s Terminal tab to the front when you click it', test: 'Test' },
  iterm: { label: 'Automation · iTerm', hint: 'Brings a session’s iTerm tab to the front when you click it', test: 'Test' },
  notifications: { label: 'Notifications', hint: 'Alerts you when a session needs input', test: 'Send a test' },
}

const STATE_HINT: Partial<Record<CheckState, string>> = {
  notRunning: 'Open the app first, then test again.',
  denied: 'macOS said no. Turn it on in System Settings.',
  failed: 'The test didn’t work. Try again.',
  sent: 'A test notification went out. Did you see it?',
}

/** Tests still worth running; a refused permission counts too. */
export const checksLeft = (setup: SetupStatus | null): number =>
  setup?.checks.filter(c => c.state !== 'ok').length ?? 0

const CheckRow = ({ id, state }: { id: CheckId, state: CheckState }) => {
  const [running, setRunning] = useState(false)
  const text = CHECK_TEXT[id]
  const test = async () => {
    setRunning(true)
    try {
      await api.runCheck(id)
    } finally {
      setRunning(false)
    }
  }
  return (
    <Row label={text.label} hint={STATE_HINT[state] ?? (state === 'ok' ? text.hint : `Not checked yet. ${text.hint}.`)}>
      {state === 'ok' && <StatusPill tone="ok">Works</StatusPill>}
      {state === 'sent' && (
        <>
          <button type="button" className="s-button" onClick={() => api.confirmCheck(id, false)}>No</button>
          <button type="button" className="s-button primary" onClick={() => api.confirmCheck(id, true)}>Yes</button>
        </>
      )}
      {state === 'denied' && <button type="button" className="s-button" onClick={() => api.openPrivacySettings(id)}>Open System Settings</button>}
      {state !== 'ok' && state !== 'sent' && (
        <button type="button" className={`s-button${state === 'denied' ? '' : ' primary'}`} disabled={running} onClick={() => void test()}>
          {running ? 'Testing…' : state === 'unchecked' ? text.test : 'Test again'}
        </button>
      )}
    </Row>
  )
}

export const CheckList = ({ setup }: { setup: SetupStatus }) => (
  <>{setup.checks.map(c => <CheckRow key={c.id} id={c.id} state={c.state} />)}</>
)

const today = (sessions: Session[], ...sources: Session['source'][]) =>
  sessions.filter(s => sources.includes(s.source) && s.status !== 'ended').length

export const SourceRows = ({ setup, sessions }: { setup: SetupStatus, sessions: Session[] }) => {
  const count = (n: number) => (n ? ` · ${n} ${n === 1 ? 'session' : 'sessions'} now` : '')
  const rows = [
    { key: 'cli', found: setup.sources.claudeCode, label: 'Claude Code in Terminal and iTerm', hint: `~/.claude${count(today(sessions, 'cli'))}`, icon: icons.terminal, color: '#c96442' },
    { key: 'desktop', found: setup.sources.claudeDesktop, label: 'Claude desktop app', hint: `Code tab sessions${count(today(sessions, 'desktop'))}`, icon: icons.window, color: '#c96442' },
    { key: 'vscode', found: setup.sources.vscode, label: 'VS Code extension', hint: setup.sources.vscode ? `Claude Code in VS Code${count(today(sessions, 'vscode'))}` : 'Shows up here once you use Claude Code in VS Code', icon: icons.code, color: '#2f80ed' },
    { key: 'codex', found: setup.sources.codex, label: 'Codex', hint: setup.sources.codex ? `Codex CLI and Codex Desktop${count(today(sessions, 'codex'))}` : 'Shows up here once you use Codex', icon: icons.codex, color: '#3a3a3c' },
  ]
  return (
    <>
      {rows.map(r => (
        <Row key={r.key} label={r.label} hint={r.hint} icon={<Tile color={r.color}>{r.icon}</Tile>}>
          <StatusPill tone={r.found ? 'ok' : 'none'}>{r.found ? 'Found' : 'Not used'}</StatusPill>
        </Row>
      ))}
    </>
  )
}

export const SetupPage = ({ setup, settings, sessions, onWelcome }: {
  setup: SetupStatus
  settings: Settings
  sessions: Session[]
  onWelcome: () => void
}) => {
  const left = checksLeft(setup)
  const noSource = !setup.sources.claudeCode && !setup.sources.codex
  const taken = !setup.shortcuts.hotkey || !setup.shortcuts.panelHotkey
  return (
    <>
      <PageHeader
        tile={<Tile color="#2fa84f">{icons.setup}</Tile>}
        title="Setup"
        subtitle="Agent Pulse reads session files on this Mac. Nothing leaves it. This page updates by itself."
      />

      {left || noSource || taken
        ? (
            <div className="s-banner warn">
              <span className="s-dot orange" />
              <div>
                <strong>{noSource ? 'No Claude Code or Codex sessions found yet' : left ? `${left} ${left === 1 ? 'check' : 'checks'} left` : 'A shortcut needs new keys'}</strong>
                <div className="s-row-hint">Agent Pulse works without them, but may not bring every tab to the front or alert you.</div>
              </div>
            </div>
          )
        : (
            <div className="s-banner ok">
              <span className="s-dot green" />
              <div>
                <strong>Everything’s ready</strong>
                <div className="s-row-hint">Sessions, permissions and shortcuts all work.</div>
              </div>
            </div>
          )}

      <Group title="Where your sessions come from">
        <SourceRows setup={setup} sessions={sessions} />
      </Group>

      <Group
        title="Permissions"
        footer="macOS can’t be asked quietly, so each row has a test. The first test makes macOS ask once."
      >
        <CheckList setup={setup} />
      </Group>

      <Group title="Shortcuts">
        <Row label="Find a session" hint="Change it in General">
          <Keycaps accelerator={settings.hotkey} />
          <StatusPill tone={setup.shortcuts.hotkey ? 'ok' : 'warn'}>{setup.shortcuts.hotkey ? 'Works' : 'Taken'}</StatusPill>
        </Row>
        <Row label="Show or hide the panel" hint="Change it in General">
          <Keycaps accelerator={settings.panelHotkey} />
          <StatusPill tone={setup.shortcuts.panelHotkey ? 'ok' : 'warn'}>{setup.shortcuts.panelHotkey ? 'Works' : 'Taken'}</StatusPill>
        </Row>
      </Group>

      <Group>
        <Row label="Launch at login" hint={setup.loginItemAvailable ? undefined : 'Works in the installed app only'}>
          <Switch label="Launch at login" checked={settings.launchAtLogin} disabled={!setup.loginItemAvailable} onChange={launchAtLogin => save({ launchAtLogin })} />
        </Row>
        <Row label="Welcome guide" hint="Walks through sources, permissions and a look">
          <button type="button" className="s-button" onClick={onWelcome}>Show again</button>
        </Row>
      </Group>
    </>
  )
}
