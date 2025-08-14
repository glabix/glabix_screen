import { WindowNames } from "@main/helpers/window-manager"
import { BrowserWindow } from "electron"

// export enum WindowNames {
//   LOGIN = "main",
//   MAIN = "main",
//   MODAL = "modal",
//   WEB_CAMERA = "web_camera",
//   DROPDOWN = "dropdown",
//   SCREENSHOT = "screenshot",
// }

export interface IWindow {
  window: BrowserWindow | undefined
  name: WindowNames
  isDragging?: boolean
}

export class WindowsHelper {
  private all: IWindow[] = []

  setAll(windows: IWindow[]) {
    this.all = windows
  }

  add(window: IWindow) {
    this.all = [...this.all, window]
  }

  setDragging(name: WindowNames | null) {
    this.all = this.all.map((w) => ({ ...w, isDragging: w.name == name }))
  }

  isDragging(name: WindowNames): boolean {
    return this.all.some((w) => w.isDragging && w.name == name)
  }

  getDragging(): IWindow | undefined {
    return this.all.find((w) => w.isDragging)
  }

  remove(name: WindowNames) {
    this.all = this.all.filter((w) => w.name != name)
  }

  getAll(): IWindow[] {
    return this.all
  }
}
