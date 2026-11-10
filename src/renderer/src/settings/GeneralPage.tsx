import type { Settings, SetupStatus } from '../../../shared/types'
import { Group, icons, PageHeader, Row, save, Select, ShortcutRecorder, Switch, Tile } from './ui'

const WAIT_OPTIONS = [
  { value: 0, label: 'Right away' },
  { value: 1, label: 'After 1 minute' },
  { value: 5, label: 'After 5 minutes' },
  { value: 15, label: 'After 15 minutes' },
]

export const GeneralPage = ({ settings, setup }: { settings: Settings, setup: SetupStatus }) => {
  const features = (patch: Partial<Settings['features']>) => save({ features: { ...settings.features, ...patch } })
  const quiet = (patch: Partial<Settings['quietHours']>) => save({ quietHours: { ...settings.quietHours, ...patch } })
  return (
    <>
      <PageHeader tile={<Tile color="#8e8e93">{icons.general}</Tile>} title="General" subtitle="Startup, alerts, shortcuts and what session rows show." />

      <Group>
        <Row label="Launch at login" hint={setup.loginItemAvailable ? undefined : 'Works in the installed app only'}>
          <Switch label="Launch at login" checked={settings.launchAtLogin} disabled={!setup.loginItemAvailable} onChange={launchAtLogin => save({ launchAtLogin })} />
        </Row>
      </Group>

      <Group title="Alerts" footer="Quiet hours also hold back limit warnings. The panel and the menu bar keep updating.">
        <Row label="Notify when a session needs input">
          <Switch label="Notify when a session needs input" checked={settings.notifyWaiting} onChange={notifyWaiting => save({ notifyWaiting })} />
        </Row>
        <Row label="Alert once it has waited" hint="Skips questions you answer right away">
          <Select label="Alert once it has waited" options={WAIT_OPTIONS} value={settings.notifyAfterMinutes} onChange={notifyAfterMinutes => save({ notifyAfterMinutes })} />
        </Row>
        <Row label="Play a sound when a session finishes or waits">
          <Switch label="Play a sound" checked={settings.sound} onChange={sound => save({ sound })} />
        </Row>
        <Row label="Quiet hours" hint="No alerts or sounds">
          <input
            type="time"
            className="s-time"
            aria-label="Quiet hours start"
            value={settings.quietHours.from}
            disabled={!settings.quietHours.enabled}
            onChange={e => e.target.value && quiet({ from: e.target.value })}
          />
          <span aria-hidden="true">–</span>
          <input
            type="time"
            className="s-time"
            aria-label="Quiet hours end"
            value={settings.quietHours.to}
            disabled={!settings.quietHours.enabled}
            onChange={e => e.target.value && quiet({ to: e.target.value })}
          />
          <Switch label="Quiet hours" checked={settings.quietHours.enabled} onChange={enabled => quiet({ enabled })} />
        </Row>
      </Group>

      <Group title="Shortcuts" footer="Click a shortcut, then press the new keys. Esc cancels.">
        <Row label="Find a session" hint={settings.features.quickSwitcher ? 'Spotlight-style list of all sessions' : 'Shows or hides the panel while the quick switcher is off'}>
          <ShortcutRecorder label="Find a session" value={settings.hotkey} taken={!setup.shortcuts.hotkey} onChange={hotkey => save({ hotkey })} />
        </Row>
        <Row label="Show or hide the panel">
          <ShortcutRecorder label="Show or hide the panel" value={settings.panelHotkey} taken={!setup.shortcuts.panelHotkey} onChange={panelHotkey => save({ panelHotkey })} />
        </Row>
        <Row label="Use the quick switcher" hint="Off: the Find shortcut shows or hides the panel instead">
          <Switch label="Use the quick switcher" checked={settings.features.quickSwitcher} onChange={quickSwitcher => features({ quickSwitcher })} />
        </Row>
      </Group>

      <Group title="Session rows">
        <Row label="Show what waiting sessions ask" hint="The question or the permission it needs, under the title">
          <Switch label="Show what waiting sessions ask" checked={settings.features.pendingQuestion} onChange={pendingQuestion => features({ pendingQuestion })} />
        </Row>
        <Row label="Show how long sessions waited on you">
          <Switch label="Show how long sessions waited on you" checked={settings.features.blockedTime} onChange={blockedTime => features({ blockedTime })} />
        </Row>
      </Group>

      <p className="s-group-footer">
        Agent Pulse is an independent project, not affiliated with Anthropic or OpenAI.
        {' '}<a href="https://github.com/andrei-pisklenov/agent-pulse" target="_blank" rel="noreferrer">GitHub</a>
      </p>
    </>
  )
}
