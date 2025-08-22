import { BrowserWindow } from "electron"
import { ChunkStatusV3 } from "@main/v3/events/record-v3-types"

export type ScreenAction =
  | "fullScreenVideo"
  | "cropVideo"
  | "cameraOnly"
  | "fullScreenshot"
  | "cropScreenshot"
export type RecorderState = "recording" | "paused" | "stopped" | "countdown"
export type MediaDeviceType = "camera" | "microphone" | "screen"
export interface IStreamSettings {
  action: ScreenAction
  audioDeviceId?: string
  cameraDeviceId?: string
  audio?: boolean
}

export enum ModalWindowWidth {
  MODAL = 300,
  SETTINGS = 300,
  // SETTINGS = 390,
}
export enum ModalWindowHeight {
  // MODAL_WIN = 535,
  // MODAL_MAC = 460,
  MODAL = 470,
  SCREENSHOT_TAB = 405,
  PROFILE = 500,
  SETTINGS = 500,
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

export enum DisplayEvents {
  UPDATE = "update",
}
export enum ScreenshotActionEvents {
  FULL = "full",
  CROP = "crop",
}
export enum ScreenshotWindowEvents {
  CREATE = "screenshot-window:create",
  RENDER_IMAGE = "screenshot-window:renderImage",
  COPY_IMAGE = "screenshot-window:copyImage",
}
export enum ModalWindowEvents {
  OPEN = "modal-window:open",
  SHOW = "modal-window:show",
  HIDE = "modal-window:hide",
  RESIZE = "modal-window:resize",
  RENDER = "modal-window:render",
  TAB = "modal-window:tab",
  UPLOAD_PROGRESS_SHOW = "modal-window:upload_progress:show",
  UPLOAD_PROGRESS_HIDE = "modal-window:upload_progress:hide",
}

export enum PaintingBoardWindowEvents {
  OPEN = "open",
}

export enum CameraSettings {
  NO_CAMERA = "camera-settings:noCamera",
  FIRST_CAMERA = "camera-settings:firstCamera",
}

export enum DropdownWindowEvents {
  SHOW = "dropdown-window:show",
  HIDE = "dropdown-window:hide",
  ON_HIDE = "dropdown-window:onHide",
  SELECT = "dropdown-window:select",
}

export enum WebCameraWindowEvents {
  RESIZE = "web-camera-window:resize",
  AVATAR_UPDATE = "web-camera-window:avatar-update",
}

export enum DrawEvents {
  DRAW_START = "draw:start",
  SETTINGS_CHANGE = "draw:settings:change",
  DRAW_END = "draw:end",
}

export interface IDrawSettings {
  color: string
  width: number
}

export interface IDrawLaserDelaySettings {
  disabled: boolean
  delay: number
}

export enum MainWindowEvents {
  IGNORE_MOUSE_START = "main-window:ignore-mouse:start",
  IGNORE_MOUSE_END = "main-window:ignore-mouse:end",

  SHOW = "main-window:show",
  HIDE = "main-window:hide",
}

export interface IModalWindowTabData {
  activeTab: "video" | "screenshot"
}

export enum DialogWindowEvents {
  CREATE = "dialog:create",
  CALLBACK = "dialog:callback",
  RENDER = "dialog:render",
}

export interface IDialogWindowCallbackData {
  action: "ok" | "cancel"
  data?: any
}

export interface IDialogWindowButton {
  type: "default" | "primary" | "danger"
  action: "ok" | "cancel"
  text: string
}
export interface IDialogWindowData {
  title: string
  text?: string
  buttons: IDialogWindowButton[]
  data?: any
}

export interface IDialogWindowParams {
  parentWindow?: BrowserWindow | null
  activeDisplay?: Electron.Display
  width?: number
  height?: number
  data: IDialogWindowData
}

export enum HotkeysEvents {
  // Recorder Panel
  START_RECORDING = "hotkeys:recording:start",
  STOP_RECORDING = "hotkeys:recording:stop",
  PAUSE_RECORDING = "hotkeys:recording:pause",
  RESUME_RECORDING = "hotkeys:recording:resume",
  RESTART_RECORDING = "hotkeys:recording:restart",
  DELETE_RECORDING = "hotkeys:recording:delete",
  DRAW = "hotkeys:draw",

  // Screenshots
  FULL_SCREENSHOT = "hotkeys:screenshot:full",
  CROP_SCREENSHOT = "hotkeys:screenshot:crop",

  // Painting Board
  OPEN_PAINTING_BOARD = "hotkeys:painting-board:open",

  // Pause/Resume hotkeys
  GLOBAL_PAUSE = "hotkeys:global:pause",
  GLOBAL_RESUME = "hotkeys:global:resume",
}

export enum SelectWindowEvent {
  RENDER = "select-window:render",
  CREATE = "select-window:create",
  DESTROY = "select-window:destroy",
}

export interface ISelectWindowItem {
  label: string
  value: string
  isSelected: boolean
  data?: any
}

export interface ISelectWindowData {
  renderer: {
    items: ISelectWindowItem[]
  }
  window: {
    width: number
    height: number
    offsetX: number
    offsetY: number
  }
}

export enum IRecordProgressStatus {
  PENDING = "pending",
  LOADING = "loading",
  COMPLETE = "complete",
}

export interface IRecordUploadProgressData {
  status: IRecordProgressStatus
  uuid: string
  progress: number // %
}

export interface ILastDeviceSettings {
  videoId?: string
  audioId?: string
  systemAudio?: boolean
}

export interface IRecorderSavedChunk {
  innerRecordUuid: string // uuid записи экрана
  uuid: string // uuid чанка
  createdAt: number
  videoSource: string
  audioSource: string | null
  size: number
  isLast: boolean
  index: number
}

export interface IRecorderLastChunkHandled {
  innerRecordUuid: string // uuid записи экрана
  index: number
}

export interface IHandleChunkDataEvent {
  data: ArrayBuffer
  recordUuid: string
  timestamp: number
  isLast: boolean
  size: number
  index: number
}
