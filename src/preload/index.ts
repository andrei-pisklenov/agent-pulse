import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PulseApi } from '../shared/types'

const listen = <T>(channel: string) => (cb: (value: T) => void) => {
  const handler = (_event: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: PulseApi = {
  onSnapshot: listen(IPC.snapshot),
  onSettings: listen(IPC.settings),
  onPanelState: listen(IPC.panelState),
  ready: () => ipcRenderer.send(IPC.ready),
  setSize: (width, height) => ipcRenderer.send(IPC.setSize, width, height),
  dragStart: () => ipcRenderer.send(IPC.dragStart),
  dragEnd: () => ipcRenderer.send(IPC.dragEnd),
  openSession: id => ipcRenderer.send(IPC.openSession, id),
  markRead: id => ipcRenderer.send(IPC.markRead, id),
  setSettings: patch => ipcRenderer.send(IPC.setSettings, patch),
  showMenu: () => ipcRenderer.send(IPC.showMenu),
  snooze: (id, minutes) => ipcRenderer.send(IPC.snooze, id, minutes),
  closeSwitcher: () => ipcRenderer.send(IPC.closeSwitcher),
  setTrayImage: dataUrl => ipcRenderer.send(IPC.trayImage, dataUrl),
}

contextBridge.exposeInMainWorld('pulse', api)
