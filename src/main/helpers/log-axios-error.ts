import { stringify } from "./stringify"
import { LogSender } from "./log-sender"

const logSender = new LogSender()

export function logAxiosError(error) {
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
  logSender.sendLog("errors.global", stringify(error), true)
}
