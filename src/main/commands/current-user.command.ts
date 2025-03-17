import axios from "axios"
import { ipcMain } from "electron"
import { LoginEvents } from "@shared/events/login.events"
import { IUser } from "@shared/types/types"
import { AppEvents } from "@shared/events/app.events"

export function getCurrentUser(token: string): Promise<IUser> {
  const url = `${import.meta.env.VITE_API_PATH}/identities/current`
  return new Promise((resolve, reject) => {
    axios
      .get(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        ipcMain.emit(LoginEvents.USER_VERIFIED, res.data)
        resolve(res.data)
      })
      .catch((e) => {
        if (e.response && e.response.status == 401) {
          ipcMain.emit(AppEvents.LOGOUT)
        }
        reject(e)
      })
  })
}
