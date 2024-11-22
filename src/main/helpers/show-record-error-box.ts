import { app, dialog, ipcMain } from "electron"

export const showRecordErrorBox = (header?: string, text?: string) => {
  const defaultHeader = "Критическая ошибка во время записи приложения"
  const defaultText = "Перезапустите приложение"
  ipcMain.emit("stop-recording")
  dialog.showErrorBox(header || defaultHeader, text || defaultText) // Покажет окно с ошибкой
  app.quit() // Завершает текущий процесс
}
