import log from "electron-log/main.js"

export enum LogLevel {
  SILLY = "silly",
  DEBUG = "debug",
  INFO = "info",
  WARNING = "warn",
  ERROR = "error",
}

const importantLogs = [LogLevel.WARNING, LogLevel.ERROR]

export function setLog(level: LogLevel, ...args) {
  const getErrorLogType = (level: LogLevel) => {
    switch (level) {
      case LogLevel.SILLY:
        return log.silly
      case LogLevel.DEBUG:
        return log.debug
      case LogLevel.INFO:
        return log.info
      case LogLevel.WARNING:
        return log.warn
      case LogLevel.ERROR:
        return log.error
    }
  }
  const toFile = importantLogs.includes(level)
  const logFunc = getErrorLogType(level)
  logFunc(...args)

  // consoleLogFunc(e)
}
