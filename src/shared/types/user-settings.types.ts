export interface IUserSettingsShortcut {
  disabled: boolean
  name: string
  keyCodes: string
  actionState: "app:run" | "app:visible"
}

export enum UserSettingsEvents {
  SHORTCUTS_GET = "settings:shortcuts:get",
  SHORTCUTS_SET = "settings:shortcuts:set",
}

export enum UserSettingsKeys {
  SHORT_CUTS = "shortcuts",
}

export interface IUserSettings {
  [UserSettingsKeys.SHORT_CUTS]?: IUserSettingsShortcut[]
}
