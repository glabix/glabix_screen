import { logAxiosError } from "@main/helpers/log-axios-error"
import axios, { AxiosError } from "axios"

let flag = false

// Добавление интерсептора для обработки ошибок во всех запросах
export const errorsInterceptor = () => {
  axios.interceptors.response.use(undefined, (err) => {})

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      logAxiosError(error)
      return Promise.reject(error)
    }
  )
}
