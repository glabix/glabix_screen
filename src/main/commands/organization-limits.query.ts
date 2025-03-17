import axios from "axios"
import { ipcMain } from "electron"
import { APIEvents } from "@shared/events/api.events"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"
import { IOrganizationLimits } from "@shared/types/types"
import { AppEvents } from "@shared/events/app.events"

const logSender = new LogSender()

export function getOrganizationLimits(
  token: string,
  orgId: number
): Promise<boolean> {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/limits`
  return new Promise((resolve) => {
    axios
      .get(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = {
          ...res.data,
        } as IOrganizationLimits
        ipcMain.emit(APIEvents.GET_ORGANIZATION_LIMITS, data)
        resolve(true)
      })
      .catch((e) => {
        if (e.response && e.response.status == 401) {
          ipcMain.emit(AppEvents.LOGOUT)
        }
        logSender.sendLog("api.limits.get.error", stringify(e))
        resolve(false)
      })
  })
}
