import { app } from "electron"
export default class AutoLaunch {
  static setup(flag: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: flag,
      path: app.getPath("exe"),
      args: ["--hidden"],
    })
  }
}
