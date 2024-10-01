import axios from "axios"
import { ipcMain } from "electron"
import { FileUploadEvents } from "../events/file-upload.events"
import { LogLevel, setLog } from "../helpers/set-log"

export function createFileUploadCommand(
  token: string,
  orgId: number,
  filename: string,
  chunks: Blob[],
  title: string
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads`
  const params = {
    chunks_count: chunks.length,
    filename,
    title,
  }
  setLog(`FileUploadEvents.FILE_CREATED init url: ${url}`, LogLevel.DEBUG)
  axios
    .post<{
      uuid: string
    }>(url, { ...params }, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      setLog(
        `FileUploadEvents.FILE_CREATED then(): ${res.data}`,
        LogLevel.DEBUG
      )
      const uuid = res.data.uuid
      const params = { uuid, chunks }
      ipcMain.emit(FileUploadEvents.FILE_CREATED_ON_SERVER, params)
    })
}
