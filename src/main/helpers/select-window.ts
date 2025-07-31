import { ISelectWindowData, SelectWindowEvent } from "@shared/types/types"
import { app, BrowserWindow } from "electron"
import { join } from "path"

let selectWindow: BrowserWindow | undefined = undefined

export const createSelectWindow = (
  data: ISelectWindowData,
  parentWindow: BrowserWindow
) => {
  destroySelectWindow()
  const parentBounds = parentWindow.getBounds()

  selectWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    fullscreen: false,
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    width: data.window.width,
    height: data.window.height,
    autoHideMenuBar: true,
    show: false,
    hasShadow: false,
    alwaysOnTop: true,
    parent: parentWindow,
    minimizable: false,
    movable: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  })

  selectWindow.setAlwaysOnTop(true, "screen-saver", 999999)
  selectWindow.setBounds({
    x: parentBounds.x - data.window.offsetX,
    y: parentBounds.y + data.window.offsetY,
    width: data.window.width,
    height: data.window.height,
  })

  selectWindow.webContents.on("did-finish-load", () => {
    selectWindow?.webContents.send(SelectWindowEvent.RENDER, data)
    selectWindow?.show()
  })

  parentWindow.on("hide", () => {
    destroySelectWindow()
  })
}

export const destroySelectWindow = () => {
  if (selectWindow) {
    selectWindow.destroy()
    selectWindow = undefined
  }
}
