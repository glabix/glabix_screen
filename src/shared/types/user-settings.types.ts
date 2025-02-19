export interface IUserSettingsShortcut {
  disabled: boolean
  name: string
  keyCodes: string
}

export enum UserSettingsEvents {
  SHORTCUTS_GET = "settings:shortcuts:get",
  SHORTCUTS_SET = "settings:shortcuts:set",
}

export enum UserSettingsKeys {
  SHORT_CUTS = "shortCuts",
}

export interface IUserSettings {
  [UserSettingsKeys.SHORT_CUTS]?: IUserSettingsShortcut[]
}
