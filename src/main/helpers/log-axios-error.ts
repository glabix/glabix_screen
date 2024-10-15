import { stringify } from "./stringify"
import { LogSender } from "./log-sender"
import { LogLevel, setLog } from "./set-log"

const logSender = new LogSender()

export function logAxiosError(error, toFile: boolean) {
  let errorMessage = `Axios Error: ${error.message}`

  if (error.response) {
    // Сервер вернул ответ с ошибкой
    errorMessage += `\nStatus: ${error.response.status}`
    errorMessage += `\nHeaders: ${stringify(error.response.headers)}`
    errorMessage += `\nData: ${stringify(error.response.data)}`
  } else if (error.request) {
    // Запрос был сделан, но ответа не получено
    errorMessage += `\nRequest: ${stringify(error.request)}`
  } else {
    // Ошибка при настройке запроса
    errorMessage += `\nError: ${error.message}`
  }
  errorMessage += `\nConfig: ${stringify(error.config)}`

  // Логируем все в одно сообщение
  if (toFile) {
    setLog(LogLevel.ERROR, error)
  } else {
    logSender.sendLog("errors.global", stringify(error), true)
  }
}
