import { useEffect, useState } from 'react'
import type { Session } from '../../../core/types'
import { RUNNING_MARK, type Settings, type SetupStatus } from '../../../shared/types'
import { drawTrayIcon } from '../trayIcon'
import { ThemeChoices } from './PanelPage'
import { IconChoices } from './MenuBarPage'
import { CheckList, SourceRows } from './SetupPage'
import { api, icons, Keycaps, Row, save, Switch, Tile } from './ui'

const STEPS = 4

/** First-launch guide: what was found, the permission tests, a look, then the shortcuts. */
export const Welcome = ({ settings, setup, sessions, onClose }: {
  settings: Settings
  setup: SetupStatus
  sessions: Session[]
  onClose: () => void
}) => {
  const [step, setStep] = useState(1)
  const finish = () => {
    api.finishWelcome()
    onClose()
  }
  const crab = drawTrayIcon('crab', { busy: 0, waiting: 0, finished: 0, sessionPercent: null, weekPercent: null }, 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="s-sheet-backdrop">
      <section className="s-sheet" role="dialog" aria-modal="true" aria-label="Welcome to Agent Pulse">
        <div className="s-steps" aria-label={`Step ${step} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}
        </div>

        {step === 1 && (
          <>
            <div className="s-hero">
              <Tile color="#c96442">{crab ? <img src={crab} alt="" style={{ filter: 'invert(1)' }} /> : icons.terminal}</Tile>
              <h2>Welcome to Agent Pulse</h2>
              <p>Every Claude Code and Codex session in one small panel, so none of them sits waiting for you.</p>
            </div>
            <div className="s-legend-marks"><span><b>!</b> needs input</span><span><b>{RUNNING_MARK}</b> running</span><span><b>✓</b> finished</span></div>
            <div>
              <h3 className="s-group-title">Found on this Mac</h3>
              <div className="s-group-body"><SourceRows setup={setup} sessions={sessions} /></div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="s-hero">
              <Tile color="#5e5ce6">{icons.setup}</Tile>
              <h2>Two quick tests</h2>
              <p>Try each one. macOS asks once, the first time. Both are optional, and Settings › Setup has the same tests.</p>
            </div>
            <div className="s-group-body"><CheckList setup={setup} /></div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="s-hero">
              <h2>Pick a look</h2>
              <p>You can change both any time in Settings.</p>
            </div>
            <div>
              <h3 className="s-group-title">Panel</h3>
              <div className="s-group-body"><ThemeChoices theme={settings.theme} onChange={theme => save({ theme })} /></div>
            </div>
            <div>
              <h3 className="s-group-title">Menu bar icon</h3>
              <div className="s-group-body"><IconChoices value={settings.trayIcon} onChange={trayIcon => save({ trayIcon })} only={['crab', 'octopus', 'rings', 'text']} /></div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="s-hero">
              <Tile color="#2fa84f">{icons.check}</Tile>
              <h2>You’re all set</h2>
              <p>The panel sits at the edge of your screen. Settings are in the menu-bar menu.</p>
            </div>
            <div className="s-group-body">
              <Row label="Find a session"><Keycaps accelerator={settings.hotkey} /></Row>
              <Row label="Show or hide the panel"><Keycaps accelerator={settings.panelHotkey} /></Row>
              <Row label="Launch at login" hint={setup.loginItemAvailable ? 'So the panel is there after a restart' : 'Works in the installed app only'}>
                <Switch label="Launch at login" checked={settings.launchAtLogin} disabled={!setup.loginItemAvailable} onChange={launchAtLogin => save({ launchAtLogin })} />
              </Row>
            </div>
          </>
        )}

        <div className="s-sheet-footer">
          {step === 1
            ? <button type="button" className="s-button plain" onClick={finish}>Skip</button>
            : <button type="button" className="s-button" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="button" className="s-button primary" onClick={() => (step === STEPS ? finish() : setStep(step + 1))}>
            {step === 1 ? 'Get started' : step === STEPS ? 'Start using Agent Pulse' : 'Continue'}
          </button>
        </div>
      </section>
    </div>
  )
}
