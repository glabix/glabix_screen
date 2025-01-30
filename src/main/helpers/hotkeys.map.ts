import os from "os"

export const GLOBAL_SHORTCUTS_MAP = {
  "cmd+shift+l": "CommandOrControl+Shift+L",
  "cmd+shift+r": "CommandOrControl+Shift+R",
  "cmd+shift+d": "CommandOrControl+Shift+D",
  "option+shift+p":
    os.platform() == "darwin" ? "Option+Shift+P" : "Alt+Shift+P",
  "option+shift+c":
    os.platform() == "darwin" ? "Option+Shift+C" : "Alt+Shift+C",
}
