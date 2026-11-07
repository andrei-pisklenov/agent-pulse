// Renders the README screenshots and GIFs into docs/media: `yarn media`.
// The real built renderer runs on a mock desktop (stage.html) with made-up sessions (demo.mjs).
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { demoSettings, demoSnapshot } from './demo.mjs'

app.dock?.hide()

const HERE = import.meta.dirname
const OUT = resolve(HERE, '../../docs/media')
const SCALE = 2
const run = promisify(execFile)

let scene = null
let lastSize = 0
ipcMain.on('media:scene', (event) => {
  event.returnValue = scene
})

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const counts = (snapshot) => {
  const n = status => snapshot.sessions.filter(s => s.status === status && !s.snoozedUntil).length
  return { busy: n('busy'), waiting: n('waiting'), finished: n('finished') }
}

const trayFor = (snapshot, dance = 'walk') => {
  const c = counts(snapshot)
  const marks = [['!', c.waiting], ['▶︎', c.busy], ['✓', c.finished]].filter(([, v]) => v).map(([m, v]) => `${m}${v}`)
  return {
    icon: 'crab',
    dance,
    text: ` ${marks.join(' ')}`,
    mood: { ...c, sessionPercent: snapshot.limits?.session?.percent ?? null, weekPercent: snapshot.limits?.week?.percent ?? null },
  }
}

const menubar = snapshot => ({
  app: 'Terminal',
  menus: ['Shell', 'Edit', 'View', 'Window', 'Help'],
  clock: 'Tue 14:05',
  tray: trayFor(snapshot),
})

const TERMINAL = `<span class="dim">~/code/orbit-api</span> <span class="acc">❯</span> claude

<span class="acc">›</span> Add rate limiting to the API

<span class="ok">●</span> I'll put a token-bucket limiter in front of the public routes and
  return <span class="acc">429</span> with a Retry-After header when a client runs out.

<span class="ok">●</span> Update(src/middleware/rateLimit.ts)
  <span class="dim">⎿  Added 46 lines</span>

<span class="ok">●</span> Update(src/routes/public.ts)
  <span class="dim">⎿  Added 3 lines, removed 1 line</span>

<span class="warn">●</span> Bash(npm run test:integration)

  <span class="warn">Allow Bash: Run the integration tests?</span>
  <span class="sel"> ❯ Yes </span>
    No`

const terminal = style => ({ title: 'orbit-api — claude', style, html: TERMINAL })

let win = null

/** Sizes the stage to `width`×`height` points and builds `s` in it. One offscreen window serves every scene. */
const openStage = async (width, height, s) => {
  if (!win) {
    win = new BrowserWindow({
      show: false,
      useContentSize: true,
      enableLargerThanScreen: true,
      webPreferences: {
        offscreen: true,
        preload: join(HERE, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegrationInSubFrames: true,
        backgroundThrottling: false,
      },
    })
    win.webContents.setFrameRate(30)
    ipcMain.on('media:size', (_event, w, h) => {
      lastSize = Date.now()
      void win.webContents.executeJavaScript(`stage.size(${w}, ${h})`)
    })
  }
  win.setContentSize(width * SCALE, height * SCALE)
  await win.loadFile(join(HERE, 'stage.html'))
  win.webContents.setZoomFactor(SCALE)
  lastSize = Date.now()
  await win.webContents.executeJavaScript(`stage.render(${JSON.stringify(s)})`)
  // Let the renderer report its size and settle.
  do await wait(250)
  while (Date.now() - lastSize < 600)
  return win
}

const capture = async (win, rect) => {
  const image = await win.webContents.capturePage(rect && {
    x: rect.x * SCALE, y: rect.y * SCALE, width: rect.width * SCALE, height: rect.height * SCALE,
  })
  return image.toPNG()
}

/** `rect` is a region in points, or 'panel' for the panel plus a margin of wallpaper. */
const still = async (name, width, height, s, rect) => {
  await openStage(width, height, s)
  const region = rect === 'panel' ? await win.webContents.executeJavaScript('stage.bounds(36)') : rect
  await writeFile(join(OUT, `${name}.png`), await capture(win, region))
  console.log(`docs/media/${name}.png`)
}

/** Records `frames` frames at 8 fps (the app's own icon frame rate) into a GIF. */
const gif = async (name, width, height, s, frames, rect) => {
  await openStage(width, height, s)
  const dir = await mkdtemp(join(tmpdir(), 'agent-pulse-media-'))
  for (let f = 0; f < frames; f++) {
    await win.webContents.executeJavaScript(`stage.frame(${f})`)
    await wait(60)
    await writeFile(join(dir, `f${String(f).padStart(3, '0')}.png`), await capture(win, rect))
  }
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', '8', '-i', join(dir, 'f%03d.png'),
    '-vf', 'split[a][b];[a]palettegen=stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none',
    '-loop', '0', join(OUT, `${name}.gif`),
  ])
  await rm(dir, { recursive: true, force: true })
  console.log(`docs/media/${name}.gif (${frames} frames)`)
}

const panelScene = (settings, panel, extra = {}) => {
  const snapshot = demoSnapshot()
  scene = { snapshot, settings, panel }
  return { wall: 'wall-dusk', menubar: menubar(snapshot), ...extra }
}

const vertical = { orientation: 'vertical', edges: ['right'], maxWidth: 1200, maxHeight: 760, forceExpanded: true }

const main = async () => {
  await mkdir(OUT, { recursive: true })
  nativeTheme.themeSource = 'dark'

  // The panel, expanded on the right edge, next to a session that waits for permission.
  await still('panel', 1280, 800, panelScene(demoSettings({ snapGap: 8 }), vertical, {
    terminals: [terminal('left: 70px; top: 86px; width: 720px; height: 470px;')],
    panel: { glass: true, style: 'right: 8px; top: 92px;' },
  }))

  // At rest it is a small pill.
  await still('pill', 340, 380, panelScene(demoSettings(), { ...vertical, forceExpanded: false }, {
    menubar: { ...menubar(demoSnapshot()), app: '', menus: [] },
    panel: { glass: true, style: 'right: 0; top: 110px;' },
  }))

  // Snapped to the top edge it becomes a strip.
  await still('strip', 1280, 300, panelScene(demoSettings(), { ...vertical, orientation: 'horizontal', edges: ['top'] }, {
    panel: { glass: true, style: 'left: 50%; top: 24px; transform: translateX(-50%);' },
  }), { x: 0, y: 0, width: 1280, height: 84 })

  // The terminal HUD theme.
  await still('terminal-theme', 560, 760, panelScene(demoSettings({ theme: 'terminal' }), vertical, {
    wall: 'wall-plain', menubar: null,
    panel: { glass: false, style: 'right: 40px; top: 40px;' },
  }), 'panel')

  // The quick switcher on ⌃⌥C.
  await still('switcher', 1000, 600, panelScene(demoSettings(), vertical, {
    terminals: [terminal('left: 60px; top: 70px; width: 640px; height: 470px;')],
    panel: { glass: true, hash: '#switcher', fixedSize: [560, 420], style: 'left: 220px; top: 110px;' },
  }))

  // Light mode.
  nativeTheme.themeSource = 'light'
  await still('panel-light', 560, 760, panelScene(demoSettings(), vertical, {
    wall: 'wall-dawn', light: true, menubar: null,
    panel: { glass: true, style: 'right: 40px; top: 40px;' },
  }), 'panel')
  nativeTheme.themeSource = 'dark'

  // The menu-bar crab, animated, in the menu bar of the main screenshot.
  scene = null
  const snapshot = demoSnapshot()
  const bar = { wall: 'wall-dusk', menubar: menubar(snapshot) }
  await openStage(1280, 24, bar)
  const barFrames = await win.webContents.executeJavaScript(`stage.period([${JSON.stringify(bar.menubar.tray)}])`)
  await gif('menubar', 1280, 24, bar, barFrames, { x: 980, y: 0, width: 300, height: 24 })

  // Every dance, while sessions run.
  const busy = { busy: 2, waiting: 0, finished: 0, sessionPercent: 40, weekPercent: 55 }
  const { CRAB_DANCES } = await import('../../src/shared/types.ts')
  const dances = { tiles: CRAB_DANCES.map(d => ({ label: d.label, dance: d.id, mood: busy })) }
  // And its moods.
  const moods = {
    tiles: [
      { label: 'Asleep', note: 'nothing to do', mood: { ...busy, busy: 0 } },
      { label: 'Puzzled', note: 'a session needs you', mood: { ...busy, busy: 0, waiting: 1 } },
      { label: 'Working', note: 'sessions running', mood: busy },
      { label: 'Waving', note: 'running, one needs you', mood: { ...busy, waiting: 1 } },
    ].map(t => ({ dance: 'walk', ...t })),
  }
  for (const [name, s, width] of [['crab-dances', dances, 1080], ['crab-moods', moods, 660]]) {
    await openStage(width, 170, s)
    const frames = await win.webContents.executeJavaScript(`stage.period(${JSON.stringify(s.tiles)})`)
    await gif(name, width, 170, s, frames)
  }
}

app.whenReady().then(main).then(() => app.quit(), (error) => {
  console.error(error)
  app.exit(1)
})
