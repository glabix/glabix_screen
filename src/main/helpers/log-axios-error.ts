import { stringify } from "./stringify"
import { LogSender } from "./log-sender"
import { LogLevel, setLog } from "./set-log"
import { httpErrorPareser } from "./http-error-pareser"

const logSender = new LogSender()

export function logAxiosError(error, toFile: boolean) {
  const parsedError = httpErrorPareser(error)
  if (toFile) {
    setLog(LogLevel.ERROR, "axiosError.unhandled", parsedError || error)
  } else {
    logSender.sendLog(
      "axiosError.unhandled",
      stringify(parsedError || error),
      true
    )
  }
}
