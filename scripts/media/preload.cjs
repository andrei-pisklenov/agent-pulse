// Stands in for the app's preload inside the stage's iframe: serves the scene the capture script set up
// and reports the rendered size, so the real renderer runs unchanged on made-up data.
// Sandboxed preloads can only be CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron')

if (globalThis.location.pathname.endsWith('/renderer/index.html')) {
  const scene = ipcRenderer.sendSync('media:scene')
  const listeners = { snapshot: [], settings: [], panelState: [] }
  const listen = key => (cb) => {
    listeners[key].push(cb)
    return () => undefined
  }
  const noop = () => undefined

  contextBridge.exposeInMainWorld('pulse', {
    onSnapshot: listen('snapshot'),
    onSettings: listen('settings'),
    onPanelState: listen('panelState'),
    ready: () => setTimeout(() => {
      listeners.settings.forEach(cb => cb(scene.settings))
      listeners.panelState.forEach(cb => cb(scene.panel))
      listeners.snapshot.forEach(cb => cb(scene.snapshot))
    }),
    setSize: (width, height) => ipcRenderer.send('media:size', width, height),
    dragStart: noop,
    dragEnd: noop,
    openSession: noop,
    markRead: noop,
    setSettings: noop,
    showMenu: noop,
    snooze: noop,
    closeSwitcher: noop,
    setTrayImage: noop,
  })
}
