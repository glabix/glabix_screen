import { ChunkStatus } from "../database/models/Chunk"
import { getByUuidRecordDal } from "../database/dal/Record"
import {
  IRecordProgressStatus,
  IRecordUploadProgressData,
} from "../shared/types/types"
import { ipcMain } from "electron"
import { FileUploadEvents } from "@shared/events/file-upload.events"

interface IUploadProgressData {
  uuid: string
  status: IRecordProgressStatus
  chunks: {
    uuid: string
    totalSize: number
    loaded: number
  }[]
}

export class ProgressResolver {
  static state: IUploadProgressData[] = []

  static getRecord(uuid: string) {
    return this.state.find((s) => s.uuid === uuid)
  }

  static async createRecord(uuid: string) {
    const record = await getByUuidRecordDal(uuid)
    const chunks = record.getDataValue("Chunks") || []
    const mappedChunks = chunks.map((c) => {
      const status = c.getDataValue("status")
      const size = c.getDataValue("size")
      return {
        uuid: c.getDataValue("uuid"),
        totalSize: c.getDataValue("size"),
        loaded: status === ChunkStatus.LOADED ? size : 0,
      }
    })
    this.state.push({
      status: IRecordProgressStatus.PENDING,
      uuid: uuid,
      chunks: mappedChunks,
    })
    this.sendData()
  }

  static async updateChunkData(
    fileUuid: string,
    chunkUuid: string,
    loaded: number
  ) {
    const record = this.getRecord(fileUuid)

    if (!record) return

    this.state = this.state.map((s) => {
      if (s.uuid === fileUuid) {
        return {
          ...s,
          status: IRecordProgressStatus.LOADING,
          chunks: s.chunks.map((c) => {
            if (c.uuid === chunkUuid) {
              return {
                ...c,
                loaded: loaded,
              }
            }
            return c
          }),
        }
      }
      return s
    })
    this.sendData()
  }

  static async completeRecord(fileUuid: string) {
    const record = this.getRecord(fileUuid)

    if (!record) return

    this.state = this.state.map((s) => {
      if (s.uuid === fileUuid) {
        return {
          ...s,
          status: IRecordProgressStatus.COMPLETE,
        }
      }
      return s
    })
    this.sendData()

    setTimeout(() => {
      this.deleteProgressData(fileUuid)
    }, 3 * 1000)
  }

  static async deleteProgressData(fileUuid: string) {
    this.state = this.state.filter((s) => s.uuid !== fileUuid)
    this.sendData()
  }

  static sendData() {
    const response: IRecordUploadProgressData[] = this.state.map((s) => {
      const size = s.chunks.reduce(
        (accumulator, chunk) => accumulator + chunk.totalSize,
        0
      )
      const loaded = s.chunks.reduce(
        (accumulator, chunk) => accumulator + chunk.loaded,
        0
      )
      const progress = size ? Math.round((loaded / size) * 100) : 0
      return {
        status: s.status,
        uuid: s.uuid,
        progress,
      }
    })
    ipcMain.emit(FileUploadEvents.UPLOAD_PROGRESS_STATUS, response)
  }
}
