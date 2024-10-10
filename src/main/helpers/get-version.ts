import os from "os"
import { app } from "electron"

export const getVersion = (): string => {
  const platform = os.platform() === "darwin" ? "mac" : os.platform()
  const version = app.getVersion() // Получаем версию приложения
  return `${platform}-${version}`
}
