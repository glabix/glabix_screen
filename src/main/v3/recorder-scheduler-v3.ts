import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { StorageManagerV3 } from "@main/v3/storage-manager-v3"
import { TokenStorage } from "@main/storages/token-storage"
import { deleteUploadCommand } from "@main/commands/v3/delete-upload.command"
import { ChunkStatusV3, IRecordV3Status } from "@main/v3/events/record-v3-types"
import axios, { AxiosError } from "axios"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"

export class RecorderSchedulerV3 {
  private interval: NodeJS.Timeout | null = null
  private storage = new StorageManagerV3()
  private store = new RecordStoreManager()
  private logSender = new LogSender()

  constructor() {}

  start() {
    this.logSender.sendLog("utils.recorder_scheduler.start")
    this.startIntervals()

    // only on start
    this.cleanupEmpty()
    this.resetRecords()
    this.resetChunks()
    this.setIsLastForLastChunk()

    this.cleanupCompleted()
    this.cleanupCanceled()
    this.store.resetLastCreatedRecordCache()
  }

  stopIntervals() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  startIntervals() {
    this.logSender.sendLog("utils.recorder_scheduler.startIntervals")
    this.interval = setInterval(
      () => {
        this.cleanupCompleted()
        this.cleanupCanceled()
      },
      60 * 1000 * 5 //5 min
    )
  }

  private async resetRecords() {
    this.logSender.sendLog("utils.recorder_scheduler.resetRecords.start")
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

  private setIsLastForLastChunk() {
    this.logSender.sendLog(
      "utils.recorder_scheduler.setIsLastForLastChunk.start"
    )
    const recordings = this.store.getRecordings()
    for (const recording of recordings) {
      const chunks = Object.values(recording.chunks)
      if (!chunks.length) {
        continue
      }
      if (chunks.find((c) => c.isLast)) {
        continue
      }
      const lastChunk = chunks[chunks.length - 1]!
      this.store.updateChunk(recording.localUuid, lastChunk.uuid, {
        isLast: true,
      })
    }
  }

  private resetChunks() {
    this.logSender.sendLog("utils.recorder_scheduler.resetChunks.start")
    const sendingChunks = this.store.getSendingChunks()
    for (const chunk of sendingChunks) {
      this.store.updateChunk(chunk.innerRecordUuid, chunk.uuid, {
        status: ChunkStatusV3.RECORDED,
      })
    }
  }

  private async cleanupCompleted(): Promise<void> {
    this.logSender.sendLog("utils.recorder_scheduler.cleanupCompleted.start")
    const completed = this.store.getCompletedRecordings()

    await Promise.all(
      completed.map((recording) =>
        this.storage.cleanupRecord(recording.localUuid)
      )
    )
  }

  private async cleanupCanceled(): Promise<void> {
    this.logSender.sendLog("utils.recorder_scheduler.cleanupCanceled.start")
    const canceledOnServerRecords = this.store.getCanceledRecords()
    const filteredCanceledRecords = canceledOnServerRecords.filter(
      (c) => Date.now() - c.canceledAt! > 1000 * 30
    ) // записи отмененные больше 30 секунд назад
    await Promise.all(
      // Удаляем с сервера
      filteredCanceledRecords
        .filter((r) => r.serverUuid)
        .map((recording) => this.cancelRecordOnServer(recording.localUuid))
    )
    await Promise.all(
      // Удалям с диска и из стора
      filteredCanceledRecords.map((recording) =>
        this.storage.cleanupRecord(recording.localUuid)
      )
    )
  }

  private async cleanupEmpty(): Promise<void> {
    this.logSender.sendLog("utils.recorder_scheduler.cleanupEmpty.start")
    const empty = this.store.getEmptyRecords()

    await Promise.all(
      empty.map((recording) => this.storage.cleanupRecord(recording.localUuid))
    )
  }

  private async cancelRecordOnServer(recordingLocalUuid: string) {
    this.logSender.sendLog(
      "utils.recorder_scheduler.cancelRecordOnServer.start"
    )
    const recording = this.store.getRecording(recordingLocalUuid)
    if (!recording) {
      throw new Error(`Recording ${recordingLocalUuid} not found`)
    }
    if (!recording.serverUuid) {
      // log
      return recordingLocalUuid
    }
    const token = TokenStorage.token!.access_token
    const orgId = TokenStorage.organizationId!
    try {
      const data = await deleteUploadCommand(token, orgId, recording.serverUuid)
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error
      const typedError = error as AxiosError
      if (
        typedError.response?.status === 404 &&
        typedError.response?.data?.code === "upload_not_found"
      ) {
        return recordingLocalUuid
      }
      throw error
    }
    return recordingLocalUuid
  }
}
