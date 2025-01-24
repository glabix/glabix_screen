import { getVersion } from "../main/helpers/get-version"
import { getTitle } from "../shared/helpers/get-title"
import Record, {
  RecordCreationAttributes,
  RecordStatus,
} from "../database/models/Record"
import path from "path"
import fs from "fs"
import { fsErrorParser } from "../main/helpers/fs-error-parser"
import { app } from "electron"
import Chunk, {
  ChunkCreationAttributes,
  ChunkStatus,
} from "../database/models/Chunk"
import {
  createChunkDal,
  deleteByUuidChunkDal,
  getAllChunkDal,
  updateChunkDal,
} from "../database/dal/Chunk"
import {
  createRecordDal,
  deleteByUuidRecordDal,
  getAllRecordDal,
  getByUuidRecordDal,
  updateRecordDal,
} from "../database/dal/Record"
import { createFileUploadCommand } from "../main/commands/create-file-upload.command"
import { TokenStorage } from "../main/storages/token-storage"
import { LogSender } from "../main/helpers/log-sender"
import { stringify } from "../main/helpers/stringify"
import { uploadFileChunkCommand } from "../main/commands/upload-file-chunk.command"
import { RecordManager } from "./record-manager"
import { PreviewManager } from "./preview-manager"
import { ICropVideoData } from "../shared/types/types"

class StorageService {
  static storagePath = path.join(app.getPath("userData"), "ChunkStorage")
  static logSender = new LogSender(TokenStorage)
  static async startRecord(): Promise<Record> {
    const title = getTitle(Date.now())
    const version = getVersion()
    this.logSender.sendLog(
      "record.database.create.start",
      stringify({ title, version })
    )
    return createRecordDal({
      title,
      version,
      status: RecordStatus.RECORDING,
    })
  }
  private static lastChunk: Chunk | null = null // Храним последний чанк в классе

  static async addChunk(
    fileUuid: string,
    blob: Blob,
    index: number,
    isLast: boolean
  ) {
    this.logSender.sendLog(
      "record.recording.chunk.received.process.start",
      stringify({ fileUuid, count: index, byteLength: blob.size })
    )
    if (index === 1) {
      this.lastChunk = null
    }
    const buffer = Buffer.from(await blob.arrayBuffer())
    const chunkSizeLimit = 10 * 1024 * 1024 // 10 MB

    let source: string

    if (!this.lastChunk) {
      this.lastChunk = await createChunkDal({
        fileUuid,
        index,
        size: buffer.byteLength,
        status: ChunkStatus.SAVING,
      })
      source = path.join(this.storagePath, this.lastChunk.getDataValue("uuid"))
    } else {
      source = path.join(this.storagePath, this.lastChunk.getDataValue("uuid"))
    }

    let totalSize = await this.getFileSize(source)

    if (totalSize > chunkSizeLimit) {
      this.logSender.sendLog(
        "record.recording.chunk.received.process.chunk_size_limit",
        stringify({
          fileUuid,
          count: index,
          byteLength: blob.size,
          totalSize,
          chunkSizeLimit,
        })
      )
      // Создаем новый чанк с новым UUID для следующего файла
      this.lastChunk = await createChunkDal({
        fileUuid,
        index: this.lastChunk.getDataValue("index") + 1, // новый индекс для следующего чанка
        size: buffer.byteLength,
        status: ChunkStatus.SAVING,
      })
      source = path.join(this.storagePath, this.lastChunk.getDataValue("uuid"))
      totalSize = 0 // Сбрасываем размер, так как начинаем новый файл
    } else {
      this.logSender.sendLog(
        "record.recording.chunk.received.process.to_current_chunk",
        stringify({ fileUuid, count: index, byteLength: blob.size })
      )
    }

    // Создаем директорию, если её нет
    fs.mkdirSync(this.storagePath, { recursive: true })

    // Записываем данные в файл
    await this.writeChunk(source, buffer)

    // Обновляем статус чанка в БД
    await this.updateChunkStatus(
      this.lastChunk,
      source,
      totalSize + buffer.byteLength
    )

    this.logSender.sendLog(
      "record.recording.chunk.received.process.end",
      stringify({ fileUuid, count: index })
    )
    return source
  }

  // Функция для получения размера файла
  static async getFileSize(source: string): Promise<number> {
    try {
      const stats = await fs.promises.stat(source)
      return stats.size
    } catch (err) {
      return 0 // Если файл не найден, размер считается нулевым
    }
  }

  // Функция для записи данных в файл
  static async writeChunk(source: string, buffer: Buffer): Promise<void> {
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
        this.logSender.sendLog(
          "record.recording.chunk.received.storage.error",
          stringify({ source, size: buffer.byteLength }),
          true
        )
        fsErrorParser(err, source)
        reject(err)
      })
    })
  }

  // Функция для обновления чанка
  static async updateChunkStatus(
    chunk: Chunk,
    source: string,
    size: number
  ): Promise<void> {
    const updates: Partial<ChunkCreationAttributes> = {
      status: ChunkStatus.PENDING,
      source: source,
      size: size,
    }
    await updateChunkDal(chunk.getDataValue("uuid"), updates)
  }

  static async deleteUnknownChunks() {
    const getChunksInFolder = async (folderPath) => {
      const files = await fs.promises.readdir(folderPath)
      return files.filter((file) =>
        fs.promises
          .stat(path.join(folderPath, file))
          .then((stat) => stat.isFile())
      )
    }
    const getChunksFromDb = async () => {
      const chunks = await getAllChunkDal()
      return chunks.map((c) => c.getDataValue("uuid"))
    }
    const deleteFile = async (filePath) => {
      return fs.promises.unlink(filePath)
    }
    const filesInFolder = await getChunksInFolder(this.storagePath)
    const filesInDb = await getChunksFromDb()
    const setDbFiles = new Set(filesInDb)

    // Фильтруем файлы в папке, которых нет в базе данных
    const filesToDelete = filesInFolder.filter((file) => !setDbFiles.has(file))

    // Удаляем файлы
    await Promise.all(
      filesToDelete.map((file) => {
        this.logSender.sendLog(
          "storage.unlink",
          stringify({ source: path.join(this.storagePath, file) })
        )
        return deleteFile(path.join(this.storagePath, file))
      })
    )
  }

  static async endRecord(fileUuid: string) {
    const update: Partial<RecordCreationAttributes> = {
      status: RecordStatus.RECORDED,
    }
    const record = await updateRecordDal(fileUuid, update)
    RecordManager.newRecord(fileUuid)
    return record
  }

  static async createFileOnServer(fileUuid: string): Promise<Record | null> {
    this.logSender.sendLog(
      "record.create_on_server.start",
      stringify({
        fileUuid,
      })
    )
    let record = await getByUuidRecordDal(fileUuid)
    const title = record.getDataValue("title")
    const fileChunks = record.getDataValue("Chunks")
    const size = fileChunks.reduce(
      (accumulator, chunk) => accumulator + chunk.getDataValue("size"),
      0
    )
    const count = fileChunks.length
    const appVersion = getVersion()
    const fileName = title + ".mp4"
    let crop: ICropVideoData | null = null
    if (
      record.getDataValue("out_w") !== null &&
      record.getDataValue("out_h") !== null &&
      record.getDataValue("x") !== null &&
      record.getDataValue("y") !== null
    ) {
      crop = {
        out_w: record.getDataValue("out_w"),
        out_h: record.getDataValue("out_h"),
        x: record.getDataValue("x"),
        y: record.getDataValue("y"),
      }
    }
    let error = false
    const previewSource = record.getDataValue("previewSource")
    let preview: File | null = null
    if (previewSource) {
      preview = (await PreviewManager.getPreview(previewSource)) as File
    }
    try {
      this.logSender.sendLog(
        "record.create_on_server.response",
        stringify({
          fileUuid,
          title,
          count,
          size,
          isCrop: !!crop,
          isPreview: !!preview,
        })
      )
      const response = await createFileUploadCommand(
        TokenStorage.token!.access_token,
        TokenStorage.organizationId!,
        fileName,
        count,
        title,
        size,
        appVersion,
        preview,
        crop
      )
      if (response.status === 200 || response.status === 201) {
        const server_uuid = response.data.uuid
        const update: Partial<RecordCreationAttributes> = {
          status: RecordStatus.CREATED_ON_SERVER,
          server_uuid,
        }
        record = await updateRecordDal(fileUuid, update)
        console.log("server_uuid", server_uuid)
      } else {
        throw new Error(
          `Failed to create multipart file upload, code ${response.status}`
        )
      }
    } catch (err) {
      this.logSender.sendLog(
        "record.create_on_server.error",
        stringify({ fileUuid, err }),
        true
      )
      error = true
    }
    if (!error) {
      return record
    } else {
      return null
    }
  }

  static async loadChunk(_chunk: Chunk): Promise<Chunk | null> {
    let chunk = _chunk
    const record = await getByUuidRecordDal(chunk.getDataValue("fileUuid"))
    const serverUuid = record.getDataValue("server_uuid")

    let data: Buffer | null = null
    let error = false
    const chunkNumber = chunk.getDataValue("index")
    const size = chunk.getDataValue("size")
    this.logSender.sendLog(
      "chunk.upload.start",
      stringify({
        RecordServerUuid: serverUuid,
        index: chunkNumber,
        size,
      })
    )
    try {
      data = await fs.promises.readFile(chunk.getDataValue("source"))
    } catch (err) {
      // this.logSender.sendLog(
      //   "api.uploads.multipart_upload.create.error", // todo
      //   stringify({ err }),
      //   true
      // )
      this.logSender.sendLog(
        "chunk.upload.storage.get.error",
        stringify({
          RecordServerUuid: serverUuid,
          index: chunkNumber,
          size,
          err,
        }),
        true
      )
      error = true
      return null
    }
    try {
      chunk = await updateChunkDal(_chunk.getDataValue("uuid"), {
        status: ChunkStatus.LOADING,
      })
      const response = await uploadFileChunkCommand(
        TokenStorage.token!.access_token,
        TokenStorage.organizationId!,
        serverUuid,
        data,
        chunkNumber
      )
      if (response.status === 200 || response.status === 201) {
        chunk = await updateChunkDal(_chunk.getDataValue("uuid"), {
          status: ChunkStatus.LOADED,
        })
      } else {
        throw new Error(
          `Failed to create multipart file upload, code ${response.status}`
        )
      }
    } catch (e) {
      this.logSender.sendLog(
        "chunk.upload.error",
        stringify({
          RecordServerUuid: serverUuid,
          index: chunkNumber,
          size,
          real_size: data?.length || null,
          e,
        }),
        true
      )
      const update: Partial<ChunkCreationAttributes> = {
        status: ChunkStatus.PENDING,
      }
      chunk = await updateChunkDal(_chunk.getDataValue("uuid"), update)
      error = true
    }
    if (!error) {
      this.logSender.sendLog(
        "chunk.upload.success",
        stringify({
          RecordServerUuid: serverUuid,
          index: chunkNumber,
          size,
        })
      )
      return chunk
    } else {
      return null
    }
  }

  static async RecordUploadEnd(fileUuid: string) {
    await updateRecordDal(fileUuid, { status: RecordStatus.COMPLETED })
    await deleteByUuidRecordDal(fileUuid)
  }

  static async updateRecordingFiles() {
    let records = await getAllRecordDal({ status: RecordStatus.RECORDING })
    records.forEach((r) => {
      updateRecordDal(r.getDataValue("uuid"), { status: RecordStatus.RECORDED })
    })
  }

  static async updateLoadingChunks() {
    let savingChunks = await getAllChunkDal({ status: ChunkStatus.SAVING })
    savingChunks.forEach((sc) => {
      const uuid = sc.getDataValue("uuid")
      deleteByUuidChunkDal(uuid)
    })

    let loadingChunks = await getAllChunkDal({ status: ChunkStatus.LOADING })
    loadingChunks.forEach((sc) => {
      const uuid = sc.getDataValue("uuid")
      updateChunkDal(uuid, { status: ChunkStatus.PENDING })
    })
  }

  static async setCropData(uuid: string, data: ICropVideoData) {
    const { out_w, out_h, x, y } = data
    const record = await updateRecordDal(uuid, { out_w, out_h, x, y })
    return record
  }

  static async cancelRecord(uuid: string) {
    const record = await updateRecordDal(uuid, {
      status: RecordStatus.CANCELED,
    })
    await deleteByUuidRecordDal(uuid)
    return uuid
  }
}

export default StorageService
