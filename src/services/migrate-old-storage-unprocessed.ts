import os from "os"
import path from "path"
import { app } from "electron"
import fs from "fs"
import { createRecordDal, updateRecordDal } from "../database/dal/Record"
import { RecordStatus } from "../database/models/Record"
import { getTitle } from "../shared/helpers/get-title"
import { getVersion } from "../main/helpers/get-version"
import { createChunkDal, updateChunkDal } from "../database/dal/Chunk"
import { ChunkStatus } from "../database/models/Chunk"
import { stringify } from "../main/helpers/stringify"
import { LogSender } from "../main/helpers/log-sender"
import { TokenStorage } from "../main/storages/token-storage"

export class MigrateOldStorageUnprocessed {
  readonly mainPath =
    os.platform() == "darwin"
      ? path.join(
          os.homedir(),
          "Library",
          "Application Support",
          app.getName(),
          "unprocessed_files"
        )
      : path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          app.getName(),
          "unprocessed_files"
        )
  tokenStorage = new TokenStorage()
  logSender = new LogSender(this.tokenStorage)
  chunkSize = 10 * 1024 * 1024 // 10 MB
  newStoragePath = path.join(app.getPath("userData"), "ChunkStorage")
  constructor() {}

  async migrate() {
    this.logSender.sendLog("database.migrate.unprocessed.start", stringify({}))
    try {
      const flag = await fs.promises.access(this.mainPath)
    } catch (e) {
      this.logSender.sendLog("database.migrate.unprocessed.end", "no directory")
      return
    }
    const groupedFiles = await this.getGroupedFiles(this.mainPath)

    if (Object.keys(groupedFiles).length > 0) {
      this.logSender.sendLog(
        "database.migrate.unprocessed.process",
        stringify({ groupedFiles })
      )
      for (const timestamp in groupedFiles) {
        const files = groupedFiles[timestamp]
        const title = getTitle(+timestamp)
        const rec = await createRecordDal({
          title,
          version: getVersion(),
          status: RecordStatus.RECORDING,
        })
        const fileUuid = rec.getDataValue("uuid")
        await this.createChunks(
          groupedFiles[timestamp],
          this.mainPath,
          this.chunkSize,
          timestamp,
          fileUuid
        )
        await updateRecordDal(fileUuid, { status: RecordStatus.RECORDED })
        await this.deleteProcessedFiles(files, this.mainPath)
        this.logSender.sendLog(
          "database.migrate.unprocessed.end",
          stringify({ files, mainPath: this.mainPath })
        )
      }
    } else {
      this.logSender.sendLog(
        "database.migrate.unprocessed.end",
        "No files found matching the pattern."
      )
    }
  }

  async getGroupedFiles(dir): Promise<{ [timestamp: string]: string[] }> {
    const files = (await fs.promises.readdir(dir)).filter((file) =>
      /^\d+\.part\d+$/.test(file)
    ) // Фильтр по шаблону: таймштамп.partномер

    // Группировка файлов по таймштампам
    const groupedFiles = {}
    files.forEach((file) => {
      const timestamp = file.split(".part")[0] // Извлекаем таймштамп из имени файла
      if (!groupedFiles[timestamp]) {
        groupedFiles[timestamp] = []
      }
      groupedFiles[timestamp].push(file)
    })

    // Сортировка файлов в каждой группе по номеру чанка
    for (const timestamp in groupedFiles) {
      groupedFiles[timestamp].sort((a, b) => {
        const numA = parseInt(a.split(".part")[1])
        const numB = parseInt(b.split(".part")[1])
        return numA - numB // Сортировка по числовой части имени (номер чанка)
      })
    }

    return groupedFiles
  }

  async createChunks(files, dir, chunkSize, timestamp, fileUuid: string) {
    let currentChunk = []
    let currentSize = 0
    let chunkIndex = 0

    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(dir, files[i])
      const fileData = await fs.promises.readFile(filePath)
      currentChunk.push(fileData)
      currentSize += fileData.length

      // Если достигли размера чанка или это последний файл
      if (currentSize >= chunkSize || i === files.length - 1) {
        const chunkDB = await createChunkDal({
          fileUuid,
          index: chunkIndex + 1,
          size: 0,
          status: ChunkStatus.SAVING,
        })
        const uuid = chunkDB.getDataValue("uuid")
        const chunkFilePath = path.join(this.newStoragePath, `${uuid}`)
        const buffer = Buffer.concat(currentChunk)
        await fs.promises.writeFile(chunkFilePath, buffer)
        await updateChunkDal(uuid, {
          size: buffer.length,
          source: chunkFilePath,
          status: ChunkStatus.PENDING,
        })
        // Сброс для следующего чанка
        currentChunk = []
        currentSize = 0
        chunkIndex++
      }
    }
  }
  async deleteProcessedFiles(files, dir) {
    try {
      for (const file of files) {
        const filePath = path.join(dir, file)
        // Асинхронное удаление файла
        await fs.promises.unlink(filePath)
      }
      this.logSender.sendLog(
        "database.migrate.unprocessed.delete.successfully",
        stringify({ files })
      )
    } catch (error) {
      this.logSender.sendLog(
        "database.migrate.unprocessed.delete.error",
        stringify({ error }),
        true
      )
    }
  }
}
