import { contextBridge, ipcRenderer } from "electron"
import { openExternalLink } from "./helpers/open-external-link"
import { LoggerEvents } from "./events/logger.events"
let isIgnoreMouseEventsFreeze = false
// rename "electronAPI" ? to more suitable
export const electronAPI = {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) =>
      ipcRenderer.on(channel, (event, ...args) => func(event, ...args)),
  },
  openLinkInBrowser: (href) => {
    openExternalLink(href)
  },
  setIgnoreMouseEvents: (flag: boolean) => {
    if (!flag) {
      isIgnoreMouseEventsFreeze = true
      ipcRenderer.send("ignore-mouse-events:set", false)
    } else {
      isIgnoreMouseEventsFreeze = false
      ipcRenderer.send("ignore-mouse-events:set", true, { forward: true })
    }
  },
  startFullScreenRecording: () =>
    ipcRenderer.send("start-fullscreen-recording"),
  stopRecording: () => ipcRenderer.send("stop-recording"),
  onRecordingFinished: (callback) =>
    ipcRenderer.on("recording-finished", callback),
  onCanvasCreate: (callback) => ipcRenderer.on("create-canvas", callback),
  onCanvasDestroy: (callback) => ipcRenderer.on("destroy-canvas", callback),
  toggleRecordButtons: (isRecording) => {
    const startBtn = document.getElementById("startBtn") as HTMLButtonElement
    const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement

    startBtn.disabled = isRecording
    stopBtn.disabled = !isRecording
  },
  loggerSender: (title: string, body: string) => {
    ipcRenderer.send(LoggerEvents.SEND_LOG, { title, body })
  },
}

contextBridge.exposeInMainWorld("electronAPI", electronAPI)

window.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.querySelector(".page-backdrop")

  if (backdrop) {
    backdrop.addEventListener(
      "mouseenter",
      (event) => {
        ipcRenderer.send("ignore-mouse-events:set", true, { forward: true })
      },
      false
    )

    backdrop.addEventListener(
      "mouseleave",
      (event) => {
        ipcRenderer.send("ignore-mouse-events:set", false)
      },
      false
    )
  }

  document.body.addEventListener("mouseenter", (event) => {
    electronAPI.ipcRenderer.send("main-window-focus", null)
  })
})
