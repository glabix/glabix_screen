import Store from "electron-store"
import {
  ChunkStatusV3,
  ChunkTypeV3,
  IChunkV3,
  IRecordV3,
  IRecordV3Status,
} from "@main/v3/events/record-v3-types"
import { RecordStoreSchema } from "@main/v3/store/record-store-schema"
import { getTitle } from "@shared/helpers/get-title"
import { getVersion } from "@main/helpers/get-version"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"

const LAST_CREATED_RECORD = "last_created_record"
const RECORDINGS = "recordings"

export class RecordStoreManager {
  store = new Store<RecordStoreSchema>({
    defaults: { recordings: {}, last_created_record: "" },
    name: "screen-recordings-store",
  })
  private logSender = new LogSender()

  // Получение записи
  getRecording(id: string): IRecordV3 | undefined {
    return this.store.get(`${RECORDINGS}.${id}`)
  }

  deleteRecord(recordLocalUuid: string) {
    this.store.delete(`${RECORDINGS}.${recordLocalUuid}`)
  }

  // Обновление записи
  updateRecording(recordLocalUuid: string, update: Partial<IRecordV3>): void {
    this.logSender.sendLog(
      "records.store.update.start",
      stringify({ recordLocalUuid, update: { ...update, chunks: "{...}" } })
    )
    const current = this.getRecording(recordLocalUuid)
    if (!current) throw new Error(`Recording ${recordLocalUuid} not found`)

    const updated = { ...current, ...update, updatedAt: Date.now() }
    this.store.set(`${RECORDINGS}.${recordLocalUuid}`, updated)
    this.logSender.sendLog(
      "records.store.update.complete",
      stringify({ recordLocalUuid, update: { ...update, chunks: "{...}" } })
    )
  }

  private buildRecord(innerUuid: string, dirPath: string): IRecordV3 {
    const timestamp = Date.now()
    const title = getTitle(timestamp)
    const version = getVersion()
    return {
      localUuid: innerUuid,
      createdAt: timestamp,
      updatedAt: timestamp,
      dirPath,
      title,
      version,
      status: IRecordV3Status.PENDING,
      chunks: {},
    }
  }

  createRecording(localUuid: string, dirPath: string) {
    this.logSender.sendLog(
      "records.store.create.success",
      stringify({ localUuid, dirPath })
    )
    const storeData = this.buildRecord(localUuid, dirPath)
    this.store.set(`${RECORDINGS}.${localUuid}`, storeData)
    this.store.set(LAST_CREATED_RECORD, localUuid)
    this.logSender.sendLog("records.store.create.success", stringify(storeData))
  }

  private buildChunk(
    innerRecordUuid: string,
    chunkUuid: string,
    source: string,
    isLast: boolean
  ): IChunkV3 {
    return {
      innerRecordUuid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      uuid: chunkUuid,
      source,
      type: ChunkTypeV3.VIDEO,
      status: ChunkStatusV3.RECORDED,
      isLast,
    }
  }

  createChunk(
    recordLocalUuid: string,
    chunkUuid: string,
    source: string,
    isLast: boolean
  ) {
    this.logSender.sendLog(
      "chunks.store.create.start",
      stringify({ recordLocalUuid, source, isLast })
    )
    const recording = this.getRecording(recordLocalUuid)
    if (!recording) throw new Error(`Recording ${recordLocalUuid} not found`)
    const storeData = this.buildChunk(
      recordLocalUuid,
      chunkUuid,
      source,
      isLast
    )
    const chunks = { ...recording.chunks }
    chunks[chunkUuid] = storeData
    this.updateRecording(recordLocalUuid, { chunks })
    this.logSender.sendLog(
      "chunks.store.create.complete",
      stringify({ storeData })
    )
    return storeData
  }

  // Обновление чанка
  updateChunk(
    recordingLocalUuid: string,
    chunkUuid: string,
    update: Partial<IChunkV3>
  ): void {
    this.logSender.sendLog(
      "chunks.store.update.start",
      stringify({ recordingLocalUuid, chunkUuid, update })
    )
    const recording = this.getRecording(recordingLocalUuid)
    if (!recording) throw new Error(`Recording ${recordingLocalUuid} not found`)

    const chunks = { ...recording.chunks }
    // @ts-ignore
    chunks[chunkUuid] = { ...chunks[chunkUuid], ...update }
    this.updateRecording(recordingLocalUuid, { chunks })
    this.logSender.sendLog(
      "chunks.store.update.complete",
      stringify({ recordingLocalUuid, chunkUuid, update })
    )
  }

  // Получение записей для загрузки
  getRecordings(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS))
  }

  getPriorityRecording(): IRecordV3 | null {
    const now = Date.now()
    const recordings = Object.values(this.store.get(RECORDINGS) || [])

    let maxPriority = -Infinity
    let selectedRecording: IRecordV3 | null = null

    recordings.forEach((recording) => {
      if (recording.canceledAt) {
        return
      }

      const attempts = recording.failCounter || 0
      const delay = getUploadDelay(attempts)
      const updatedAt = recording.lastUploadAttemptAt || recording.createdAt
      const priority = now - updatedAt - delay
      console.log(priority)
      if (priority > 0) {
        if (priority > maxPriority) {
          maxPriority = priority
          selectedRecording = recording
        }
      }
    })

    return selectedRecording
  }

  getCompletedRecordings(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS) || []).filter(
      (r) => r.status === IRecordV3Status.COMPLETED_ON_SERVER
    )
  }

  getCanceledRecords(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS) || []).filter(
      (r) => r.canceledAt
    )
  }

  // Записи без чанков
  getEmptyRecords(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS) || []).filter(
      (r) => !Object.keys(r.chunks).length
    )
  }

  resetLastCreatedRecordCache() {
    this.store.set(LAST_CREATED_RECORD, "")
  }

  getLastCreatedRecordCache() {
    return this.store.get(LAST_CREATED_RECORD)
  }

  getSendingChunks() {
    const allRecordings = this.store.get("recordings") || {}
    const chunks: IChunkV3[] = []

    for (const [recordingLocalUuid, recording] of Object.entries(
      allRecordings
    )) {
      if (!recording.chunks) continue

      for (const [chunkUuid, chunk] of Object.entries(recording.chunks)) {
        if (chunk.status === ChunkStatusV3.SENDING_TO_SERVER) {
          chunks.push(chunk)
        }
      }
    }
    return chunks
  }
}

export function getUploadDelay(attempt: number): number {
  const delays = [
    0, // Первая попытка (0 сек)
    1000 * 10, // 10 сек
    1000 * 20, // 20 сек
    1000 * 20, // 20 сек
    1000 * 40, // 40 сек
    1000 * 60, // 1 мин
    1000 * 60 * 5, // 5 мин
  ]

  // Возвращаем последнюю задержку, если попыток больше чем элементов в массиве
  return delays[Math.min(attempt, delays.length - 1)]!
}
