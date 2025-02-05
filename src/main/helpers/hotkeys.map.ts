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
