import { is } from "@electron-toolkit/utils"
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron"
import path, { join } from "path"

export enum WindowNames {
  MAIN = "main",
  MODAL = "modal",
  WEB_CAMERA = "web_camera",
  SCREENSHOT = "screenshot",
  LOGIN = "login",
  DROPDOWN = "dropdown",
  PAINTING_BOARD = "painting_board",
}

const WindowRendererSources = {
  [WindowNames.LOGIN]: {
    file: join(import.meta.dirname, "../renderer/login.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}/login.html`,
  },
  [WindowNames.MAIN]: {
    file: join(import.meta.dirname, "../renderer/index.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}`,
  },
  [WindowNames.MODAL]: {
    file: join(import.meta.dirname, "../renderer/modal.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}/modal.html`,
  },
  [WindowNames.WEB_CAMERA]: {
    file: join(import.meta.dirname, "../renderer/webcamera.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}/webcamera.html`,
  },
  [WindowNames.DROPDOWN]: {
    file: join(import.meta.dirname, "../renderer/dropdown.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}/dropdown.html`,
  },
  [WindowNames.SCREENSHOT]: {
    file: join(import.meta.dirname, "../renderer/screenshot.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}/screenshot.html`,
  },
  [WindowNames.PAINTING_BOARD]: {
    file: join(import.meta.dirname, "../renderer/painting-board.html"),
    url: `${process.env["ELECTRON_RENDERER_URL"]}/painting-board.html`,
  },
}

class WindowManager {
  private windows = new Map<WindowNames, BrowserWindow>()

  create(
    name: WindowNames,
    options: BrowserWindowConstructorOptions
  ): BrowserWindow {
    if (this.windows.has(name)) {
      const win = this.windows.get(name)!
      if (win.isDestroyed()) {
        this.windows.delete(name)
      } else {
        return win
      }
    }

    const win = new BrowserWindow(options)

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      win.loadURL(WindowRendererSources[name].url)
    } else {
      win.loadFile(WindowRendererSources[name].file)
    }

    this.windows.set(name, win)
    return win
  }

  get(name: WindowNames): BrowserWindow | undefined {
    return this.windows.get(name)
  }

  getAll(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter((w) => !w.isDestroyed())
  }

  delete(name: WindowNames): void {
    const win = this.windows.get(name)
    if (win) {
      win.destroy()
      this.windows.delete(name)
    }
  }

  sendAll(event: string, ...args: any[]): void {
    this.windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(event, ...args)
      }
    })
  }

  send(name: WindowNames, event: string, ...args: any[]): void {
    const win = this.windows.get(name)
    if (win && !win.isDestroyed()) {
      win.webContents.send(event, ...args)
    }
  }
}

export const windowManager = new WindowManager()
