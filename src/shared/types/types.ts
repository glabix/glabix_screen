export type ScreenAction =
  | "fullScreenVideo"
  | "cropVideo"
  | "cameraOnly"
  | "fullScreenshot"
  | "cropScreenshot"
export type RecorderState = "recording" | "paused" | "stopped"
export type MediaDeviceType = "camera" | "microphone" | "screen"
export interface StreamSettings {
  action: ScreenAction
  audioDeviceId?: string
  cameraDeviceId?: string
  video?: boolean
  audio?: boolean
  screenshot?: {
    x: null | number
    y: null | number
    width: null | number
    height: null | number
  }
}

export enum ModalWindowHeight {
  WIN = 480,
  MAC = 395,
  PROFILE = 500,
}

export interface IAppState {
  user?: IUser
  organization?: IOrganization
}

export interface IUser {
  id: number
}

export interface IOrganization {
  id: number
  name: string
}

export interface IJWTToken {
  expires_at: string
  access_token: string
  refresh_token: string
}

export interface IAuthData {
  token: IJWTToken
  organization_id: number
  user_id?: number
  entity_id?: number
}

export enum SimpleStoreEvents {
  UPDATE = "simple-store:update",
  CHANGED = "simple-store:changed",
}

export interface ISimpleStoreData {
  key: string
  value: any
}

export interface IMediaDevicesAccess {
  camera: boolean
  microphone: boolean
  screen: boolean
}

export interface IDropdownPageData {
  action: ScreenAction
  offsetY: number
  list: IDropdownList
}
export interface IDropdownPageSelectData {
  action?: ScreenAction
  audioDeviceId?: string
  cameraDeviceId?: string
  item: IDropdownItem
}
export type DropdownListType = "videoDevices" | "audioDevices" | "screenActions"
export interface IDropdownItem {
  id: string
  label: string
  isSelected: boolean
  extraData?: any
}
export interface IDropdownList {
  type: DropdownListType
  items: IDropdownItem[]
}

export interface IScreenActionItem {
  action: ScreenAction
  label: string
}

export interface IOrganizationLimits {
  win_version: string
  mac_version: string
  upload_allowed: boolean
  max_upload_duration: number
  allow_screenshots: boolean
}

export interface IScreenshotImageData {
  scale: number
  width: number
  height: number
  url: string
}

export interface ICropVideoData {
  out_w: number
  out_h: number
  x: number
  y: number
}

export interface IAccountData {
  id: number
  name: string
  initials: string
  avatar_url: string | null
  organizations: IOrganization[]
}

export interface IAvatarData {
  id: number
  name: string
  initials: string
  avatar_url: string | null
  bg_color_number: number
  currentOrganization: IOrganization
  organizations: IOrganization[]
}
