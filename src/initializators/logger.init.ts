// Optional, initialize the logger for any renderer process
import log from "electron-log/main"
import { LogLevel, setLog } from "../helpers/set-log"
import { ipcMain } from "electron"
import { FileUploadEvents } from "../events/file-upload.events"

export const loggerInit = () => {
  log.initialize()
  log.transports.console.level = LogLevel.SILLY
  log.transports.file.level = LogLevel.WARNING
  log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB
  log.transports.file.archiveLogFn = (fileName) =>
    `${fileName}-${new Date().toISOString().split("T")[0]}.gz`
  log.transports.console.format = "[{h}:{i}:{s}.{ms}] [{level}] {text}"

  // Глобальный обработчик для перехвата необработанных исключений
  process.on("uncaughtException", (error) => {
    const e = `Uncaught Exception: ${error}`
    ipcMain.emit("errors.global", JSON.stringify({ e }), true)
  })

  // Глобальный обработчик для перехвата необработанных отклонений промисов
  process.on("unhandledRejection", (reason, promise) => {
    const e = `Unhandled Rejection at:, ${promise} reason: ${reason}`
    ipcMain.emit("errors.global", JSON.stringify({ e: e }), true)
  })
}
