import { v4 as uuidv4 } from "uuid"
import { ChunkManagerV3 } from "./chunk-manager-v3"
import { StorageManagerV3 } from "./storage-manager-v3"
import {
  IRecordV3,
  IRecordV3Status,
  RecordCancelEventV3,
  RecordDataEventV3,
  RecordEventV3,
} from "./events/record-v3-types"
import { RecordEventsV3 } from "./events/record-v3-events"
import eStore from "@main/helpers/electron-store.helper"
import { getTitle } from "@shared/helpers/get-title"
import { getVersion } from "@main/helpers/get-version"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { ServerUploadManager } from "@main/v3/server-upload-manager"

export class RecorderFacadeV3 {
  private chunkManager = new ChunkManagerV3()
  private storage = new StorageManagerV3()
  private store: RecordStoreManager
  private uploadManager: ServerUploadManager
  constructor() {
    this.store = new RecordStoreManager()
    this.uploadManager = new ServerUploadManager(this.store)

    // Автоматическая проверка очереди при изменениях
    this.store.store.onDidAnyChange(() => {
      this.uploadManager.processQueue()
    })
  }
  async handleEvent(event: RecordEventV3): Promise<string | void> {
    switch (event.type) {
      case RecordEventsV3.START:
        return this.handleStart()
      case RecordEventsV3.SEND_DATA:
        await this.handleData(event)
        break
      case RecordEventsV3.CANCEL:
        await this.handleCancel(event)
        break
      default:
        throw new Error("Unknown event type")
    }
  }

  private async handleStart(): Promise<string> {
    const innerRecordUuid = uuidv4()

    const dirPath = await this.storage.prepareDirectory(innerRecordUuid)
    this.store.createRecording(innerRecordUuid, dirPath)
    this.chunkManager.startNewRecording(innerRecordUuid)
    return innerRecordUuid
  }

  private async handleData(event: RecordDataEventV3): Promise<void> {
    try {
      await this.chunkManager.handleDataEvent(event)
    } catch (error) {
      // Добавляем дополнительный контекст к ошибке
      // @ts-ignore
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
}
