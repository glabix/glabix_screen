// Optional, initialize the logger for any renderer process
import log from "electron-log/main"
import { LogLevel, setLog } from "../helpers/set-log"

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
    setLog(LogLevel.ERROR, "Uncaught Exception:", error)
  })

  // Глобальный обработчик для перехвата необработанных отклонений промисов
  process.on("unhandledRejection", (reason, promise) => {
    setLog(
      LogLevel.ERROR,
      "Unhandled Rejection at:",
      promise,
      "reason:",
      reason
    )
  })
}
