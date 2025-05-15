import fs from "fs/promises"
import path from "path"
import { ChunkPart, ChunkStatusV3 } from "@main/v3/events/record-v3-types"
import { app } from "electron"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"

const MAX_CHUNK_SIZE = 10 * 1024 * 1024 // 10 MB

// StorageManager отвечает ТОЛЬКО за работу с файлами
export class StorageManagerV3 {
  baseDir = path.join(app.getPath("userData"), "recordsV3")
  private store: RecordStoreManager
  constructor() {
    this.store = new RecordStoreManager()
  }
  async prepareDirectory(uuid: string): Promise<string> {
    const dirPath = path.join(this.baseDir, uuid)
    await fs.mkdir(dirPath, { recursive: true })
    return dirPath
  }

  async saveChunkPart(
    directory: string,
    timestamp: number,
    chunkPart: ChunkPart
  ): Promise<string> {
    const fileName = `${timestamp}_${chunkPart.partIndex}.bin`
    const filePath = path.join(directory, fileName)

    try {
      await fs.writeFile(filePath, chunkPart.data)
    } catch (error) {
      // @ts-ignore
      throw new Error(`Failed to save chunk part ${fileName}: ${error.message}`)
    }
    return filePath
  }

  splitChunk(data: Buffer): ChunkPart[] {
    const parts: ChunkPart[] = []
    const totalParts = Math.ceil(data.length / MAX_CHUNK_SIZE)

    for (let i = 0; i < totalParts; i++) {
      const start = i * MAX_CHUNK_SIZE
      const end = Math.min((i + 1) * MAX_CHUNK_SIZE, data.length)
      const partData = data.subarray(start, end)

      parts.push({
        data: partData,
        partIndex: i,
        isLastPart: i === totalParts - 1,
      })
    }

    return parts
  }

  async cleanupRecord(recordingUuid: string): Promise<void> {
    const recording = this.store.getRecording(recordingUuid)
    console.log(recording.localUuid)
    if (recording?.dirPath) {
      try {
        await fs.rm(recording.dirPath, { recursive: true, force: true })
      } catch (error) {
        console.error(`Cleanup failed for ${recordingUuid}:`, error)
      }
    }
    this.store.deleteRecord(recordingUuid)
  }
}
