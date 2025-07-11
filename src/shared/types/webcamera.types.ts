export type WebCameraAvatarTypes =
  | "circle-sm"
  | "circle-lg"
  | "circle-xl"
  | "rect-sm"
  | "rect-lg"
  | "rect-xl"

export interface ILastWebCameraSize {
  left: number
  top: number
  avatarType: WebCameraAvatarTypes
}

export interface IWebCameraWindowSettings {
  avatarType?: WebCameraAvatarTypes | null
  isDropdownOpen?: boolean
}
