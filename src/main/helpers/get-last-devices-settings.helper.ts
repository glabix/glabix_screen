import { BrowserWindow } from "electron"
import { ILastDeviceSettings } from "@shared/types/types"

export function getLastDevices(
  win: BrowserWindow
): Promise<ILastDeviceSettings> {
  return new Promise((resolve, reject) => {
    win.webContents
      .executeJavaScript('localStorage.getItem("LAST_DEVICE_IDS");', true)
      .then((_settings) => {
        const settings = _settings || {}
        resolve(settings)
      })
      .catch((e) => {
        resolve({})
      })
  })
}
