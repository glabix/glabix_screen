import axios from "axios"
import { ipcMain } from "electron"
import { LogSender } from "@main/helpers/log-sender"
import { stringify } from "@main/helpers/stringify"
import { APIEvents } from "@shared/events/api.events"
import { IAccountData } from "@shared/types/types"

const logSender = new LogSender()

export function getAccountData(
  token: string,
  entityId: number
): Promise<IAccountData> {
  const url = `${import.meta.env.VITE_API_PATH}accounts/${entityId}/current`
  return new Promise((resolve, reject) => {
    axios
      .get(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res: any) => {
        const data = res.data as IAccountData
        ipcMain.emit(APIEvents.GET_ACCOUNT_DATA, null, data)
        resolve(data as IAccountData)
      })
      .catch((e) => {
        logSender.sendLog("api.accountData.get.error", stringify(e))
        reject(e)
      })
  })
}
