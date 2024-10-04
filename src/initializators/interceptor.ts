import { logAxiosError } from "../helpers/log-axios-error"
import axios from "axios"
import { ipcRenderer } from "electron"
import { LoggerEvents } from "../events/logger.events"

// Добавление интерсептора для обработки ошибок во всех запросах
export const errorsInterceptor = () => {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      logAxiosError(error)
      return Promise.reject(error)
    }
  )
}
