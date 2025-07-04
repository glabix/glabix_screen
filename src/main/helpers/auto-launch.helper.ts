import { app } from "electron"
import AutoLaunch from "auto-launch"
// const { AutoLaunch } = pkg
// import.meta.env.VITE_APP_ID

// const AutoLaunch = require('auto-launch');
// const trayWindow = require('electron-tray-window');
// console.log('pkg', pkg)
// Настройка автозапуска
export const autoLaunch = new AutoLaunch({
  name: import.meta.env.VITE_PRODUCT_NAME,
  path: app.getPath("exe"),
  isHidden: true,
})

// export default class AutoLaunchToggle {
//   static setup(flag: boolean): void {
//     if (flag) {
//       autoLauncher.
//     }
//     app.setLoginItemSettings({
//       openAtLogin: flag,
//       path: app.getPath("exe"),
//       // args: ["--auto-launch"],
//     })
//   }
// }
