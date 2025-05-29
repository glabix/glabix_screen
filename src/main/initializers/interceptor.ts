import { logAxiosError } from "@main/helpers/log-axios-error"
import axios, { AxiosError } from "axios"
import axiosRetry from "axios-retry"

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

// Настройка axios-retry
axiosRetry(axios, {
  retries: 3, // Количество попыток
  retryDelay: (retryCount) => {
    return retryCount * 1000 // Интервал между попытками (1s, 2s, 3s)
  },
  retryCondition: (error) => {
    // Повторяем только при определенных ошибках
    return (
      axiosRetry.isNetworkError(error) ||
      axiosRetry.isRetryableError(error) ||
      (!!error && !!error.response && error.response!.status > 500)
    )
  },
})
