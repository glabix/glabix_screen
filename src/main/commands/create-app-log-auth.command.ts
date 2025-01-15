import axios from "axios"
import { ipcMain } from "electron"

export function createAppLogAuthCommand(
  token: string,
  orgId: number,
  app_version: string,
  title: string,
  body: string
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/app_logs`
  const params = {
    body,
    title,
    version: app_version,
  }
  try {
    axios
      .post(url, params, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {})
      .catch((e) => {
        if (e.response && e.response.status == 401) {
          ipcMain.emit("app:logout")
        }
      })
  } catch (e) {}
}
