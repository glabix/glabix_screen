export interface IUserSettingsShortcut {
  disabled: boolean
  name: string
  keyCodes: string
  actionState: "app:run" | "app:visible"
}

export enum UserSettingsThemes {
  SYSTEM = "system",
  LIGHT = "light",
  DARK = "dark",
}

export enum UserSettingsEvents {
  SHORTCUTS_GET = "settings:shortcuts:get",
  SHORTCUTS_SET = "settings:shortcuts:set",
  SHORTCUTS_UNREGISTER = "settings:shortcuts:unregister",

  FLIP_CAMERA_GET = "settings:flip_camera:get",
  FLIP_CAMERA_SET = "settings:flip_camera:set",

  PANEL_VISIBILITY_GET = "settings:panel_visibility:get",
  PANEL_VISIBILITY_SET = "settings:panel_visibility:set",

  PANEL_HIDDEN_GET = "settings:panel_hidden:get",
  PANEL_HIDDEN_SET = "settings:panel_hidden:set",

  AUTO_LAUNCH_GET = "settings:auto_launch:get",
  AUTO_LAUNCH_SET = "settings:auto_launch:set",

  COUNTDOWN_GET = "settings:countdown:get",
  COUNTDOWN_SET = "settings:countdown:set",

  THEME_GET = "settings:theme:get",
  THEME_SET = "settings:theme:set",

  DRAW_SETTING_GET = "settings:draw:settings:get",
  DRAW_SETTING_SET = "settings:draw:settings:set",

  WEB_CAMERA_SIZE_GET = "settings:web_camera_size:get",
  WEB_CAMERA_SIZE_SET = "settings:web_camera_size:set",
}

export enum UserSettingsKeys {
  SHORT_CUTS = "shortcuts",
  FLIP_CAMERA = "flip_camera",
  PANEL_VISIBILITY = "panel_visibility",
  PANEL_HIDDEN = "panel_hidden",
  AUTO_LAUNCH = "auto_launch",
  COUNTDOWN = "countdown",
  THEME = "theme",
  DRAW_SETTINGS = "draw_settings",
  WEB_CAMERA_SIZE = "web_camera_size",
}

// export interface IUserSettings {
//   [UserSettingsKeys.SHORT_CUTS]?: IUserSettingsShortcut[]
// }
