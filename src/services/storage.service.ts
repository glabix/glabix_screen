import { getVersion } from "../main/helpers/get-version"
import { getTitle } from "../shared/helpers/get-title"
import Record, { RecordStatus } from "../database/models/Record"
import path from "path"
import fs from "fs"
import { fsErrorParser } from "../main/helpers/fs-error-parser"
import ChunkService from "./chunk.service"
import { app } from "electron"
import Chunk, {
  ChunkCreationAttributes,
  ChunkStatus,
} from "../database/models/Chunk"
import { createChunkDal, updateChunkDal } from "../database/dal/Chunk"
import { createRecordDal } from "../database/dal/Record"

class StorageService {
  static storagePath = path.join(app.getPath("userData"), "ChunkStorage")

  static async startRecord(): Promise<Record> {
    const title = getTitle(Date.now())
    const version = getVersion()
    return createRecordDal({
      title,
      version,
      status: RecordStatus.RECORDING,
    })
  }

  static async addChunk(fileUuid: string, blob: Blob) {
    console.log("addChunk", fileUuid)
    const buffer = Buffer.from(await blob.arrayBuffer())
    console.log(123)
    const chunk = await createChunkDal({
      fileUuid,
      size: buffer.byteLength,
      status: ChunkStatus.SAVING,
    })
    console.log(chunk)
    const source = path.join(this.storagePath, chunk.getDataValue("uuid"))
    fs.mkdirSync(this.storagePath, { recursive: true })
    const writePromise = new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(source, { flush: true })

      writeStream.write(buffer, (err) => {
        if (err) {
          console.error("Ошибка при записи чанка:", err)
          fsErrorParser(err, source)
          return reject(err)
        }
      })

      writeStream.end() // Закрываем поток после записи

      // Дожидаемся события 'finish', чтобы убедиться, что запись завершена
      writeStream.on("finish", () => {
        resolve()
      })

      writeStream.on("error", (err) => {
        fsErrorParser(err, source)
        reject(err)
      })
    })

    // Дожидаемся завершения записи всех чанков
    await writePromise
    const updates: Partial<ChunkCreationAttributes> = {
      status: ChunkStatus.PENDING,
      source: source,
    }
    await updateChunkDal(chunk.getDataValue("uuid"), updates)
    return source
  }

  static endRecord() {}

  static createFileOnServer() {}

  static loadChunk() {}

  static fileUploadEnd() {}
}

export default StorageService
