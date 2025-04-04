import { app } from "electron"
export default class AutoLaunch {
  static setup(flag: boolean | undefined): void {
    app.setLoginItemSettings({
      openAtLogin: typeof flag == "undefined" ? true : flag,
      path: app.getPath("exe"),
    })
  }
}
