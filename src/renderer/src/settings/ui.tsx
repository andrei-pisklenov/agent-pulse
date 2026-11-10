import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Settings } from '../../../shared/types'

export const api = window.pulse

export const save = (patch: Partial<Settings>) => api.setSettings(patch)

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const icons = {
  setup: <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  general: (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  ),
  panel: <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" /></svg>,
  menubar: <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9.5h18" /></svg>,
  usage: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.6} aria-hidden="true"><path d="M6 19v-7M12 19V6M18 19v-4" /></svg>,
  terminal: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.4} aria-hidden="true"><path d="M5 8l4 4-4 4M12 17h7" /></svg>,
  window: <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 9h18" /></svg>,
  code: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.4} aria-hidden="true"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>,
  codex: <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" /></svg>,
  check: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.6} aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  search: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
}

export const Tile = ({ color, children }: { color: string, children: ReactNode }) =>
  <span className="s-tile" style={{ background: color }}>{children}</span>

export const PageHeader = ({ tile, title, subtitle }: { tile: ReactNode, title: string, subtitle?: ReactNode }) => (
  <header className="s-header">
    {tile}
    <div className="s-heading">
      <h1>{title}</h1>
      {subtitle && <p className="s-subtitle">{subtitle}</p>}
    </div>
  </header>
)

export const Group = ({ title, footer, children }: { title?: string, footer?: ReactNode, children: ReactNode }) => (
  <section>
    {title && <h3 className="s-group-title">{title}</h3>}
    <div className="s-group-body">{children}</div>
    {footer && <p className="s-group-footer">{footer}</p>}
  </section>
)

export const Row = ({ label, hint, icon, children }: { label: ReactNode, hint?: ReactNode, icon?: ReactNode, children?: ReactNode }) => (
  <div className="s-row">
    <div className="s-row-label">
      {icon}
      <div>
        <div>{label}</div>
        {hint && <div className="s-row-hint">{hint}</div>}
      </div>
    </div>
    {children && <div className="s-row-control">{children}</div>}
  </div>
)

export const Switch = ({ label, checked, onChange, disabled }: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className={`s-switch${checked ? ' on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="knob" />
  </button>
)

export interface Option<T> {
  value: T
  label: ReactNode
}

export const Segmented = <T extends string | number>({ label, options, value, onChange }: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) => (
  <div className="s-segmented" role="radiogroup" aria-label={label}>
    {options.map(o => (
      <button
        key={String(o.value)}
        type="button"
        role="radio"
        aria-checked={o.value === value}
        className={o.value === value ? 'selected' : ''}
        onClick={() => onChange(o.value)}
      >{o.label}
      </button>
    ))}
  </div>
)

export const Select = <T extends string | number>({ label, options, value, onChange, disabled }: {
  label: string
  options: { value: T, label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) => (
  <select
    className="s-select"
    aria-label={label}
    value={String(value)}
    disabled={disabled}
    onChange={(e) => {
      const picked = options.find(o => String(o.value) === e.target.value)
      if (picked) onChange(picked.value)
    }}
  >
    {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
  </select>
)

export const StatusPill = ({ tone, children }: { tone: 'ok' | 'warn' | 'none', children: ReactNode }) =>
  <span className={`s-pill ${tone}`}>{children}</span>

const KEY_SYMBOLS: Record<string, string> = {
  Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘',
  Space: 'Space', Up: '↑', Down: '↓', Left: '←', Right: '→', Return: '↩', Enter: '↩', Tab: '⇥',
}

export const Keycaps = ({ accelerator }: { accelerator: string }) => (
  <span className="s-keycaps">
    {accelerator.split('+').filter(Boolean).map(key => <span className="s-keycap" key={key}>{KEY_SYMBOLS[key] ?? key}</span>)}
  </span>
)

/** The accelerator for a key press, e.g. "Control+Alt+C"; null while only modifiers are down. */
const NAMED_KEYS: Record<string, string> = {
  Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Enter: 'Return', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
}

/** The key itself, by position, so ⌥C gives "C" and not "ç". */
const keyOf = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  return NAMED_KEYS[code] ?? null
}

const acceleratorOf = (e: KeyboardEvent): string | null => {
  const key = keyOf(e.code)
  if (!key) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Command'].filter(Boolean)
  return [...mods, key].join('+')
}

/**
 * Click, then press the new keys. Global shortcuts are paused meanwhile, so pressing the current
 * one records it instead of firing it. A shortcut needs ⌃, ⌥ or ⌘; Esc cancels.
 */
export const ShortcutRecorder = ({ label, value, onChange, taken }: {
  label: string
  value: string
  onChange: (accelerator: string) => void
  taken?: boolean
}) => {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The page re-renders with every snapshot; a ref keeps that from restarting the recording.
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  useEffect(() => {
    if (!recording) return
    api.pauseHotkeys(true)
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setRecording(false)
        return
      }
      const accelerator = acceleratorOf(e)
      if (!accelerator) return
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        setError('Add ⌃, ⌥ or ⌘ to the keys')
        return
      }
      setError(null)
      setRecording(false)
      changed.current(accelerator)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      api.pauseHotkeys(false)
    }
  }, [recording])

  return (
    <div className="s-shortcut">
      <button
        type="button"
        className={`s-shortcut-field${recording ? ' recording' : ''}`}
        aria-label={`${label}: ${recording ? 'press the new keys' : value}`}
        onClick={() => {
          setError(null)
          setRecording(r => !r)
        }}
        onBlur={() => setRecording(false)}
      >
        {recording ? 'Press the new keys…' : <Keycaps accelerator={value} />}
      </button>
      {error && <span className="s-error">{error}</span>}
      {!error && taken && !recording && <span className="s-error">Another app uses these keys</span>}
    </div>
  )
}
