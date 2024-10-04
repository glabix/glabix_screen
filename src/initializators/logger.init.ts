// Optional, initialize the logger for any renderer process
import log from "electron-log/main"
import { LogLevel } from "../helpers/set-log"
import { LogSender } from "../helpers/log-sender"
import { stringify } from "../helpers/stringify"

const logSender = LogSender

export const loggerInit = () => {
  log.initialize()
  log.transports.console.level = LogLevel.SILLY
  log.transports.file.level = LogLevel.SILLY
  log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB
  log.transports.file.archiveLogFn = (fileName) =>
    `${fileName}-${new Date().toISOString().split("T")[0]}.gz`
  log.transports.console.format = "[{h}:{i}:{s}.{ms}] [{level}] {text}"

  // Глобальный обработчик для перехвата необработанных исключений
  process.on("uncaughtException", (error) => {
    const e = `Uncaught Exception: ${error}`
    logSender.sendLog("errors.global", stringify({ e }), true)
  })

  // Глобальный обработчик для перехвата необработанных отклонений промисов
  process.on("unhandledRejection", (reason, promise) => {
    const e = `Unhandled Rejection at:, ${promise} reason: ${reason}`
    logSender.sendLog("errors.global", stringify({ e }), true)
  })
}
