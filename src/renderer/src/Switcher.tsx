import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Session, Snapshot } from '../../core/types'
import { defaultSettings, type Settings } from '../../shared/types'
import { formatAge, sourceLabel } from './format'
import { IconSearch, StatusIcon } from './icons'

const api = window.pulse

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'waiting', label: 'Needs input', match: (s: Session) => s.status === 'waiting' },
  { key: 'busy', label: 'Running', match: (s: Session) => s.status === 'busy' },
  { key: 'finished', label: 'Unread', match: (s: Session) => s.status === 'finished' },
] as const

/** Spotlight-style session picker shown by the main hotkey. */
export const Switcher = () => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(0)
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const offs = [
      api.onSnapshot((s: Snapshot) => {
        setSessions(s.sessions)
        setNow(s.generatedAt)
      }),
      api.onSettings(setSettings),
    ]
    api.ready()
    // Each time the window is shown it gets focus: start fresh.
    const reset = () => {
      setQuery('')
      setSelected(0)
      input.current?.focus()
    }
    window.addEventListener('focus', reset)
    return () => {
      offs.forEach(off => off())
      window.removeEventListener('focus', reset)
    }
  }, [])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return sessions.filter(s => FILTERS[filter]!.match(s)).filter((s) => {
      const hay = `${s.title} ${s.project} ${s.pendingPrompt ?? ''} ${sourceLabel[s.source]}`.toLowerCase()
      return words.every(w => hay.includes(w))
    })
  }, [sessions, query, filter])

  const current = results[Math.min(selected, results.length - 1)]

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, results])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      api.closeSwitcher()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(i => Math.max(i - 1, 0))
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setFilter(f => (f + (e.shiftKey ? FILTERS.length - 1 : 1)) % FILTERS.length)
      setSelected(0)
    } else if (e.key === 'Enter' && current) {
      api.openSession(current.id)
    } else if (e.key === 's' && e.metaKey && current?.status === 'waiting') {
      e.preventDefault()
      api.snooze(current.id, current.snoozedUntil ? 0 : 15)
    }
  }

  return (
    <div className={`switcher theme-${settings.theme}`} onKeyDown={onKey}>
      <div className="sw-search">
        <IconSearch />
        <input
          ref={input}
          autoFocus
          value={query}
          placeholder="Find a Claude session…"
          aria-label="Find a Claude session"
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
        />
      </div>
      <div className="sw-filters" role="tablist">
        {FILTERS.map((f, i) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === i}
            className={`sw-filter ${filter === i ? 'on' : ''}`}
            onClick={() => {
              setFilter(i)
              setSelected(0)
              input.current?.focus()
            }}
          >
            {f.label} <span className="muted num">{sessions.filter(f.match).length}</span>
          </button>
        ))}
      </div>
      <div className="sw-list" ref={list} role="listbox">
        {results.map((s, i) => (
          <button
            key={s.id}
            role="option"
            aria-selected={s === current}
            className={`sw-row ${s === current ? 'on' : ''}`}
            onMouseMove={() => setSelected(i)}
            onClick={() => api.openSession(s.id)}
          >
            <StatusIcon status={s.status} theme={settings.theme} />
            <span className="sw-main">
              <span className="ttl">{s.title}</span>
              <span className="muted sw-sub ellipsis">
                {s.project} · {sourceLabel[s.source]} · {formatAge(s.statusSince, now)}
                {settings.features.pendingQuestion && s.pendingPrompt ? ` · “${s.pendingPrompt}”` : ''}
              </span>
            </span>
          </button>
        ))}
        {results.length === 0 && <div className="empty muted">No matching sessions</div>}
      </div>
      <div className="sw-hints muted">
        <span>↵ open</span><span>⇥ filter</span><span>⌘S snooze</span><span>esc close</span>
      </div>
    </div>
  )
}
