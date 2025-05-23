import axios from "axios"
import { ipcMain } from "electron"
import { APIEvents } from "@shared/events/api.events"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"
import { AppEvents } from "@shared/events/app.events"

const logSender = new LogSender()

export function uploadScreenshotCommand(
  token: string,
  orgId: number,
  file_name: string,
  file_size: number,
  version: string,
  title: string,
  file: File
): Promise<string> {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/screenshots`
  const formData = new FormData()
  formData.append("title", title)
  formData.append("file_name", file_name)
  formData.append("version", version)
  formData.append("file_size", file_size.toString())

  return new Promise((resolve) => {
    axios
      .post(url, formData, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        file.arrayBuffer().then((buffer) => {
          axios
            .put(res.data.url, buffer, {
              headers: { "content-type": "image/png" },
            })
            .then(() => {
              const completeUrl = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/screenshots/${res.data.uuid}/complete`
              axios
                .post(
                  completeUrl,
                  {},
                  { headers: { Authorization: `Bearer ${token}` } }
                )
                .then((completeRes) => {
                  const uuid = completeRes.data.uuid
                  resolve(uuid)
                })
                .catch((e) => {
                  logSender.sendLog(
                    "api.screenshots.post.complete.catch(error)"
                  )
                  resolve("")
                })
            })
            .catch((e) => {
              resolve("")
            })
        })
      })
      //
      .catch((e) => {
        if (e.response && e.response.status == 401) {
          ipcMain.emit(AppEvents.LOGOUT)
        }
        logSender.sendLog("api.screenshots.post.create_url.catch(error)")
        resolve("")
      })
  })
}
