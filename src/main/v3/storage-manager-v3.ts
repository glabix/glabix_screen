import fs from "fs"
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
      await fs.promises.mkdir(dirPath, { recursive: true })
    } catch (error) {
      fsErrorParser(error, dirPath)
    }
    return dirPath
  }

  async cleanupRecord(recordingUuid: string): Promise<void> {
    this.logSender.sendLog(
      "storage_manager.cleanup_record.start",
      JSON.stringify({ recordingUuid })
    )
    const recording = this.store.getRecording(recordingUuid)
    if (recording?.dirPath) {
      try {
        await fs.promises.rm(recording.dirPath, {
          recursive: true,
          force: true,
        })
      } catch (error) {
        this.logSender.sendLog(
          "storage_manager.cleanup_record.error",
          JSON.stringify({ error }),
          true
        )
      }
    }
    this.store.deleteRecord(recordingUuid)
  }

  private dataUrlToBuffer(dataUrl: string): Buffer {
    // Разделяем dataURL на метаданные и данные
    const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/)
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid dataURL format")
    }

    const base64Data = matches[2] // Берём только часть с Base64 данными
    return Buffer.from(base64Data, "base64") // Преобразуем Base64 в Buffer
  }

  async savePreview(
    recordingInnerUuid: string,
    previewData: string
  ): Promise<string> {
    const previewDir = path.join(this.baseDir, recordingInnerUuid, "preview")
    await fs.promises.mkdir(previewDir, { recursive: true })
    const buffer = this.dataUrlToBuffer(previewData)

    const previewPath = path.join(previewDir, "preview.png")
    const data = Buffer.from(previewData, "base64")

    await fs.promises.writeFile(previewPath, buffer)

    this.store.updateRecording(recordingInnerUuid, {
      previewPath,
      previewGeneratedAt: Date.now(),
    })

    return previewPath
  }

  async writeFile(source: string, buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(source, { flags: "a" })
      writeStream.write(buffer, (err) => {
        if (err) {
          fsErrorParser(err, source)
          return reject(err)
        }
      })
      writeStream.end()
      writeStream.on("finish", resolve)
      writeStream.on("error", (err) => {
        fsErrorParser(err, source)
        reject(err)
      })
    })
  }

  async readPreview(recordingInnerUuid: string): Promise<File | null> {
    const recording = this.store.getRecording(recordingInnerUuid)
    if (!recording?.previewPath) return null

    try {
      const data = await fs.promises.readFile(recording.previewPath)
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
      await fs.promises.rm(recording.previewPath, { force: true })
      this.store.updateRecording(recordingId, {
        previewPath: null,
      })
    } catch (error) {
      console.error(`Failed to delete preview for ${recordingId}:`, error)
    }
  }
}
