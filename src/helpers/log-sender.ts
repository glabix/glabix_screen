import { createAppLogAuthCommand } from "../commands/create-app-log-auth.command"
import { TokenStorage } from "../storages/token-storage"
import { getVersion } from "./get-version"
import { createAppLogNoAuthCommand } from "../commands/create-app-log-no-auth.command"
import { LogLevel, setLog } from "./set-log"

export class LogSender {
  tokenStorage: TokenStorage
  constructor(tokenStorage: TokenStorage) {
    this.tokenStorage = tokenStorage
  }
  sendLog(title: string, body: string = "") {
    setLog(LogLevel.SILLY, "send log: ", title, body)
    const token = this.tokenStorage.token.access_token
    const orgId = this.tokenStorage.organizationId
    const app_version = getVersion()
    if (token) {
      createAppLogAuthCommand(token, orgId, app_version, title, body)
    } else {
      createAppLogNoAuthCommand(app_version, title, body)
    }
  }
}
