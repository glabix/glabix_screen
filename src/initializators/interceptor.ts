import { logAxiosError } from "../helpers/log-axios-error"
import axios from "axios"

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
