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

  AUTO_LAUNCH_GET = "settings:auto_launch:get",
  AUTO_LAUNCH_SET = "settings:auto_launch:set",
}

export enum UserSettingsKeys {
  SHORT_CUTS = "shortcuts",
  FLIP_CAMERA = "flip_camera",
  PANEL_VISIBILITY = "panel_visibility",
  AUTO_LAUNCH = "auto_launch",
}

// export interface IUserSettings {
//   [UserSettingsKeys.SHORT_CUTS]?: IUserSettingsShortcut[]
// }
