import { HotkeysEvents } from "@shared/types/types"
import { IUserSettingsShortcut } from "@shared/types/user-settings.types"
import os from "os"

export const GLOBAL_SHORTCUTS_MAP = {
  "cmd+shift+5": "CommandOrControl+Shift+5",
  "cmd+shift+l": "CommandOrControl+Shift+L",
  "cmd+shift+r": "CommandOrControl+Shift+R",
  "cmd+shift+d": "CommandOrControl+Shift+D",
  "option+shift+6":
    os.platform() == "darwin" ? "Option+Shift+6" : "Alt+Shift+6",
  "option+shift+p":
    os.platform() == "darwin" ? "Option+Shift+P" : "Alt+Shift+P",
  "option+shift+c":
    os.platform() == "darwin" ? "Option+Shift+C" : "Alt+Shift+C",
}

export const DEFAULT_SHORTCUTS: IUserSettingsShortcut[] = [
  {
    name: HotkeysEvents.DRAW,
    keyCodes: os.platform() == "darwin" ? "Cmd+Shift+D" : "Ctrl+Shift+D",
    disabled: false,
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

  console.log("userShortcuts", userShortcuts)
  return userShortcuts
}
