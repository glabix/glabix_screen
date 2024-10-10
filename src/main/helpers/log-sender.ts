import { createAppLogAuthCommand } from "../commands/create-app-log-auth.command"
import { TokenStorage } from "../storages/token-storage"
import { getVersion } from "./get-version"
import { createAppLogNoAuthCommand } from "../commands/create-app-log-no-auth.command"
import { LogLevel, setLog } from "./set-log"

export class LogSender {
  static #instance = null // Объявляем статическое приватное свойство. # - значит приватное.
  tokenStorage: TokenStorage
  constructor(tokenStorage?: TokenStorage) {
    if (tokenStorage) {
      this.tokenStorage = tokenStorage
      LogSender.#instance = this
    }
    if (LogSender.#instance) {
      // проверяем что значение #instance не равно null (т.е. уже что-то присвоено), и прерываем инструкцию, чтобы в соответствии с принципом синглтон сохранить значения присвоенные при первой инициации.
      return LogSender.#instance
    }
  }
  sendLog(title: string, body: string = "", err = false) {
    setLog(err ? LogLevel.ERROR : LogLevel.DEBUG, "send log:", title, body)
    const token = this.tokenStorage?.token?.access_token
    const orgId = this.tokenStorage?.organizationId
    const app_version = getVersion()
    if (token && orgId) {
      createAppLogAuthCommand(token, orgId, app_version, title, body)
    } else {
      createAppLogNoAuthCommand(app_version, title, body)
    }
  }
}
