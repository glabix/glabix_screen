import { stringify } from "./stringify"
import { LogSender } from "./log-sender"
import { showRecordErrorBox } from "./show-record-error-box"

const logSender = new LogSender()

export function fsErrorParser(err, chunkPath) {
  if (err.code === "ENOENT") {
    logSender.sendLog(
      `Ошибка при работе с файловой системой ENOENT: ${chunkPath}`,
      stringify(err),
      true
    )
    setTimeout(() => {
      showRecordErrorBox(
        "Ошибка при работе с файловой системой ENOENT",
        "Перезапустите приложение"
      )
    }, 100)
  } else if (err.code === "EACCES") {
    // Если ошибка из-за прав доступа
    logSender.sendLog(
      `Нет доступа для записи в файл: ${chunkPath}`,
      stringify(err),
      true
    )
    setTimeout(() => {
      showRecordErrorBox(
        `Нет доступа для записи в файл: ${chunkPath}`,
        "Перезапустите приложение"
      )
    }, 500)
  } else if (err.code === "ENOSPC") {
    // Ошибка отсутствия места на диске
    logSender.sendLog(
      `Нет места на диске для записи файла: ${chunkPath}`,
      stringify(err),
      true
    )
    setTimeout(() => {
      showRecordErrorBox(
        `Нет места на диске для записи файла: ${chunkPath}`,
        "Освободите место и перезапустите приложение"
      )
    }, 500)
  } else if (err.code === "EISDIR") {
    // Если путь является директорией, а не файлом
    logSender.sendLog(
      `Невозможно записать в директорию: ${chunkPath}`,
      stringify(err),
      true
    )
    setTimeout(() => {
      showRecordErrorBox(
        "Ошибка при работе с файловой системой EISDIR",
        "Перезапустите приложение"
      )
    }, 500)
  } else {
    // Для других ошибок просто передаем их
    logSender.sendLog(`Неизвестная ошибка`, stringify(err), true)
    setTimeout(() => {
      showRecordErrorBox(
        "Неизвестная ошибка при работе с файловой системой",
        "Обратитесь в поддержку для решения проблемы"
      )
    }, 500)
  }

  throw new Error(err)
}
