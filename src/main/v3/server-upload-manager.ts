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
import { ProgressResolverV3 } from "@main/v3/progrss-resolver-v3"
import { LogSender } from "@main/helpers/log-sender"
import { AxiosRequestConfig } from "axios"

export class ServerUploadManager {
  isSleep = false
  private store: RecordStoreManager
  private storage: StorageManagerV3
  private isProcessing = false
  private openLibraryPageHandler = new OpenLibraryPageHandler()
  private progressResolverV3 = new ProgressResolverV3()
  private logSender = new LogSender()

  constructor(
    store: RecordStoreManager,
    storage: StorageManagerV3,
    progressResolverV3: ProgressResolverV3
  ) {
    this.store = store
    this.storage = storage
    this.progressResolverV3 = progressResolverV3

    setInterval(() => this.processQueue("interval"), 5000) // Проверка каждые 5 сек
  }

  async processQueue(from: string): Promise<void> {
    if (
      this.isSleep ||
      this.isProcessing ||
      !TokenStorage.token?.access_token
    ) {
      return
    }
    this.isProcessing = true
    try {
      const recordForProcessing = this.store.getPriorityRecording()
      if (recordForProcessing) {
        this.logSender.sendLog(
          "records.process_recordings.recordForProcessing",
          JSON.stringify({ from, localUuid: recordForProcessing.localUuid })
        )
        await this.processRecording(recordForProcessing)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async processRecording(recording: IRecordV3): Promise<void> {
    this.logSender.sendLog(
      "records.process_recordings.start",
      JSON.stringify({ localUuid: recording.localUuid })
    )
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
        Date.now() - recording.createdAt > 1000 * 5 // запись старше 5 секунд
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
      this.logSender.sendLog(
        "records.process_recordings.error",
        JSON.stringify({ localUuid: recording.localUuid, error })
      )
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
    this.logSender.sendLog(
      "records.process_recordings.init_upload.start",
      JSON.stringify({ localUuid: recordingLocalUuid })
    )
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (recording.canceledAt) {
      return
    }
    const token = TokenStorage.token!.access_token
    const filename = recording.title + ".mp4"
    let preview: null | File = null
    try {
      preview = await this.storage.readPreview(recordingLocalUuid)
    } catch (e) {
      this.logSender.sendLog(
        "records.process_recordings.init_upload.preview.error",
        JSON.stringify({ localUuid: recordingLocalUuid, e })
      )
    }
    this.store.updateRecording(recordingLocalUuid, {
      status: IRecordV3Status.CREATING_ON_SERVER,
      lastUploadAttemptAt: Date.now(),
    })
    try {
      this.logSender.sendLog(
        "records.process_recordings.init_upload.send",
        JSON.stringify({
          token,
          orgId: recording.orgId,
          filename,
          title: recording.title,
          version: recording.version,
          isPreview: !!preview,
          cropData: recording.cropData,
        })
      )
      const { data } = await initUploadCommandV3(
        token,
        recording.orgId,
        filename,
        recording.title,
        recording.version,
        preview,
        recording.cropData
      )
      this.logSender.sendLog(
        "records.process_recordings.init_upload.success",
        JSON.stringify({ localUuid: recordingLocalUuid, data })
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
      })
      throw error
    }
    this.openLibraryPageHandler.checkToOpenLibraryPage(recording.localUuid)
  }

  private async uploadChunks(recordingLocalUuid: string): Promise<void> {
    this.logSender.sendLog(
      "records.process_recordings.uploadChunks.start",
      JSON.stringify({ localUuid: recordingLocalUuid })
    )
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
    if (
      !chunksToUpload.length &&
      this.store.getLastCreatedRecordCache() !== recording.localUuid
    ) {
      this.store.updateRecording(recordingLocalUuid, {
        failCounter: (recording.failCounter || 0) + 1,
        lastUploadAttemptAt: Date.now(),
      })
    }
    await Promise.all(
      chunksToUpload.map(async ([chunkUuid, chunk]) => {
        try {
          const token = TokenStorage.token!.access_token
          const buffer = await fs.promises.readFile(chunk.videoSource)
          this.store.updateRecording(recordingLocalUuid, {
            lastUploadAttemptAt: Date.now(),
          })
          this.store.updateChunk(recordingLocalUuid, chunkUuid, {
            status: ChunkStatusV3.SENDING_TO_SERVER,
          })
          this.logSender.sendLog(
            "records.process_recordings.uploadChunks.send",
            JSON.stringify({
              token,
              orgId: recording.orgId,
              serverUuid: recording.serverUuid,
              size: buffer.length,
            })
          )
          const config: AxiosRequestConfig = {
            onUploadProgress: (progressEvent) => {
              if (Object.values(recording.chunks).find((c) => c.isLast)) {
                this.progressResolverV3.updateChunkData(
                  recording.localUuid,
                  chunkUuid,
                  progressEvent.loaded
                )
              }
            },
          }
          const res = await submitUploadPartCommandV3(
            token,
            recording.orgId,
            recording.serverUuid!,
            buffer,
            chunk.index.toString(),
            config
          )
          if (Object.values(recording.chunks).find((c) => c.isLast)) {
            this.progressResolverV3.updateChunkData(
              recording.localUuid,
              chunkUuid,
              chunk.size
            )
          }
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
          })
          throw error
        }
      })
    )
  }

  private async completeUpload(recordingLocalUuid: string): Promise<void> {
    this.logSender.sendLog(
      "records.process_recordings.completeUpload.start",
      JSON.stringify({ localUuid: recordingLocalUuid })
    )
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
    this.store.updateRecording(recordingLocalUuid, {
      status: IRecordV3Status.COMPLETING_ON_SERVER,
      lastUploadAttemptAt: Date.now(),
    })
    try {
      this.logSender.sendLog(
        "records.process_recordings.completeUpload.send",
        JSON.stringify({
          token,
          orgId: recording.orgId,
          serverUuid: recording.serverUuid,
        })
      )
      const data = await uploadCompleteCommandV3(
        token,
        recording.orgId,
        recording.serverUuid
      )
      this.progressResolverV3.completeRecord(recordingLocalUuid)
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
      })

      throw error
    }
  }
}
