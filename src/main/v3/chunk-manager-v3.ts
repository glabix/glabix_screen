import { StorageManagerV3 } from "./storage-manager-v3"
import path from "path"
import {
  IRecordV3Status,
  RecordDataEventV3,
} from "@main/v3/events/record-v3-types"
import { app } from "electron"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { v4 as uuidv4 } from "uuid"
import { OpenLibraryPageHandler } from "@main/v3/open-library-page-handler"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"

//ChunkManager отвечает ТОЛЬКО за логику записи
export class ChunkManagerV3 {
  private activeRecordings: Set<string> = new Set()
  private storage = new StorageManagerV3()
  private baseDir = path.join(app.getPath("userData"), "recordsV3")
  private store: RecordStoreManager
  private openLibraryPageHandler = new OpenLibraryPageHandler()
  private logSender = new LogSender()

  constructor() {
    this.store = new RecordStoreManager()
  }
  async handleDataEvent(event: RecordDataEventV3): Promise<void> {
    this.logSender.sendLog("chunks.handle.start", stringify(event))
    if (!this.activeRecordings.has(event.innerFileUuid)) {
      throw new Error(
        `Recording ${event.innerFileUuid} not found or already completed`
      )
    }
    const chunkUuid = uuidv4()
    const dirPath = path.join(this.baseDir, event.innerFileUuid)
    try {
      const buffer = Buffer.from(event.data)
      const chunkParts = this.storage.splitChunk(buffer)
      for (const part of chunkParts) {
        const source = await this.storage.saveChunkPart(
          dirPath,
          event.timestamp,
          part
        )
        const isLast = event.isLast
          ? part.partIndex === chunkParts.length - 1
          : false
        this.store.createChunk(event.innerFileUuid, chunkUuid, source, isLast)
        this.store.updateRecording(event.innerFileUuid, { failCounter: 0 })
        this.openLibraryPageHandler.checkToOpenLibraryPage(event.innerFileUuid)
      }
    } catch (error) {
      // Пробрасываем ошибку с дополнительным контекстом
      // @ts-ignore
      this.logSender.sendLog("chunks.handle.start", stringify(error), true)
      throw new Error(
        `Chunk save failed for recording ${event.innerFileUuid}: ${error.message}`
      )
    }

    if (event.isLast) {
      this.activeRecordings.delete(event.innerFileUuid)
      this.logSender.sendLog(
        "chunks.handle.last_chunk_handled_and_created",
        stringify({ chunkUuid })
      )
    }

    this.logSender.sendLog("chunks.handle.complete", stringify({ chunkUuid }))
  }

  startNewRecording(innerUuid: string): void {
    this.activeRecordings.add(innerUuid)
  }

  cancelRecording(recordingLocalUuid: string): void {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    this.store.updateRecording(recordingLocalUuid, {
      canceledAt: Date.now(),
    })
    if (this.activeRecordings.has(recordingLocalUuid)) {
      this.activeRecordings.delete(recordingLocalUuid)
    }
  }
}
