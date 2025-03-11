import { LogSender } from "../main/helpers/log-sender"
import { TokenStorage } from "../main/storages/token-storage"
import StorageService from "./storage.service"
import { getAllRecordDal, getByUuidRecordDal } from "../database/dal/Record"
import Record, { RecordStatus } from "../database/models/Record"
import Chunk, { ChunkStatus } from "../database/models/Chunk"
import { openExternalLink } from "../shared/helpers/open-external-link"
import { ipcMain, Notification } from "electron"
import { PreviewManager } from "./preview-manager"
import { httpErrorPareser } from "../main/helpers/http-error-pareser"
import { stringify } from "../main/helpers/stringify"
import { checkOrganizationLimits } from "../shared/helpers/check-organization-limits"
import { FileUploadEvents } from "../shared/events/file-upload.events"

export class RecordManager {
  static tokenStorage = new TokenStorage()
  static logSender = new LogSender(this.tokenStorage)

  static currentProcessRecordUuid: string | null = null
  static lastRecordUuid: string | null = null
  static cronInterval3min: NodeJS.Timeout | null = null
  static cronInterval30sec: NodeJS.Timeout | null = null
  static chunksDeleteProcess = false
  static previewsDeleteProcess = false
  static completedAndCanceledRecordsProcess = false
  constructor() {}

  static async setTimer() {
    this.updateRecordsInProgress()

    if (!this.currentProcessRecordUuid) {
      await this.resolveUnprocessedRecords()
    }

    if (!this.completedAndCanceledRecordsProcess) {
      this.completedAndCanceledRecordsProcess = true
      await this.completedAndCanceledRecordsDelete()
      this.completedAndCanceledRecordsProcess = false
    }

    if (!this.chunksDeleteProcess) {
      this.chunksDeleteProcess = true
      await this.deleteUnknownChunks()
      this.chunksDeleteProcess = false
    }

    if (!this.previewsDeleteProcess) {
      this.previewsDeleteProcess = true
      await this.deleteUnknownPreviews()
      this.previewsDeleteProcess = false
    }

    this.cronInterval30sec = setInterval(() => {
      if (!this.currentProcessRecordUuid) {
        this.resolveUnprocessedRecords()
      }
    }, 30 * 1000)

    this.cronInterval3min = setInterval(
      async () => {
        if (!this.completedAndCanceledRecordsProcess) {
          this.completedAndCanceledRecordsProcess = true
          await this.completedAndCanceledRecordsDelete()
          this.completedAndCanceledRecordsProcess = false
        }
        if (!this.chunksDeleteProcess) {
          this.chunksDeleteProcess = true
          await this.deleteUnknownChunks()
          this.chunksDeleteProcess = false
        }
        if (!this.previewsDeleteProcess) {
          this.previewsDeleteProcess = true
          await this.deleteUnknownPreviews()
          this.previewsDeleteProcess = false
        }
      },
      3 * 60 * 1000
    )
  }

  static async updateRecordsInProgress() {
    await StorageService.updateLoadingChunks()
    await StorageService.updateRecordingFiles()
    await StorageService.updateCratingOnServerFiles()
  }

  static async deleteUnknownChunks() {
    await StorageService.deleteUnknownChunks()
  }

  static async deleteUnknownPreviews() {
    await PreviewManager.deleteUnknownPreviews()
  }

  static async completedAndCanceledRecordsDelete() {
    await StorageService.canceledRecordsDelete()
    await StorageService.competedRecordsDelete()
  }

  static async resolveUnprocessedRecords() {
    const recorded = await getAllRecordDal({ status: RecordStatus.RECORDED })
    if (recorded.length) {
      const record = recorded[0]
      await this.processRecord(record.getDataValue("uuid"))
      return
    }
    const withUnloadedChunks = await getAllRecordDal({
      status: RecordStatus.CREATED_ON_SERVER,
    })
    if (withUnloadedChunks.length) {
      const record = withUnloadedChunks[0]
      await this.processRecord(record.getDataValue("uuid"))
      return
    }
  }

  static async loadRecordChunks(uuid: string) {
    const record = await getByUuidRecordDal(uuid)
    const fileChunks = record.getDataValue("Chunks")
    const count = fileChunks.length
    const pendingChunks = fileChunks.filter(
      (f) => f.getDataValue("status") === ChunkStatus.PENDING
    )
    for (let pendingChunk of pendingChunks) {
      const chunk = await this.loadChunk(pendingChunk) // null or Chunk
    }
  }

  static async loadChunk(chunk: Chunk) {
    return StorageService.loadChunk(chunk)
  }

  static async recordServerCreate(record: Record): Promise<Record> {
    const uuid = record.getDataValue("uuid")
    this.logSender.sendLog("record.manager.server_create", stringify({ uuid }))
    try {
      return await StorageService.createFileOnServer(uuid)
    } catch (err) {
      const parsedError = httpErrorPareser(err)
      this.logSender.sendLog(
        "record.manager.server_create.error",
        stringify({ uuid, error: parsedError | err }),
        true
      )
      throw err
    }
  }

  static async resolveRecordComplete(uuid: string) {
    this.logSender.sendLog(
      "record.manager.resolve.complete",
      stringify({ uuid })
    )
    const record = await getByUuidRecordDal(uuid)
    const recordChunks = record.getDataValue("Chunks")
    const unloadedChunk = recordChunks.find(
      (c) => c.getDataValue("status") !== ChunkStatus.LOADED
    )
    if (!unloadedChunk) {
      // если нет незагруженных чанков
      await StorageService.RecordUploadEnd(uuid)
    }
  }

  static async processRecord(uuid: string, force = false) {
    this.logSender.sendLog(
      "record.manager.process.start",
      stringify({ uuid, force })
    )
    try {
      const record = await getByUuidRecordDal(uuid)

      const status = record.getDataValue("status")
      if (status === RecordStatus.RECORDING) {
        return
      } else if (status === RecordStatus.RECORDED) {
        this.logSender.sendLog(
          "record.manager.process.start.find.recorded",
          stringify({ uuid, past: this.currentProcessRecordUuid })
        )
        this.currentProcessRecordUuid = uuid
        const chunks = record.getDataValue("Chunks")
        if (!chunks.length) {
          this.logSender.sendLog(
            "record.manager.process.recorded.no_chunks",
            stringify({ uuid, createdAt: record.getDataValue("createdAt") })
          )
          await this.resolveRecordComplete(uuid)
          this.currentProcessRecordUuid = null
          return
        }
        try {
          const updatedRecord = await this.recordServerCreate(record)
          checkOrganizationLimits()
          if (this.lastRecordUuid === uuid) {
            this.openLibraryPage(updatedRecord, false)
          } else {
            this.showLoadedNotification(updatedRecord)
          }
        } catch (e) {
          if (force) {
            const params = {
              filename: record.getDataValue("title"),
            }
            ipcMain.emit(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, params)
          }
          throw e
        }
        await this.loadRecordChunks(uuid)
        await this.resolveRecordComplete(uuid)
        this.currentProcessRecordUuid = null
        return
      } else if (status === RecordStatus.CREATED_ON_SERVER) {
        this.logSender.sendLog(
          "record.manager.process.start.find.created_on_server",
          stringify({ uuid, past: this.currentProcessRecordUuid })
        )
        this.currentProcessRecordUuid = uuid
        await this.loadRecordChunks(uuid)
        await this.resolveRecordComplete(uuid)
        this.currentProcessRecordUuid = null
        return
      }
    } catch (err) {
      const parsedError = httpErrorPareser(err)
      this.logSender.sendLog(
        "record.manager.process.error",
        stringify({ uuid, error: parsedError | err }),
        true
      )
      this.currentProcessRecordUuid = null
    }
  }

  // форсим загрузку только что записанного файла
  static async newRecord(uuid: string) {
    this.lastRecordUuid = uuid
    await this.processRecord(uuid, true)
  }

  static openLibraryPage(record: Record, manual: boolean) {
    const serverUuid = record.getDataValue("server_uuid")
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

  static showLoadedNotification(record: Record) {
    const title = record.getDataValue("title")
    const uuid = record.getDataValue("uuid")
    if (Notification.isSupported()) {
      const notification = new Notification({
        body: `Запись экрана ${title} загружается на сервер, и будет доступна для просмотра после обработки. Нажмите на уведомление, чтобы открыть в браузере`,
      })
      this.logSender.sendLog(
        "utils.notification.upload",
        JSON.stringify({ uuid })
      )
      notification.show()
      notification.on("click", () => {
        // Открываем ссылку в браузере
        this.openLibraryPage(record, true)
      })
      setTimeout(() => {
        notification.close()
      }, 5000)
    }
  }

  static clearIntervals() {
    if (this.cronInterval3min) {
      clearInterval(this.cronInterval3min)
    }
    if (this.cronInterval30sec) {
      clearInterval(this.cronInterval30sec)
    }
  }
}
