import { LogLevel, setLog } from "./set-log"

export function logAxiosError(error) {
  let errorMessage = `Axios Error: ${error.message}`

  if (error.response) {
    // Сервер вернул ответ с ошибкой
    errorMessage += `\nStatus: ${error.response.status}`
    errorMessage += `\nHeaders: ${JSON.stringify(error.response.headers, null, 2)}`
    errorMessage += `\nData: ${JSON.stringify(error.response.data, null, 2)}`
  } else if (error.request) {
    // Запрос был сделан, но ответа не получено
    errorMessage += `\nRequest: ${JSON.stringify(error.request, null, 2)}`
  } else {
    // Ошибка при настройке запроса
    errorMessage += `\nError: ${error.message}`
  }
  errorMessage += `\nConfig: ${JSON.stringify(error.config, null, 2)}`

  // Логируем все в одно сообщение
  setLog(LogLevel.ERROR, errorMessage)
}
