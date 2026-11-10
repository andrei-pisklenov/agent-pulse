import { useEffect, useMemo, useState } from 'react'
import type { Session } from '../../../core/types'
import { CRAB_DANCES, RUNNING_MARK, type CrabDance, type Settings, type TrayIcon } from '../../../shared/types'
import { drawTrayIcon, type TrayMood } from '../trayIcon'
import { Group, icons, PageHeader, Row, save, Segmented, Tile } from './ui'

export const TRAY_ICONS: { id: TrayIcon, label: string }[] = [
  { id: 'crab', label: 'Crab' },
  { id: 'octopus', label: 'Octopus' },
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'rings', label: 'Limit rings' },
  { id: 'spark', label: 'Spark' },
  { id: 'bars', label: 'Signal bars' },
  { id: 'text', label: 'Text only' },
]

/** The preview shows the icon at work, so the dance can be seen even with nothing running. */
const WORKING: TrayMood = { busy: 2, waiting: 0, finished: 1, sessionPercent: 42, weekPercent: 63 }
const FPS = 8

/** An animated menu-bar icon; it runs only while this page is open. */
export const TrayPreview = ({ icon, dance }: { icon: TrayIcon, dance: CrabDance }) => {
  const [src, setSrc] = useState<string | null>(() => drawTrayIcon(icon, WORKING, 0, dance))
  useEffect(() => {
    let frame = 0
    const paint = () => setSrc(drawTrayIcon(icon, WORKING, frame++, dance))
    paint()
    if (icon === 'text' || icon === 'bars') return
    const timer = window.setInterval(paint, 1000 / FPS)
    return () => window.clearInterval(timer)
  }, [icon, dance])
  return src ? <img src={src} alt="" /> : null
}

export const IconChoices = ({ value, onChange, only }: { value: TrayIcon, onChange: (icon: TrayIcon) => void, only?: TrayIcon[] }) => {
  const still = useMemo(() => Object.fromEntries(TRAY_ICONS.map(i => [i.id, drawTrayIcon(i.id, WORKING, 0)])), [])
  return (
    <div className="s-choices four" role="radiogroup" aria-label="Menu bar icon">
      {TRAY_ICONS.filter(i => !only || only.includes(i.id)).map(i => (
        <button key={i.id} type="button" role="radio" aria-checked={value === i.id} className={`s-icon-choice${value === i.id ? ' selected' : ''}`} onClick={() => onChange(i.id)}>
          {still[i.id] ? <img src={still[i.id]!} alt="" /> : <span className="s-icon-text">!1 {RUNNING_MARK}2</span>}
          {i.label}
        </button>
      ))}
    </div>
  )
}

const clock = (now: number) => new Date(now).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const MenuBarPage = ({ settings, sessions, now, percent }: {
  settings: Settings
  sessions: Session[]
  now: number
  /** The 5-hour limit, for "Counts + 5-hour %". */
  percent: number | null
}) => {
  const counts = [
    ['!', sessions.filter(s => s.status === 'waiting' && !s.snoozedUntil).length],
    [RUNNING_MARK, sessions.filter(s => s.status === 'busy').length],
    ['✓', sessions.filter(s => s.status === 'finished').length],
  ] as const
  const countText = counts.filter(([, n]) => n).map(([mark, n]) => `${mark}${n}`).join(' ') || `${RUNNING_MARK}2 ✓1`
  return (
    <>
      <PageHeader tile={<Tile color="#5e5ce6">{icons.menubar}</Tile>} title="Menu bar" subtitle="The icon next to your clock, and the text beside it." />

      <div className="s-menubar" aria-label="Preview of the menu bar">
        <span className="s-menubar-item">
          {settings.trayIcon === 'text' ? '◆' : <TrayPreview icon={settings.trayIcon} dance={settings.crabDance} />}
          {settings.trayText !== 'none' && <span>{countText}</span>}
          {(settings.trayText === 'countsAndSession' || settings.trayIcon === 'text') && <span>{percent ?? 0}%</span>}
        </span>
        <span>{clock(now)}</span>
      </div>

      <Group title="Icon" footer="Icons take the menu bar’s colour, like macOS’s own. They move only while sessions run.">
        <IconChoices value={settings.trayIcon} onChange={trayIcon => save({ trayIcon })} />
      </Group>

      {settings.trayIcon === 'crab' && (
        <Group title="Crab dance while sessions run" footer="The preview above plays the dance you pick.">
          <div className="s-chips" role="radiogroup" aria-label="Crab dance">
            {CRAB_DANCES.map(d => (
              <button key={d.id} type="button" role="radio" aria-checked={settings.crabDance === d.id} className={`s-chip${settings.crabDance === d.id ? ' selected' : ''}`} onClick={() => save({ crabDance: d.id })}>
                {d.label}
              </button>
            ))}
          </div>
        </Group>
      )}

      <Group title="Text next to the icon">
        <Row label="Show" hint={`! needs input · ${RUNNING_MARK} running · ✓ finished`}>
          <Segmented
            label="Text next to the icon"
            options={[{ value: 'none', label: 'Nothing' }, { value: 'counts', label: 'Counts' }, { value: 'countsAndSession', label: 'Counts + 5-hour %' }]}
            value={settings.trayText}
            onChange={trayText => save({ trayText })}
          />
        </Row>
      </Group>
    </>
  )
}
