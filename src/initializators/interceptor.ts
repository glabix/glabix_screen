import { logAxiosError } from "/src/helpers/log-axios-error"
import axios, { AxiosError } from "axios"

// Добавление интерсептора для обработки ошибок во всех запросах
export const errorsInterceptor = () => {
  axios.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      logAxiosError(error, error?.config?.url?.includes("app_logs"))
      return Promise.reject(error)
    }
  )
}
