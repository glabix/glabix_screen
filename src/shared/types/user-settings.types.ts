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

  PANEL_VISIBILITY_GET = "settings:panel_visibility:get",
  PANEL_VISIBILITY_SET = "settings:panel_visibility:set",
}

export enum UserSettingsKeys {
  SHORT_CUTS = "shortcuts",
  FLIP_CAMERA = "flip_camera",
  PANEL_VISIBILITY = "panel_visibility",
}

// export interface IUserSettings {
//   [UserSettingsKeys.SHORT_CUTS]?: IUserSettingsShortcut[]
// }
