import type { LimitWindow, Limits } from './types.js'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Removes ANSI escapes and box-drawing noise and collapses whitespace. */
export const cleanTerminalText = (raw: string): string =>
  raw
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[\]P^_][^\x07\x1b]*(\x07|\x1b\\)/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ')
    .replace(/[▀-▟]/g, ' ')
    .replace(/\s+/g, ' ')

/** Claude Code's folder trust prompt, in current ("I trust this folder") and older ("trust the files in this folder") wording. */
export const TRUST_PROMPT = /trust (the files in )?this folder/i

/**
 * Replays terminal output into the lines it leaves on screen. Claude Code redraws by moving the
 * cursor and overwriting single characters, so flattened text keeps stale parts that the screen no
 * longer shows. Handles cursor moves, carriage return, line feed and erases; ignores styling.
 */
export const renderScreen = (raw: string, cols = 160): string[] => {
  const lines: string[][] = [[]]
  let row = 0
  let col = 0
  const line = () => (lines[row] ??= [])
  // eslint-disable-next-line no-control-regex
  const token = /\x1b\[([0-?]*)[ -/]*([@-~])|\x1b[\]P^_][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()*+].|\x1b.|[\s\S]/gu
  for (const [text, params, command] of raw.matchAll(token)) {
    if (command) {
      const n = Math.max(1, Number(params?.split(';')[0]) || 1)
      if (command === 'A') row = Math.max(0, row - n)
      else if (command === 'B') row += n
      else if (command === 'C') col = Math.min(cols - 1, col + n)
      else if (command === 'D') col = Math.max(0, col - n)
      else if (command === 'G') col = Math.min(cols - 1, n - 1)
      else if (command === 'K') {
        const l = line()
        if (params === '1') l.fill(' ', 0, col + 1)
        else if (params === '2') l.length = 0
        else l.length = Math.min(l.length, col)
      } else if (command === 'J' && (params === '2' || params === '3')) {
        lines.length = 0
        row = 0
        col = 0
      }
    } else if (text === '\r') col = 0
    else if (text === '\n') row++
    // eslint-disable-next-line no-control-regex
    else if (!/^[\x00-\x1f\x7f]/.test(text)) {
      if (col >= cols) {
        row++
        col = 0
      }
      const l = line()
      while (l.length < col) l.push(' ')
      l[col++] = text
    }
  }
  return Array.from(lines, l => (l ?? []).join('').trimEnd())
}

/**
 * Which option of the folder trust prompt is selected: the one the `❯` marker is in front of on the
 * screen `raw` leaves behind. Null when no option is marked yet.
 */
export const trustPromptSelection = (raw: string): 'yes' | 'no' | null => {
  let selected: 'yes' | 'no' | null = null
  for (const l of renderScreen(raw)) {
    for (const m of cleanTerminalText(l).matchAll(/❯\s*(?:\d+\.\s*)?(yes|no)\b/gi)) {
      selected = m[1]!.toLowerCase() as 'yes' | 'no'
    }
  }
  return selected
}

interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const wallTimeIn = (ms: number, timeZone: string): WallTime => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month') - 1, day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** Epoch ms of a wall-clock time in an IANA zone. */
const zonedToEpoch = (w: WallTime, timeZone: string): number => {
  const asUtc = Date.UTC(w.year, w.month, w.day, w.hour, w.minute)
  let guess = asUtc
  for (let i = 0; i < 2; i++) {
    const seen = wallTimeIn(guess, timeZone)
    const seenUtc = Date.UTC(seen.year, seen.month, seen.day, seen.hour, seen.minute)
    guess += asUtc - seenUtc
  }
  return guess
}

const validZone = (zone: string | undefined): string | undefined => {
  if (!zone) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return undefined
  }
}

/**
 * Turns the `/usage` reset text ("1:30am (America/New_York)", "Nov 1 at 8am (America/New_York)",
 * "Nov 1, 8:00am") into epoch ms, choosing the next occurrence after `now`.
 */
export const parseResetTime = (text: string, now = Date.now()): number | null => {
  const zone = validZone(/\(([A-Za-z_]+(?:\/[A-Za-z_+-]+)+|UTC)\)/.exec(text)?.[1])
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const time = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(text)
  if (!time) return null
  let hour = Number(time[1]) % 12
  if (time[3]!.toLowerCase() === 'pm') hour += 12
  const minute = Number(time[2] ?? 0)
  const today = wallTimeIn(now, zone)
  const date = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(text)

  if (date) {
    const month = MONTHS.indexOf(date[1]!.toLowerCase())
    const day = Number(date[2])
    let at = zonedToEpoch({ year: today.year, month, day, hour, minute }, zone)
    // "Jan 2" seen in late December belongs to next year.
    if (at < now - 2 * 86_400_000) at = zonedToEpoch({ year: today.year + 1, month, day, hour, minute }, zone)
    return at
  }
  const at = zonedToEpoch({ ...today, hour, minute }, zone)
  return at > now ? at : zonedToEpoch({ ...wallTimeIn(now + 86_400_000, zone), hour, minute }, zone)
}

const BAR = /(Current session|Current week \(([^)]+)\))\s*(\d{1,3})\s*%\s*used\s*(?:Resets\s+(.*?\)|[^C]*?(?=Current|What|$)))?/gi

/** Extracts the plan-limit bars from a rendered `/usage` screen. Returns null when none were found. */
export const parseUsageScreen = (raw: string, now = Date.now()): Limits | null => {
  const text = cleanTerminalText(raw)
  // The screen is redrawn several times; the last rendering wins.
  const found = new Map<string, LimitWindow>()
  for (const m of text.matchAll(BAR)) {
    const label = m[2] ? m[2].trim() : 'session'
    const resetsText = (m[4] ?? '').trim()
    found.set(label.toLowerCase(), {
      percent: Math.min(100, Number(m[3])),
      resetsText,
      resetsAt: resetsText ? parseResetTime(resetsText, now) : null,
    })
  }
  if (found.size === 0) return null
  const weekModels = [...found.entries()]
    .filter(([label]) => label !== 'session' && label !== 'all models')
    .map(([label, window]) => ({ label, window }))
  return {
    session: found.get('session') ?? null,
    week: found.get('all models') ?? null,
    weekModels,
    fetchedAt: now,
    error: null,
  }
}
