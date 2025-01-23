import { LogSender } from "../main/helpers/log-sender"
import { TokenStorage } from "../main/storages/token-storage"
import StorageService from "./storage.service"
import { getAllRecordDal, getByUuidRecordDal } from "../database/dal/Record"
import Record, { RecordStatus } from "../database/models/Record"
import Chunk, { ChunkStatus } from "../database/models/Chunk"
import { openExternalLink } from "../shared/helpers/open-external-link"
import { Notification } from "electron"

export class RecordManager {
  static tokenStorage = new TokenStorage()
  static logSender = new LogSender(this.tokenStorage)

  static currentProcessRecordUuid: string | null = null
  static lastRecordUuid: string | null = null
  static chunksDeleteProcess = false
  constructor() {}

  static async setTimer() {
    this.updateRecordsInProgress()

    if (!this.currentProcessRecordUuid) {
      await this.resolveUnprocessedRecords()
    }

    if (!this.chunksDeleteProcess) {
      this.chunksDeleteProcess = true
      await this.deleteUnknownChunks()
      this.chunksDeleteProcess = false
    }

    const timer = setInterval(() => {
      if (!this.currentProcessRecordUuid) {
        this.resolveUnprocessedRecords()
      }
    }, 30 * 1000)

    const timer2 = setInterval(async () => {
      if (!this.chunksDeleteProcess) {
        this.chunksDeleteProcess = true
        await this.deleteUnknownChunks()
        this.chunksDeleteProcess = false
      }
    }, 30 * 1000)
  }

  static updateRecordsInProgress() {
    StorageService.updateLoadingChunks()
    StorageService.updateRecordingFiles()
  }

  static async deleteUnknownChunks() {
    await StorageService.deleteUnknownChunks()
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

  static async recordServerCreate(record: Record): Promise<Record | null> {
    const uuid = record.getDataValue("uuid")
    return await StorageService.createFileOnServer(record.getDataValue("uuid"))
  }

  static async resolveRecordComplete(uuid: string) {
    const record = await getByUuidRecordDal(uuid)
    const recordChunks = record.getDataValue("Chunks")
    const unloadedChunk = recordChunks.find(
      (c) => c.getDataValue("status") !== ChunkStatus.LOADED
    )
    if (!unloadedChunk) {
      // если нет незагруженных чанков
      await StorageService.fileUploadEnd(uuid)
    }
  }

  static async processRecord(uuid: string, force = false) {
    const record = await getByUuidRecordDal(uuid)
    const status = record.getDataValue("status")
    if (status === RecordStatus.RECORDING) {
      return
    } else if (status === RecordStatus.RECORDED) {
      this.currentProcessRecordUuid = uuid
      try {
        const updatedRecord = await this.recordServerCreate(record)
        if (this.lastRecordUuid === uuid) {
          this.openLibraryPage(updatedRecord, false)
        } else {
          this.showLoadedNotification(updatedRecord)
        }
        await this.loadRecordChunks(uuid)
        await this.resolveRecordComplete(uuid)
      } catch (e) {}
      this.currentProcessRecordUuid = null
      return
    } else if (status === RecordStatus.CREATED_ON_SERVER) {
      this.currentProcessRecordUuid = uuid
      try {
        await this.loadRecordChunks(uuid)
        await this.resolveRecordComplete(uuid)
      } catch (e) {}
      this.currentProcessRecordUuid = null
      return
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
}
