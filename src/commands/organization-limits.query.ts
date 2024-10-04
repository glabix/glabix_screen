import axios from "axios"
import { ipcMain } from "electron"
import { APIEvents } from "/src/events/api.events"
export function getOrganizationLimits(
  token: string,
  orgId: number
): Promise<boolean> {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/limits`
  return new Promise((resolve) => {
    axios
      .get(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        ipcMain.emit(APIEvents.GET_ORGANIZATION_LIMITS, res.data)
        resolve(true)
      })
      .catch((e) => {
        if (e.response && e.response.status == 401) {
          ipcMain.emit("app:logout")
        }
        resolve(false)
      })
  })
}
