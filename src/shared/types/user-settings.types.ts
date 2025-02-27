export interface IUserSettingsShortcut {
  disabled: boolean
  name: string
  keyCodes: string
  actionState: "app:run" | "app:visible"
}

export enum UserSettingsEvents {
  SHORTCUTS_GET = "settings:shortcuts:get",
  SHORTCUTS_SET = "settings:shortcuts:set",
  SHORTCUTS_UNREGISTER = "settings:shortcuts:unregister",

  FLIP_CAMERA_GET = "settings:flip_camera:get",
  FLIP_CAMERA_SET = "settings:flip_camera:set",
}

export enum UserSettingsKeys {
  SHORT_CUTS = "shortcuts",
  FLIP_CAMERA = "flip_camera",
}

export interface IUserSettings {
  [UserSettingsKeys.SHORT_CUTS]?: IUserSettingsShortcut[]
}
