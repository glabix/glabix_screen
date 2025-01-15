import { app, ipcMain, safeStorage } from "electron"
import * as fs from "fs"
import { IAuthData, IJWTToken } from "@shared/types/types"
import { LoginEvents } from "@shared/events/login.events"
import os from "os"
import path from "path"
import { LogLevel, setLog } from "@main/helpers/set-log"

export class TokenStorage {
  private _token: IJWTToken | null = null
  private _organizationId: number | null = null
  private _userId: number | null = null
  private _entityId: number | null = null
  readonly authDataFileName =
    os.platform() == "darwin"
      ? path.join(
          os.homedir(),
          "Library",
          "Application Support",
          app.getName(),
          "authData.enc"
        )
      : path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          app.getName(),
          "authData.enc"
        )
  get token(): IJWTToken | null {
    return this._token
  }

  get organizationId(): number | null {
    return this._organizationId
  }

  get userId(): number | null {
    return this._userId
  }
  get entityId(): number | null {
    return this._entityId
  }

  encryptAuthData(authData: IAuthData): void {
    if (safeStorage.isEncryptionAvailable()) {
      const encryptedData = safeStorage.encryptString(JSON.stringify(authData))
      fs.writeFileSync(this.authDataFileName, encryptedData)
      this._token = authData.token
      this._organizationId = +authData.organization_id
      this._userId = authData.user_id ? +authData.user_id : null
      this._entityId = authData.entity_id ? +authData.entity_id : null
    } else {
      throw new Error("safeStorage Encryption is not available in this OS!")
    }
  }

  readAuthData(): void {
    setLog(LogLevel.SILLY, `Read auth data`)
    if (fs.existsSync(this.authDataFileName)) {
      const encryptedDataBuffer = fs.readFileSync(this.authDataFileName)
      const encryptedDataString = safeStorage.decryptString(encryptedDataBuffer)
      const encryptedDataJSON = JSON.parse(encryptedDataString) as IAuthData
      this._token = encryptedDataJSON.token
      this._organizationId = +encryptedDataJSON.organization_id
      this._userId = encryptedDataJSON.user_id
        ? +encryptedDataJSON.user_id
        : null
      this._entityId = encryptedDataJSON.entity_id
        ? +encryptedDataJSON.entity_id
        : null
      setLog(LogLevel.SILLY, `authDataFile is exist`)
    } else {
      setLog(LogLevel.SILLY, `authDataFile is empty`)
      this._token = null
      this._organizationId = null
      this._userId = null
      this._entityId = null
    }
  }

  dataIsActual(): boolean {
    if (!this._token || !this._organizationId) {
      return false
    }

    const expiresAtDate = new Date(this.token!.expires_at) // Преобразуем в объект даты
    const currentTime = new Date() // Текущее время
    const tokenIsActive = expiresAtDate > currentTime
    return Boolean(
      this.token && Number.isInteger(this.organizationId) && tokenIsActive
    )
  }

  reset() {
    setLog(LogLevel.DEBUG, "Reset auth data")
    this._token = null
    this._organizationId = null
    this._userId = null
    this._entityId = null

    if (fs.existsSync(this.authDataFileName)) {
      fs.unlinkSync(this.authDataFileName)
    }

    ipcMain.emit(LoginEvents.LOGOUT, {})
  }
}
