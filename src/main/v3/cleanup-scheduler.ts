import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { StorageManagerV3 } from "@main/v3/storage-manager-v3"

export class CleanupScheduler {
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
      60 * 1000 * 5
    ) //5 min
    // only on start
    this.cleanupCompleted()
    this.cleanupCanceled()
    this.cleanupEmpty()
    this.store.resetLastCreatedRecordCache()
  }

  stop() {
    clearInterval(this.interval)
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
    const canceledOnServerRecords = this.store.getCanceledOnServerRecords()

    await Promise.all(
      canceledOnServerRecords.map((recording) =>
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
}
