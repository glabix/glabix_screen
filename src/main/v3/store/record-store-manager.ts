import Store from "electron-store"
import {
  ChunkTypeV3,
  IChunkStatusV3,
  IChunkV3,
  IRecordV3,
  IRecordV3Status,
} from "@main/v3/events/record-v3-types"
import { RecordStoreSchema } from "@main/v3/store/record-store-schema"
import { getTitle } from "@shared/helpers/get-title"
import { getVersion } from "@main/helpers/get-version"

const LAST_CREATED_RECORD = "last_created_record"
const RECORDINGS = "recordings"

export class RecordStoreManager {
  store = new Store<RecordStoreSchema>({
    defaults: { recordings: {}, last_created_record: "" },
    name: "screen-recordings-store",
  })

  // Получение записи
  getRecording(id: string): IRecordV3 | undefined {
    return this.store.get(`${RECORDINGS}.${id}`)
  }

  deleteRecord(recordLocalUuid: string) {
    this.store.delete(`${RECORDINGS}.${recordLocalUuid}`)
  }

  // Обновление записи
  updateRecording(recordLocalUuid: string, update: Partial<IRecordV3>): void {
    const current = this.getRecording(recordLocalUuid)
    if (!current) throw new Error(`Recording ${recordLocalUuid} not found`)

    const updated = { ...current, ...update, updatedAt: Date.now() }
    this.store.set(`${RECORDINGS}.${recordLocalUuid}`, updated)
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
    const storeData = this.buildRecord(localUuid, dirPath)
    this.store.set(`${RECORDINGS}.${localUuid}`, storeData)
    this.store.set(LAST_CREATED_RECORD, localUuid)
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
      status: IChunkStatusV3.RECORDED,
      isLast,
    }
  }

  createChunk(
    recordLocalUuid: string,
    chunkUuid: string,
    source: string,
    isLast: boolean
  ) {
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

    return storeData
  }

  // Обновление чанка
  updateChunk(
    recordingLocalUuid: string,
    chunkUuid: string,
    update: Partial<IChunkV3>
  ): void {
    const recording = this.getRecording(recordingLocalUuid)
    if (!recording) throw new Error(`Recording ${recordingLocalUuid} not found`)

    const chunks = { ...recording.chunks }
    // @ts-ignore
    chunks[chunkUuid] = { ...chunks[chunkUuid], ...update }

    this.updateRecording(recordingLocalUuid, { chunks })
  }

  // Получение записей для загрузки
  getUploadQueue(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS))
  }

  // Получение приоритетной записи для загрузки
  getPriorityRecording(): IRecordV3 | null {
    const recordings = Object.values(this.store.get(RECORDINGS) || [])

    return recordings.sort((a, b) => b.createdAt - a.createdAt)[0] || null
  }

  getCompletedRecordings(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS) || []).filter(
      (r) => r.status === IRecordV3Status.COMPLETED_ON_SERVER
    )
  }

  getCanceledOnServerRecords(): IRecordV3[] {
    return Object.values(this.store.get(RECORDINGS) || []).filter(
      (r) => r.status === IRecordV3Status.CANCELED_ON_SERVER
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
}
