import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Display,
  screen,
} from "electron"
import path, { join } from "path"
import { windowManager, WindowNames } from "./window-manager"

let window: BrowserWindow | undefined = undefined

export function createPaintingBoardWindow(display: Display) {
  window = windowManager.get(WindowNames.PAINTING_BOARD)

  // if (window?.isDestroyed()) {
  //   windowManager.delete(WindowNames.PAINTING_BOARD)
  //   window = undefined
  // }

  if (window) {
    // window.show()
    // window.moveTop()
    // return
    windowManager.delete(WindowNames.PAINTING_BOARD)
    window = undefined
  }

  const screenBounds = display.bounds
  const minWidth = 750
  const minHeight = 400
  const maxWidth = 0.9 * screenBounds.width
  const maxHeight = 0.9 * screenBounds.height

  let width = maxWidth
  let height = maxHeight

  const x = screenBounds.x + (screenBounds.width - width) / 2
  const y = screenBounds.y + (screenBounds.height - height) / 2
  const bounds: Electron.Rectangle = { x, y, width, height }
  const options: BrowserWindowConstructorOptions = {
    titleBarStyle: "hidden",
    fullscreenable: false,
    maximizable: false,
    // resizable: false,
    minimizable: false,
    width: width,
    height: height,
    minWidth: minWidth,
    minHeight: minHeight,
    show: false,
    // frame: false,
    roundedCorners: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  }

  window = windowManager.create(WindowNames.PAINTING_BOARD, options)

  window.webContents.on("did-finish-load", () => {
    window?.setBounds(bounds)
    window?.show()
    window?.moveTop()
  })
}
