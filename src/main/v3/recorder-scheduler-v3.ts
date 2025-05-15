import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { StorageManagerV3 } from "@main/v3/storage-manager-v3"
import { TokenStorage } from "@main/storages/token-storage"
import { deleteUploadCommand } from "@main/commands/v3/delete-upload.command"
import { ChunkStatusV3, IRecordV3Status } from "@main/v3/events/record-v3-types"

export class RecorderSchedulerV3 {
  private interval: NodeJS.Timeout
  private storage = new StorageManagerV3()
  private store = new RecordStoreManager()
  constructor() {}

  start() {
    this.interval = setInterval(
      () => {
        this.cleanupCompleted()
        this.cleanupCanceled()
      },
      5 * 1000
      // 60 * 1000 * 5 //5 min
    )

    // only on start
    this.cleanupEmpty()
    this.resetRecords()
    this.resetChunks()

    this.cleanupCompleted()
    this.cleanupCanceled()
    this.store.resetLastCreatedRecordCache()
  }

  stop() {
    clearInterval(this.interval)
  }

  private async resetRecords() {
    const recordings = this.store.getRecordings()
    for (const record of recordings) {
      if (record.status === IRecordV3Status.CREATING_ON_SERVER) {
        this.store.updateRecording(record.localUuid, {
          status: IRecordV3Status.PENDING,
        })
      }
      if (record.status === IRecordV3Status.COMPLETING_ON_SERVER) {
        this.store.updateRecording(record.localUuid, {
          status: IRecordV3Status.COMPLETE,
        })
      }
    }
  }

  private resetChunks() {
    const sendingChunks = this.store.getSendingChunks()
    for (const chunk of sendingChunks) {
      this.store.updateChunk(chunk.innerRecordUuid, chunk.uuid, {
        status: ChunkStatusV3.RECORDED,
      })
    }
  }

  private async cleanupCompleted(): Promise<void> {
    const completed = this.store.getCompletedRecordings()

    await Promise.all(
      completed.map((recording) =>
        this.storage.cleanupRecord(recording.localUuid)
      )
    )
  }

  private async cleanupCanceled(): Promise<void> {
    const canceledOnServerRecords = this.store.getCanceledRecords()
    const filteredCanceledRecords = canceledOnServerRecords.filter(
      (c) => Date.now() - c.canceledAt! > 1000 * 30
    ) // записи отмененные больше 30 секунд назад
    console.log(filteredCanceledRecords)
    await Promise.all(
      // Удаляем с сервера
      filteredCanceledRecords
        .filter((r) => r.serverUuid)
        .map((recording) => this.cancelRecordOnServer(recording.localUuid))
    )
    console.log(123)
    await Promise.all(
      // Удалям с диска и из стора
      filteredCanceledRecords.map((recording) =>
        this.storage.cleanupRecord(recording.localUuid)
      )
    )
  }

  private async cleanupEmpty(): Promise<void> {
    const empty = this.store.getEmptyRecords()

    await Promise.all(
      empty.map((recording) => this.storage.cleanupRecord(recording.localUuid))
    )
  }

  private async cancelRecordOnServer(recordingLocalUuid: string) {
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (!recording.serverUuid) {
      // log
      return
    }
    const token = TokenStorage.token!.access_token
    const orgId = TokenStorage.organizationId!
    try {
      const data = await deleteUploadCommand(token, orgId, recording.serverUuid)
    } catch (error) {
      throw error
    }
  }
}
