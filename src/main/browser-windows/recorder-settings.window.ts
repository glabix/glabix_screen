import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Display,
  ipcMain,
  screen,
} from "electron"
import { is } from "@electron-toolkit/utils"
import path, { join } from "path"
import eStore from "@main/helpers/electron-store.helper"
import { windowManager, WindowNames } from "./window-manager"

let window: BrowserWindow | undefined = undefined
const WindowSources = {
  file: join(import.meta.dirname, "../renderer/recorder-settings.html"),
  url: `${process.env["ELECTRON_RENDERER_URL"]}/recorder-settings.html`,
}

export function handleRecorderSettingsEvents() {}

export function createRecorderSettingsWindow() {
  if (window) {
    window.destroy()
    window = undefined
  }

  const minWidth = 500
  const minHeight = 300

  let width = 800
  let height = 600

  const x = 50
  const y = 50
  const bounds: Electron.Rectangle = { x, y, width, height }
  const options: BrowserWindowConstructorOptions = {
    // titleBarStyle: "hidden",
    fullscreenable: false,
    maximizable: false,
    // resizable: false,
    minimizable: false,
    width: width,
    height: height,
    minWidth: minWidth,
    minHeight: minHeight,
    show: false,
    frame: true,
    roundedCorners: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  }

  window = new BrowserWindow(options)

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(WindowSources.url)
  } else {
    window.loadFile(WindowSources.file)
  }

  const settings = eStore.get("recorder-settings-test") || {}

  console.log("recorder-settings-test", settings)

  window.webContents.on("did-finish-load", () => {
    window?.setBounds(bounds)
    window?.show()
    window?.moveTop()

    windowManager
      .get(WindowNames.MAIN)
      ?.webContents.send("recorder-settings-window:get", settings)
    window?.webContents.send("recorder-settings-window:get", settings)
  })

  ipcMain.on("recorder-settings-window:set", (event, settings) => {
    eStore.set("recorder-settings-test", settings)
    windowManager
      .get(WindowNames.MAIN)
      ?.webContents.send("recorder-settings-window:get", settings)
  })

  ipcMain.on("recorder-settings-window:log", (event, data) => {
    if (!window) {
      return
    }

    window.webContents.send("recorder-settings-window:log", data)
  })
}
