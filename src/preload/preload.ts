import { contextBridge, ipcRenderer } from "electron"
import { electronAPI } from "@electron-toolkit/preload"

// Custom APIs for renderer
export const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electronAPI", electronAPI)
    contextBridge.exposeInMainWorld("api", api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

window.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.querySelector(".page-backdrop")

  if (backdrop) {
    backdrop.addEventListener(
      "mouseenter",
      (event) => {
        ipcRenderer.send("ignore-mouse-events:set", true, {
          forward: true,
        })
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
    ipcRenderer.send("main-window-focus", null)
  })
})
