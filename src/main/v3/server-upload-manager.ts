import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import {
  ChunkStatusV3,
  IRecordV3,
  IRecordV3Status,
} from "@main/v3/events/record-v3-types"
import { initUploadCommandV3 } from "@main/commands/v3/init-upload.command"
import { TokenStorage } from "@main/storages/token-storage"
import { submitUploadPartCommandV3 } from "@main/commands/v3/submit-upload-part.command"
import fs from "fs"
import { uploadCompleteCommandV3 } from "@main/commands/v3/upload-complete.command"
import { OpenLibraryPageHandler } from "@main/v3/open-library-page-handler"
import { StorageManagerV3 } from "@main/v3/storage-manager-v3"

export class ServerUploadManager {
  private store: RecordStoreManager
  private storage: StorageManagerV3
  private isProcessing = false
  private openLibraryPageHandler = new OpenLibraryPageHandler()

  constructor(store: RecordStoreManager, storage: StorageManagerV3) {
    this.store = store
    this.storage = storage

    setInterval(() => this.processQueue(), 5000) // Проверка каждые 5 сек
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true
    try {
      const recordForProcessing = this.store.getPriorityRecording()
      if (recordForProcessing) {
        await this.processRecording(recordForProcessing)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async processRecording(recording: IRecordV3): Promise<void> {
    if (!TokenStorage.token?.access_token) return
    try {
      // 1. Инициализация загрузки
      if (!recording.upload) {
        this.store.updateRecording(recording.localUuid, {
          upload: { status: "pending" },
        })
        return
      }

      // 2. Создание мультипарт загрузку
      if (
        recording.status === IRecordV3Status.PENDING &&
        Object.keys(recording.chunks).length
      ) {
        await this.initUpload(recording.localUuid)
      }

      // 3. Загрузка чанков
      if (recording.status === IRecordV3Status.CREATED_ON_SERVER) {
        await this.uploadChunks(recording.localUuid)
      }

      this.checkThatFullUpload(recording.localUuid)

      // 4. Завершение загрузки
      if (recording.status === IRecordV3Status.COMPLETE) {
        await this.completeUpload(recording.localUuid)
      }
    } catch (error) {
      console.error(`Upload failed for ${recording.localUuid}:`, error)
      this.store.updateRecording(recording.localUuid, {
        upload: { status: "failed" },
      })
    }
  }

  private checkThatFullUpload(recordingLocalUuid: string) {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (recording.canceledAt) {
      //log
      return
    }
    if (recording.status !== IRecordV3Status.CREATED_ON_SERVER) {
      return
    }
    if (recording.canceledAt) {
      return
    }
    const chunks = Object.entries(recording.chunks)
    const allChunksIsUpload = !chunks.filter(
      ([_, chunk]) => chunk.status !== ChunkStatusV3.SENT_TO_SERVER
    ).length
    const isLastChunk = chunks.find(([_, chunk]) => chunk.isLast)
    if (isLastChunk && allChunksIsUpload) {
      this.store.updateRecording(recording.localUuid, {
        status: IRecordV3Status.COMPLETE,
      })
    }
  }

  private async initUpload(recordingLocalUuid: string): Promise<void> {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (recording.canceledAt) {
      return
    }
    const token = TokenStorage.token!.access_token
    const orgId = TokenStorage.organizationId
    const filename = recording.title + ".mp4"
    const preview = await this.storage.readPreview(recordingLocalUuid)
    try {
      const { data } = await initUploadCommandV3(
        token,
        orgId!,
        filename,
        recording.title,
        recording.version,
        preview,
        recording.cropData
      )
      this.store.updateRecording(recordingLocalUuid, {
        status: IRecordV3Status.CREATED_ON_SERVER,
        failCounter: 0,
        serverUuid: data.uuid,
      })
    } catch (error) {
      this.store.updateRecording(recordingLocalUuid, {
        status: IRecordV3Status.PENDING,
        failCounter: (recording.failCounter || 0) + 1,
        lastUploadAttemptAt: Date.now(),
      })
      throw error
    }

    this.openLibraryPageHandler.checkToOpenLibraryPage(recording.localUuid)
  }

  private async uploadChunks(recordingLocalUuid: string): Promise<void> {
    const recording = this.store.getRecording(recordingLocalUuid)

    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (!recording.serverUuid) {
      throw new Error(`Recording ${recordingLocalUuid} serverUuid not found `)
    }

    const chunksToUpload = Object.entries(recording.chunks)
      .filter(([_, chunk]) => chunk.status === ChunkStatusV3.RECORDED)
      .slice(0, 1) // Лимит параллельных загрузок

    await Promise.all(
      chunksToUpload.map(async ([chunkUuid, chunk]) => {
        try {
          const token = TokenStorage.token!.access_token
          const orgId = TokenStorage.organizationId!
          const buffer = await fs.promises.readFile(chunk.source)
          this.store.updateChunk(recordingLocalUuid, chunkUuid, {
            status: ChunkStatusV3.SENDING_TO_SERVER,
          })
          const res = await submitUploadPartCommandV3(
            token,
            orgId,
            recording.serverUuid!,
            buffer
          )
          this.store.updateChunk(recordingLocalUuid, chunkUuid, {
            status: ChunkStatusV3.SENT_TO_SERVER,
          })
          this.store.updateRecording(recordingLocalUuid, {
            failCounter: 0,
          })
        } catch (error) {
          this.store.updateChunk(recordingLocalUuid, chunkUuid, {
            status: ChunkStatusV3.RECORDED,
          })
          this.store.updateRecording(recordingLocalUuid, {
            failCounter: (recording.failCounter || 0) + 1,
            lastUploadAttemptAt: Date.now(),
          })
          throw error
        }
      })
    )
  }

  private async completeUpload(recordingLocalUuid: string): Promise<void> {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (recording.canceledAt) {
      //log
      return
    }
    if (!recording.serverUuid) {
      throw new Error(`Recording ${recordingLocalUuid} serverUuid not found `)
    }
    const token = TokenStorage.token!.access_token
    const orgId = TokenStorage.organizationId!
    this.store.updateRecording(recordingLocalUuid, {
      status: IRecordV3Status.COMPLETING_ON_SERVER,
    })
    try {
      const data = await uploadCompleteCommandV3(
        token,
        orgId,
        recording.serverUuid
      )
      this.store.updateRecording(recordingLocalUuid, {
        status: IRecordV3Status.COMPLETED_ON_SERVER,
        failCounter: 0,
        upload: {
          ...recording.upload,
          status: "completed",
        },
      })
    } catch (error) {
      this.store.updateRecording(recordingLocalUuid, {
        status: IRecordV3Status.COMPLETE,
        failCounter: (recording.failCounter || 0) + 1,
        lastUploadAttemptAt: Date.now(),
      })

      throw error
    }
  }
}
