export function dataURLToFile(dataURL: string, filename: string): File {
  // Разделяем dataURL на две части: метаданные и двоичные данные
  const [metadata, data] = dataURL.split(",")
  const mimeMatch = metadata?.match(/:(.*?);/)

  // Извлекаем MIME-тип из метаданных
  const mimeType = mimeMatch ? mimeMatch[1] : ""

  // Декодируем базовые данные в двоичный массив
  const byteString = atob(data!)
  const byteLength = byteString.length
  const byteArray = new Uint8Array(byteLength)

  for (let i = 0; i < byteLength; i++) {
    byteArray[i] = byteString.charCodeAt(i)
  }

  // Создаем Blob из двоичного массива
  const blob = new Blob([byteArray], { type: mimeType })

  // Создаем объект File из Blob
  return new File([blob], filename, { type: mimeType })
}
