import fs from "fs/promises"
import path from "path"
import { ChunkPart } from "@main/v3/events/record-v3-types"
import { app } from "electron"
import { RecordStoreManager } from "@main/v3/store/record-store-manager"
import { fsErrorParser } from "@main/helpers/fs-error-parser"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"

const MAX_CHUNK_SIZE = 10 * 1024 * 1024 // 10 MB

// StorageManager отвечает ТОЛЬКО за работу с файлами
export class StorageManagerV3 {
  baseDir = path.join(app.getPath("userData"), "recordsV3")
  private store: RecordStoreManager
  private logSender = new LogSender()

  constructor() {
    this.store = new RecordStoreManager()
  }
  async prepareDirectory(uuid: string): Promise<string> {
    const dirPath = path.join(this.baseDir, uuid)
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (error) {
      fsErrorParser(error, dirPath)
    }
    return dirPath
  }

  async saveChunkPart(
    directory: string,
    timestamp: number,
    chunkPart: ChunkPart
  ): Promise<string> {
    const fileName = `${timestamp}_${chunkPart.partIndex}.bin`
    const filePath = path.join(directory, fileName)
    this.logSender.sendLog("storage.chunk.save.start", stringify({ filePath }))
    try {
      await fs.writeFile(filePath, chunkPart.data)
    } catch (error) {
      this.logSender.sendLog(
        "storage.chunk.save.error",
        stringify({ error }),
        true
      )
      fsErrorParser(error, filePath)
      // @ts-ignore
      throw new Error(`Failed to save chunk part ${fileName}: ${error.message}`)
    }
    this.logSender.sendLog(
      "storage.chunk.save.completed",
      stringify({ filePath })
    )
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
    if (recording?.dirPath) {
      try {
        await fs.rm(recording.dirPath, { recursive: true, force: true })
      } catch (error) {
        console.error(`Cleanup failed for ${recordingUuid}:`, error)
      }
    }
    this.store.deleteRecord(recordingUuid)
  }

  async savePreview(
    recordingInnerUuid: string,
    previewData: ArrayBuffer | string
  ): Promise<string> {
    const previewDir = path.join(this.baseDir, recordingInnerUuid, "preview")
    await fs.mkdir(previewDir, { recursive: true })

    const previewPath = path.join(previewDir, "preview.png")
    const data =
      typeof previewData === "string"
        ? Buffer.from(previewData, "base64")
        : Buffer.from(previewData)

    await fs.writeFile(previewPath, data)

    this.store.updateRecording(recordingInnerUuid, {
      previewPath,
      previewGeneratedAt: Date.now(),
    })

    return previewPath
  }

  async readPreview(recordingInnerUuid: string): Promise<File | null> {
    const recording = this.store.getRecording(recordingInnerUuid)
    if (!recording?.previewPath) return null

    try {
      const data = await fs.readFile(recording.previewPath)
      return new File([data], "preview.png", { type: "image/png" })
    } catch (error) {
      console.error(`Failed to read preview for ${recordingInnerUuid}:`, error)
      return null
    }
  }

  async deletePreview(recordingId: string): Promise<void> {
    const recording = this.store.getRecording(recordingId)
    if (!recording?.previewPath) return

    try {
      await fs.rm(recording.previewPath, { force: true })
      this.store.updateRecording(recordingId, {
        previewPath: null,
      })
    } catch (error) {
      console.error(`Failed to delete preview for ${recordingId}:`, error)
    }
  }
}
