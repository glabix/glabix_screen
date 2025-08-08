import {
  ILastWebCameraSize,
  IWebCameraWindowSettings,
  WebCameraAvatarTypes,
} from "@shared/types/webcamera.types"
import { BrowserWindow, Display, Rectangle } from "electron"
import eStore from "./electron-store.helper"
import { UserSettingsKeys } from "@shared/types/user-settings.types"

const PANEL_HEIGHT_DEFAULT = 58
// const PANEL_HEIGHT_SM = 44
const PANEL_HEIGHT_SM = 58
const PANEL_DROPDOWN_HEIGHT = 40
const MIN_WIDTH = 260

export const getAvatarSize = (
  screenWidth: number,
  avatarType: WebCameraAvatarTypes | null
): { width: number; height: number } => {
  switch (avatarType) {
    case "circle-sm":
      return { width: 200, height: 200 + PANEL_HEIGHT_SM }
    case "circle-lg":
      return { width: 360, height: 360 + PANEL_HEIGHT_SM }
    case "circle-xl":
      return { width: 560, height: 560 + PANEL_HEIGHT_SM }

    case "rect-sm":
      return {
        width: 300,
        height: Math.round((9 / 16) * 300) + PANEL_HEIGHT_SM,
      }
    case "rect-lg":
      return {
        width: 650,
        height: Math.round((9 / 16) * 650) + PANEL_HEIGHT_SM,
      }

    case "rect-xl":
      return {
        width: Math.round(0.8 * screenWidth),
        height: Math.round((9 / 16) * 0.8 * screenWidth) + PANEL_HEIGHT_SM,
      }

    case "camera-only-sm":
      return {
        width: 410,
        height: Math.round((9 / 16) * 410) + 48 + PANEL_HEIGHT_SM,
      }
    case "camera-only-lg":
      return {
        width: 820,
        height: Math.round((9 / 16) * 820) + 48 + PANEL_HEIGHT_SM,
      }
    case "camera-only-xl":
      return {
        width: Math.round(0.8 * screenWidth),
        height: Math.round((9 / 16) * 0.8 * screenWidth) + 48 + PANEL_HEIGHT_SM,
      }

    default:
      return { width: MIN_WIDTH, height: PANEL_HEIGHT_DEFAULT + 30 }
  }
}

export const getWebCameraWindowSize = (
  display: Display,
  settings: IWebCameraWindowSettings
): { width: number; height: number } => {
  const avatarSize = getAvatarSize(
    display.bounds.width,
    settings.avatarType || null
  )
  let width = avatarSize.width < MIN_WIDTH ? MIN_WIDTH : avatarSize.width
  let height = settings.isDropdownOpen
    ? avatarSize.height + PANEL_DROPDOWN_HEIGHT
    : avatarSize.height
  return { width, height }
}

export const getWebCameraWindowPosition = (
  display: Display,
  settings: IWebCameraWindowSettings,
  prevBounds: Rectangle
): { x: number; y: number } => {
  const nextSize = getWebCameraWindowSize(display, settings)
  const y = ["rect-xl", "camera-only-xl"].includes(settings.avatarType!)
    ? display.bounds.height / 2 - nextSize.height / 2
    : prevBounds.y + prevBounds.height - nextSize.height
  const x = ["rect-xl", "camera-only-xl"].includes(settings.avatarType!)
    ? display.bounds.width / 2 - nextSize.width / 2
    : prevBounds.x + prevBounds.width / 2 - nextSize.width / 2
  return { x, y }
}

export const getLastWebcameraPosition = (
  win: BrowserWindow
): Promise<ILastWebCameraSize> => {
  return new Promise((resolve, reject) => {
    let settings: ILastWebCameraSize = {
      left: 50,
      top: 130,
      avatarType: "circle-sm",
    }
    const storeSettings = eStore.get(
      UserSettingsKeys.WEB_CAMERA_SIZE
    ) as ILastWebCameraSize

    if (storeSettings) {
      return resolve(storeSettings)
    } else {
      win.webContents
        .executeJavaScript('localStorage.getItem("LAST_PANEL_SETTINGS");', true)
        .then((result: string | null) => {
          if (result) {
            settings = JSON.parse(result)
            eStore.set(UserSettingsKeys.WEB_CAMERA_SIZE, settings)
          }
          return resolve(settings)
        })
        .catch((e) => {
          return resolve(settings)
        })
    }
  })
}
