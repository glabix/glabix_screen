import { getVersion } from "../main/helpers/get-version"
import { getTitle } from "../shared/helpers/get-title"
import Record, {
  RecordCreationAttributes,
  RecordStatus,
} from "../database/models/Record"
import path from "path"
import fs from "fs"
import { fsErrorParser } from "../main/helpers/fs-error-parser"
import { app, clipboard } from "electron"
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
  deleteByUuidRecordsDal,
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
import { ProgressResolver } from "../services/progress-resolver"
import { AxiosRequestConfig } from "axios"

class StorageService {
  static storagePath = path.join(app.getPath("userData"), "ChunkStorage")
  static logSender = new LogSender(TokenStorage)
  private static lastChunk: Chunk | null = null // Храним последний чанк в классе
  static canceledRecordsUuids: string[] = []

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

  static async addChunk(
    fileUuid: string,
    blob: Blob,
    index: number,
    isLast: boolean
  ) {
    if (this.canceledRecordsUuids.indexOf(fileUuid) !== -1) {
      this.logSender.sendLog(
        "record.recording.chunk.received.process.canceled_recording",
        stringify({ fileUuid, byteLength: blob.size })
      )
      return
    }
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
    try {
      // Создаем директорию, если её нет
      fs.mkdirSync(this.storagePath, { recursive: true })
      // Записываем данные в файл
      await this.writeChunk(source, buffer)
    } catch (e) {
      this.logSender.sendLog(
        "record.recording.chunk.received.process.fs.error",
        stringify({ fileUuid, count: index, byteLength: blob.size, e }),
        true
      )
      throw e
    }
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
      // function simulateError() {
      //   const random = Math.random(); // Генерируем число от 0 до 1
      //   return random < 0.3; // 30% вероятность
      // }
      // if (simulateError()) {
      //   writeStream.emit("error", { code: "ENOSPC", message: "Нет места на устройстве" });
      // }
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
  ): Promise<Chunk> {
    const updates: Partial<ChunkCreationAttributes> = {
      status: ChunkStatus.PENDING,
      source: source,
      size: size,
    }
    const uuid = chunk.getDataValue("uuid")
    return await updateChunkDal(uuid, updates)
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

  static async createFileOnServer(fileUuid: string): Promise<Record> {
    try {
      this.logSender.sendLog(
        "record.create_on_server.start",
        stringify({
          fileUuid,
        })
      )

      const update: Partial<RecordCreationAttributes> = {
        status: RecordStatus.CREATING_ON_SERVER,
      }
      await updateRecordDal(fileUuid, update)

      await ProgressResolver.createRecord(fileUuid)

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
          const publicPage = `${import.meta.env.VITE_AUTH_APP_URL}recorder/shared/${server_uuid}`
          clipboard.writeText(publicPage)

          return await updateRecordDal(fileUuid, update)
        } else {
          throw new Error(
            `Failed to create multipart file upload, code ${response.status}`
          )
        }
      } catch (err) {
        this.logSender.sendLog(
          "record.create_on_server.response.error",
          stringify({ fileUuid, err }),
          true
        )
        throw err
      }
    } catch (err) {
      this.logSender.sendLog(
        "record.create_on_server.error",
        stringify({ fileUuid, err }),
        true
      )
      const update: Partial<RecordCreationAttributes> = {
        status: RecordStatus.RECORDED,
      }
      await updateRecordDal(fileUuid, update)
      throw err
    }
  }

  static async loadChunk(_chunk: Chunk): Promise<Chunk | null> {
    let chunk = _chunk
    const record = await getByUuidRecordDal(chunk.getDataValue("fileUuid"))
    const serverUuid = record.getDataValue("server_uuid")

    let data: Buffer | null = null
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
      const path = chunk.getDataValue("source")
      data = await fs.promises.readFile(path)
    } catch (err) {
      this.logSender.sendLog(
        "chunk.upload.storage.get.error",
        stringify({
          RecordServerUuid: serverUuid,
          index: chunkNumber,
          size,
          path,
          err,
        }),
        true
      )
      throw err
    }
    try {
      chunk = await updateChunkDal(_chunk.getDataValue("uuid"), {
        status: ChunkStatus.LOADING,
      })
      const config: AxiosRequestConfig = {
        onUploadProgress: (progressEvent) => {
          ProgressResolver.updateChunkData(
            chunk.getDataValue("fileUuid"),
            _chunk.getDataValue("uuid"),
            progressEvent.loaded
          )
        },
      }
      const response = await uploadFileChunkCommand(
        TokenStorage.token!.access_token,
        TokenStorage.organizationId!,
        serverUuid,
        data,
        chunkNumber,
        config
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
      await updateChunkDal(_chunk.getDataValue("uuid"), {
        status: ChunkStatus.PENDING,
      })
      throw e
    }
    this.logSender.sendLog(
      "chunk.upload.success",
      stringify({
        RecordServerUuid: serverUuid,
        index: chunkNumber,
        size,
      })
    )
    return chunk
  }

  static async RecordUploadEnd(fileUuid: string) {
    await updateRecordDal(fileUuid, { status: RecordStatus.COMPLETED })
    ProgressResolver.completeRecord(fileUuid)
    await deleteByUuidRecordsDal([fileUuid])
  }

  static async updateRecordingFiles() {
    let records = await getAllRecordDal({ status: RecordStatus.RECORDING })
    records.forEach((r) => {
      updateRecordDal(r.getDataValue("uuid"), { status: RecordStatus.RECORDED })
    })
  }

  static async updateCratingOnServerFiles() {
    let records = await getAllRecordDal({
      status: RecordStatus.CREATING_ON_SERVER,
    })
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
    this.canceledRecordsUuids.push(uuid)
    const record = await updateRecordDal(uuid, {
      status: RecordStatus.CANCELED,
    })
    return uuid
  }

  static async canceledRecordsDelete() {
    const oneMinutesAgo = new Date(new Date().getTime() - 1 * 60000) // Текущее время минус 1 минута
    const canceled = await getAllRecordDal({
      status: RecordStatus.CANCELED,
      updatedBefore: oneMinutesAgo,
    })
    if (canceled.length) {
      const uuids = canceled.map((c) => c.getDataValue("uuid"))
      this.logSender.sendLog(
        "manager.cancel_records_delete.start",
        stringify({ uuids: uuids })
      )
      await deleteByUuidRecordsDal(uuids)
      this.logSender.sendLog(
        "manager.cancel_records_delete.success",
        stringify({ uuids: uuids })
      )
    }
  }

  static async competedRecordsDelete() {
    const oneMinutesAgo = new Date(new Date().getTime() - 1 * 60000) // Текущее время минус 1 минута
    const canceled = await getAllRecordDal({
      status: RecordStatus.COMPLETED,
      updatedBefore: oneMinutesAgo,
    })
    if (canceled.length) {
      const uuids = canceled.map((c) => c.getDataValue("uuid"))
      this.logSender.sendLog(
        "manager.complete_records_delete.start",
        stringify({ uuids: uuids })
      )
      await deleteByUuidRecordsDal(uuids)
      this.logSender.sendLog(
        "manager.complete_records_delete.success",
        stringify({ uuids: uuids })
      )
    }
  }
}

export default StorageService
