import { StorageManagerV3 } from "./storage-manager-v3"
import path from "path"
import {
  IRecordV3Status,
  RecordDataEventV3,
  RecordLastChunkHandledV3,
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

  async handleLastChunkData(event: RecordLastChunkHandledV3): Promise<void> {
    this.logSender.sendLog("chunks.handle.last.start", stringify(event))
    if (!this.activeRecordings.has(event.recordUuid)) {
      throw new Error(
        `Recording ${event.recordUuid} not found or already completed`
      )
    }
    const recording = this.store.getRecording(event.recordUuid)
    if (!recording) {
      throw new Error(`Recording ${event.recordUuid} not found`)
    }
    const chunk = Object.values(recording.chunks).find(
      (c) => c.index === event.lastChunkIndex
    )
    if (!chunk) {
      throw new Error(
        `Chunk of ${event.recordUuid} index: ${event.lastChunkIndex} not found`
      )
    }
    this.store.updateChunk(event.recordUuid, chunk.uuid, { isLast: true })
  }
  async handleDataEvent(event: RecordDataEventV3): Promise<void> {
    this.logSender.sendLog("chunks.handle.start", stringify(event))
    if (!this.activeRecordings.has(event.recordUuid)) {
      throw new Error(
        `Recording ${event.recordUuid} not found or already completed`
      )
    }
    const recording = this.store.getRecording(event.recordUuid)
    if (!recording) {
      throw new Error(`Recording ${event.recordUuid} not found`)
    }
    const chunkUuid = uuidv4()
    this.store.createChunk(
      event.recordUuid,
      chunkUuid,
      event.videoSource,
      event.audioSource,
      event.isLast,
      event.size,
      event.index
    )
    this.store.updateRecording(event.recordUuid, {
      failCounter: recording.failCounter ? 1 : 0,
    })
    this.openLibraryPageHandler.checkToOpenLibraryPage(event.recordUuid)

    if (event.isLast) {
      this.activeRecordings.delete(event.recordUuid)
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
