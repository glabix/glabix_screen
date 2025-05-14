import { StorageManagerV3 } from "./storage-manager-v3"
import path from "path"
import { RecordDataEventV3 } from "@main/v3/events/record-v3-types"
import { app } from "electron"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { v4 as uuidv4 } from "uuid"
import { OpenLibraryPageHandler } from "@main/v3/open-library-page-handler"

//ChunkManager отвечает ТОЛЬКО за логику записи
export class ChunkManagerV3 {
  private activeRecordings: Set<string> = new Set()
  private storage = new StorageManagerV3()
  private baseDir = path.join(app.getPath("userData"), "recordsV3")
  private store: RecordStoreManager
  private openLibraryPageHandler = new OpenLibraryPageHandler()
  constructor() {
    this.store = new RecordStoreManager()
  }
  async handleDataEvent(event: RecordDataEventV3): Promise<void> {
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
        this.openLibraryPageHandler.checkToOpenLibraryPage(event.innerFileUuid)
      }
    } catch (error) {
      // Пробрасываем ошибку с дополнительным контекстом
      // @ts-ignore
      throw new Error(
        `Chunk save failed for recording ${event.innerFileUuid}: ${error.message}`
      )
    }

    if (event.isLast) {
      this.activeRecordings.delete(event.innerFileUuid)
    }
  }

  startNewRecording(innerUuid: string): void {
    this.activeRecordings.add(innerUuid)
  }

  cancelRecording(uuid: string): void {
    // if (this.activeRecordings.has(uuid)) {
    //   this.activeRecordings.delete(uuid)
    //   this.storage.cleanup(uuid).catch((error) => {
    //     console.error(`Cleanup failed for ${uuid}:`, error)
    //   })
    // }
  }
}
