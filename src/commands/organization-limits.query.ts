import axios from "axios"
import { ipcMain } from "electron"
import { APIEvents } from "../events/api.events"
export function getOrganizationLimits(token: string, orgId: number) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/limits`

  axios
    .get(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      ipcMain.emit(APIEvents.GET_ORGANIZATION_LIMITS, res.data)
    })
}
