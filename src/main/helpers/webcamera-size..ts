import {
  IWebCameraWindowSettings,
  WebCameraAvatarTypes,
} from "@shared/types/webcamera.types"
import { Display } from "electron"

const PANEL_HEIGHT_DEFAULT = 58
const PANEL_HEIGHT_SM = 44
const PANEL_DROPDOWN_HEIGHT = 40
const MIN_WIDTH = 260

export const getAvatarSize = (
  screenWidth: number,
  avatarType: WebCameraAvatarTypes | null
): { width: number; height: number } => {
  switch (avatarType) {
    case "circle-sm":
      return { width: 200, height: 200 }
    case "circle-lg":
      return { width: 360, height: 360 }
    case "circle-xl":
      return { width: 560, height: 560 }

    case "rect-sm":
      return { width: 300, height: Math.round((9 / 16) * 300) }
    case "rect-lg":
      return { width: 650, height: Math.round((9 / 16) * 650) }

    case "rect-xl":
      return {
        width: Math.round(0.8 * screenWidth),
        height: Math.round((9 / 16) * 0.8 * screenWidth),
      }

    default:
      return { width: 200, height: 200 }
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
    ? avatarSize.height + PANEL_HEIGHT_SM + PANEL_DROPDOWN_HEIGHT
    : avatarSize.height + PANEL_HEIGHT_SM
  return { width, height }
}
