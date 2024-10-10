import { ElectronAPI } from "@electron-toolkit/preload"
import { api } from "./preload"

declare global {
  interface Window {
    electronAPI: ElectronAPI
    api: typeof api
  }
}
