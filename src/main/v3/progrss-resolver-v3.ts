import { ipcMain } from "electron"
import { FileUploadEvents } from "@shared/events/file-upload.events"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { ChunkStatusV3 } from "@main/v3/events/record-v3-types"
import { IRecordProgressStatus } from "@shared/types/types"

interface IUploadProgressV3Data {
  localUuid: string
  status: IRecordProgressStatus
  chunks: {
    uuid: string
    totalSize: number
    loaded: number
  }[]
}

export class ProgressResolverV3 {
  private state: IUploadProgressV3Data[] = []
  private store: RecordStoreManager

  constructor() {
    this.store = new RecordStoreManager()
  }

  getRecord(localUuid: string) {
    return this.state.find((s) => s.localUuid === localUuid)
  }

  updateRecord(localUuid: string) {
    const recording = this.store.getRecording(localUuid)
    if (!recording) {
      throw new Error(`Recording ${localUuid} not found`)
    }
    const chunks = Object.values(recording.chunks)
    const mappedChunks = chunks.map((c) => {
      const status = c.status
      const totalSize = c.size
      const uuid = c.uuid
      return {
        uuid,
        totalSize,
        loaded: status === ChunkStatusV3.SENT_TO_SERVER ? totalSize : 0,
      }
    })
    let rec = this.state.find((r) => r.localUuid === localUuid)
    if (rec) {
      this.state = this.state.map((s) => {
        if (s.localUuid === localUuid) {
          return {
            ...rec,
            chunks: mappedChunks,
          }
        }
        return s
      })
    } else {
      this.state.push({
        status: IRecordProgressStatus.PENDING,
        localUuid,
        chunks: mappedChunks,
      })
    }
    this.sendData()
  }

  updateChunkData(fileUuid: string, chunkUuid: string, loaded: number) {
    let record = this.getRecord(fileUuid)

    if (!record) {
      this.updateRecord(fileUuid)
      record = this.getRecord(fileUuid)
    }

    this.state = this.state.map((s) => {
      if (s.localUuid === fileUuid) {
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

  completeRecord(fileUuid: string) {
    const record = this.getRecord(fileUuid)

    if (!record) return

    this.state = this.state.map((s) => {
      if (s.localUuid === fileUuid) {
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

  deleteProgressData(fileUuid: string) {
    this.state = this.state.filter((s) => s.localUuid !== fileUuid)
    this.sendData()
  }

  sendData() {
    const response: IUploadProgressV3Data[] = this.state.map((s) => {
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
        chunks: s.chunks,
        localUuid: s.localUuid,
        progress,
      }
    })
    ipcMain.emit(FileUploadEvents.UPLOAD_PROGRESS_STATUS, null, response)
  }
}
