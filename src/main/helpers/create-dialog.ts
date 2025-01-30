import { BrowserWindow, screen, app, ipcMain } from "electron"
import { is } from "@electron-toolkit/utils"
import path, { join } from "path"
import {
  DialogWindowEvents,
  IDialogWindowCallbackData,
  IDialogWindowParams,
} from "@shared/types/types"

export let dialogWindow: BrowserWindow | null = null

export function createDefaultDialogWindowParams(
  params: IDialogWindowParams
): IDialogWindowParams {
  let defaultParams: IDialogWindowParams = { ...params }
  const cursor = screen.getCursorScreenPoint()
  const currentScreen =
    params.activeDisplay || screen.getDisplayNearestPoint(cursor)

  defaultParams = {
    ...params,
    activeDisplay: currentScreen,
    width: params.width || 400,
    height: params.height || 200,
  }

  return defaultParams
}

export function destroyDialogWindow(callback?: () => void): void {
  if (dialogWindow) {
    dialogWindow.destroy()
    dialogWindow = null

    if (callback) {
      callback()
    }
  }
}

export function createDialogWindow(_params: IDialogWindowParams): void {
  if (dialogWindow) {
    destroyDialogWindow()
  }

  const params = createDefaultDialogWindowParams(_params)
  const screenBounds = params.activeDisplay!.bounds
  const x = Math.round(
    screenBounds.x + (screenBounds.width - params.width!) / 2
  )
  const y = Math.round(
    screenBounds.y + (screenBounds.height - params.height!) / 2
  )
  const bounds: Electron.Rectangle = {
    x,
    y,
    width: params.width!,
    height: params.height!,
  }

  dialogWindow = new BrowserWindow({
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    minimizable: false,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    x: bounds.x,
    y: bounds.y,
    show: false,
    modal: true,
    alwaysOnTop: true,
    roundedCorners: true,
    parent: params.parentWindow || undefined,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  })

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    dialogWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/dialog.html`)
  } else {
    dialogWindow.loadFile(join(import.meta.dirname, "../renderer/dialog.html"))
  }

  dialogWindow.webContents.on("did-finish-load", () => {
    dialogWindow!.webContents.send(DialogWindowEvents.RENDER, params.data)
    dialogWindow!.setBounds(bounds)
    dialogWindow!.setAlwaysOnTop(true, "screen-saver", 999999)
    dialogWindow!.show()
  })

  dialogWindow.on("close", () => {
    const data: IDialogWindowCallbackData = { action: "cancel" }
    ipcMain.emit(DialogWindowEvents.CALLBACK, null, data)
  })
}
