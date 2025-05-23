import { TokenStorage } from "@main/storages/token-storage"
import { openExternalLink } from "@shared/helpers/open-external-link"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { ipcMain, Notification } from "electron"
import { LogSender } from "@main/helpers/log-sender"
import { FileUploadEvents } from "@shared/events/file-upload.events"

export class OpenLibraryPageHandler {
  store = new RecordStoreManager()
  private logSender = new LogSender()
  checkToOpenLibraryPage(recordingLocalUuid: string) {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    const lastUuid = this.store.getLastCreatedRecordCache()
    if (lastUuid !== recordingLocalUuid) {
      return
    }
    const lastChunk = Object.entries(recording.chunks).find(([_, c]) => {
      return c.isLast
    })
    if (recording.serverUuid && lastChunk) {
      if (this.store.getLastCreatedRecordCache() === recording.localUuid) {
        this.openLibraryPage(recording.serverUuid, false)
      } else {
        this.showLoadedNotification(recording.localUuid)
      }
    }
    if (recording.failCounter && lastChunk) {
      const params = {
        filename: recording.title,
      }
      ipcMain.emit(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, params)
    }
  }

  openLibraryPage(serverUuid: string, manual: boolean) {
    const shared =
      import.meta.env.VITE_AUTH_APP_URL +
      "recorder/org/" +
      TokenStorage.organizationId +
      "/" +
      "library/" +
      serverUuid
    openExternalLink(shared)
    this.logSender.sendLog(
      "utils.open_library_page",
      JSON.stringify({ serverUuid, manual })
    )
  }

  showLoadedNotification(recordingLocalUuid: string) {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    const title = recording.title
    const serverUuid = recording.serverUuid
    if (!serverUuid) {
      this.logSender.sendLog(
        "utils.open_library_page.error.empty_server_uuid",
        JSON.stringify({ recordingLocalUuid })
      )
    }
    if (Notification.isSupported()) {
      const notification = new Notification({
        body: `Запись экрана ${title} загружается на сервер, и будет доступна для просмотра после обработки. Нажмите на уведомление, чтобы открыть в браузере`,
      })
      this.logSender.sendLog(
        "utils.notification.upload",
        JSON.stringify({ recordingLocalUuid })
      )
      notification.show()
      notification.on("click", () => {
        // Открываем ссылку в браузере
        this.openLibraryPage(serverUuid!, true)
      })
      setTimeout(() => {
        notification.close()
      }, 5000)
    }
  }
}
