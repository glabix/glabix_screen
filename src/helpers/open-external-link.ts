import { exec } from "child_process"
import os from "os"

export function openExternalLink(link: string): void {
  if (os.platform() == "darwin") {
    exec(`open "${link}"`)
  }
  if (os.platform() == "win32") {
    exec(`start ${link}`)
  }
}
