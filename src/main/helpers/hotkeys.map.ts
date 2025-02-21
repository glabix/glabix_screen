import { HotkeysEvents } from "@shared/types/types"
import { IUserSettingsShortcut } from "@shared/types/user-settings.types"
import os from "os"

export const DEFAULT_SHORTCUTS: IUserSettingsShortcut[] = [
  {
    name: HotkeysEvents.FULL_SCREENSHOT,
    keyCodes: os.platform() == "darwin" ? "Option+Shift+6" : "Alt+Shift+6",
    disabled: false,
    actionState: "app:run",
  },
  {
    name: HotkeysEvents.CROP_SCREENSHOT,
    keyCodes: os.platform() == "darwin" ? "Cmd+Shift+5" : "Ctrl+Shift+5",
    disabled: false,
    actionState: "app:run",
  },
  {
    name: HotkeysEvents.STOP_RECORDING,
    keyCodes: os.platform() == "darwin" ? "Cmd+Shift+L" : "Ctrl+Shift+L",
    disabled: false,
    actionState: "app:visible",
  },
  {
    name: HotkeysEvents.PAUSE_RECORDING,
    keyCodes: os.platform() == "darwin" ? "Option+Shift+P" : "Alt+Shift+P",
    disabled: false,
    actionState: "app:visible",
  },
  {
    name: HotkeysEvents.RESTART_RECORDING,
    keyCodes: os.platform() == "darwin" ? "Cmd+Shift+R" : "Ctrl+Shift+R",
    disabled: false,
    actionState: "app:visible",
  },
  {
    name: HotkeysEvents.DELETE_RECORDING,
    keyCodes: os.platform() == "darwin" ? "Option+Shift+C" : "Alt+Shift+C",
    disabled: false,
    actionState: "app:visible",
  },
  {
    name: HotkeysEvents.DRAW,
    keyCodes: os.platform() == "darwin" ? "Cmd+Shift+D" : "Ctrl+Shift+D",
    disabled: false,
    actionState: "app:visible",
  },
]

export const getUserShortcutsSettings = (
  shortсuts: IUserSettingsShortcut[] | unknown
): IUserSettingsShortcut[] => {
  let userShortcuts: IUserSettingsShortcut[] = [...DEFAULT_SHORTCUTS]

  if (typeof shortсuts == "undefined") {
    return userShortcuts
  }

  if (Array.isArray(shortсuts)) {
    userShortcuts = userShortcuts.map((s) => {
      const userSettings = shortсuts.find((sc) => sc.name == s.name)
      return userSettings || s
    })
  }

  return userShortcuts
}
