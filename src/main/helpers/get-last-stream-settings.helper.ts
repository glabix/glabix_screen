import { BrowserWindow } from "electron"
import { ILastDeviceSettings, IStreamSettings } from "@shared/types/types"

const DEFAULT_STREAM_SETTINGS: IStreamSettings = {
  action: "fullScreenVideo",
}

export function getLastStreamSettings(
  win: BrowserWindow
): Promise<IStreamSettings> {
  return new Promise((resolve, reject) => {
    win.webContents
      .executeJavaScript('localStorage.getItem("LAST_DEVICE_IDS");', true)
      .then((result: string | null) => {
        let settings: IStreamSettings = { ...DEFAULT_STREAM_SETTINGS }

        if (result) {
          const deviceSettings: ILastDeviceSettings = JSON.parse(result)
          const systemAudio =
            deviceSettings.systemAudio === undefined
              ? true
              : deviceSettings.systemAudio
          settings = {
            ...settings,
            audio: systemAudio,
            audioDeviceId: deviceSettings.audioId,
            cameraDeviceId: deviceSettings.videoId,
          }
        }

        resolve(settings)
      })
      .catch((e) => {
        resolve(DEFAULT_STREAM_SETTINGS)
      })
  })
}
