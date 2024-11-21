export const httpErrorPareser = (error) => {
  if (!error || !error.isAxiosError) {
    return error
  }

  const { response, request, message, config } = error

  const parsedError = {
    message: message || "Ошибка запроса",
    status: response?.status || null,
    data: response?.data || null,
    headers: response?.headers || null,
    url: config?.url || null,
    method: config?.method || null,
    requestHeaders: config?.headers || null,
    requestParams: config?.params || null,
    requestData: config?.data || null,
  }

  // Если сервер вернул ответ с ошибкой
  if (response) {
    parsedError.message =
      response.data?.message || response.statusText || "Ошибка сервера"
  }

  // Если ошибка на этапе отправки запроса
  if (request && !response) {
    parsedError.message = "Нет ответа от сервера"
  }

  return parsedError
}
