import { createAppLogAuthCommand } from "../commands/create-app-log-auth.command"
import { TokenStorage } from "../storages/token-storage"
import { getVersion } from "./get-version"
import { createAppLogNoAuthCommand } from "../commands/create-app-log-no-auth.command"
import { LogLevel, setLog } from "./set-log"

export class LogSender {
  static tokenStorage: TokenStorage

  static sendLog(title: string, body: string = "", err = false) {
    setLog(err ? LogLevel.ERROR : LogLevel.SILLY, "send log:", title, body)
    const token = LogSender.tokenStorage?.token?.access_token
    const orgId = LogSender.tokenStorage?.organizationId
    const app_version = getVersion()
    if (token && orgId) {
      createAppLogAuthCommand(token, orgId, app_version, title, body)
    } else {
      createAppLogNoAuthCommand(app_version, title, body)
    }
  }
}
