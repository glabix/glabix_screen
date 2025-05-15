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
import { deleteUploadCommand } from "@main/commands/v3/delete-upload.command"

export class ServerUploadManager {
  private store: RecordStoreManager
  private isProcessing = false
  private openLibraryPageHandler = new OpenLibraryPageHandler()

  constructor(store: RecordStoreManager) {
    this.store = store

    setInterval(() => this.processQueue(), 5000) // Проверка каждые 5 сек
  }

  async processQueue(): Promise<void> {
    console.log("processQueue")
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
    try {
      // 1. Инициализация загрузки
      if (!recording.upload) {
        this.store.updateRecording(recording.localUuid, {
          upload: { status: "pending" },
        })
        return
      }

      // 2. Создание мультипарт загрузкиs
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
    console.log("initUpload")
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (recording.canceledAt) {
      console.log(recording.canceledAt)
      return
    }
    const token = TokenStorage.token!.access_token
    const orgId = TokenStorage.organizationId
    const filename = recording.title + ".mp4"

    this.store.updateRecording(recordingLocalUuid, {
      status: IRecordV3Status.CREATING_ON_SERVER,
    })
    const { data } = await initUploadCommandV3(
      token,
      orgId!,
      filename,
      recording.title,
      recording.version,
      recording.cropData
    )
    this.store.updateRecording(recordingLocalUuid, {
      status: IRecordV3Status.CREATED_ON_SERVER,
      serverUuid: data.uuid,
    })
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
          const formData = new FormData()
          // formData.append('file', fs.createReadStream(chunk.source));

          formData.append("uploadId", recording.upload!.uploadId!)
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
        } catch (error) {
          this.store.updateChunk(recordingLocalUuid, chunkUuid, {
            status: ChunkStatusV3.RECORDED,
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
        upload: {
          ...recording.upload,
          status: "completed",
          completedAt: Date.now(),
        },
      })
    } catch (error) {
      this.store.updateRecording(recordingLocalUuid, {
        status: IRecordV3Status.COMPLETE,
      })
      throw error
    }
  }
}
