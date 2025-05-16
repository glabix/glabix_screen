import { v4 as uuidv4 } from "uuid"
import { ChunkManagerV3 } from "./chunk-manager-v3"
import { StorageManagerV3 } from "./storage-manager-v3"
import {
  RecordCancelEventV3,
  RecordDataEventV3,
  RecordEventV3,
  RecordSetCropDataEventV3,
} from "./events/record-v3-types"
import { RecordEventsV3 } from "./events/record-v3-events"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { ServerUploadManager } from "@main/v3/server-upload-manager"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"

export class RecorderFacadeV3 {
  private chunkManager = new ChunkManagerV3()
  private storage = new StorageManagerV3()
  private store: RecordStoreManager
  private uploadManager: ServerUploadManager
  private logSender = new LogSender()

  constructor() {
    this.store = new RecordStoreManager()
    this.uploadManager = new ServerUploadManager(this.store, this.storage)

    // Автоматическая проверка очереди при изменениях
    this.store.store.onDidAnyChange(() => {
      setTimeout(() => {
        this.uploadManager.processQueue()
      })
    })
  }
  async handleEvent(event: RecordEventV3): Promise<string | void> {
    switch (event.type) {
      case RecordEventsV3.START:
        return this.handleStart()
      case RecordEventsV3.SEND_DATA:
        await this.handleChunk(event)
        break
      case RecordEventsV3.CANCEL:
        await this.handleCancel(event)
        break
      case RecordEventsV3.SET_CROP_DATA:
        return this.handleCropData(event)
      default:
        throw new Error("Unknown event type")
    }
  }

  private async handleStart(): Promise<string> {
    const innerRecordingUuid = uuidv4()
    const dirPath = await this.storage.prepareDirectory(innerRecordingUuid)
    this.logSender.sendLog(
      "records.create.started",
      stringify({ innerRecordUuid: innerRecordingUuid })
    )

    this.store.createRecording(innerRecordingUuid, dirPath)

    this.logSender.sendLog(
      "records.create.completed",
      stringify({ innerRecordUuid: innerRecordingUuid })
    )
    this.chunkManager.startNewRecording(innerRecordingUuid)
    return innerRecordingUuid
  }

  private async handleChunk(event: RecordDataEventV3): Promise<void> {
    this.logSender.sendLog("records.chunks.handle.start", stringify(event))
    try {
      await this.chunkManager.handleDataEvent(event)
    } catch (error) {
      // Добавляем дополнительный контекст к ошибке
      // @ts-ignore
      this.logSender.sendLog(
        "records.chunks.handle.error",
        stringify(error),
        true
      )
      throw new Error(`Failed to process data event: ${error.message}`)
    }
  }

  private async handleCancel(event: RecordCancelEventV3): Promise<void> {
    try {
      await this.chunkManager.cancelRecording(event.innerFileUuid)
    } catch (error) {
      // @ts-ignore
      console.error(`Error during cancel: ${error.message}`)
      // Пробрасываем ошибку дальше, если нужно
      throw error
    }
  }

  private async handleCropData(event: RecordSetCropDataEventV3) {
    const { innerFileUuid, cropVideoData } = event
    try {
      const recording = this.store.getRecording(innerFileUuid)
      if (!recording) {
        throw new Error(`Recording ${innerFileUuid} not found`)
      }
      this.store.updateRecording(innerFileUuid, { cropData: cropVideoData })
    } catch (error) {}
  }

  async handlePreview(
    recordingInnerUuid: string,
    previewData: ArrayBuffer
  ): Promise<void> {
    try {
      await this.storage.savePreview(recordingInnerUuid, previewData)
    } catch (error) {
      console.error("Failed to save preview:", error)
    }
  }

  async getPreview(recordingId: string): Promise<string | null> {
    return this.storage.readPreview(recordingId)
  }
}
