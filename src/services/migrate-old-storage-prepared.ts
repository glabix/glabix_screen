import os from "os"
import path from "path"
import { app } from "electron"
import fs from "fs"
import { createRecordDal, updateRecordDal } from "../database/dal/Record"
import { getVersion } from "../main/helpers/get-version"
import { RecordStatus } from "../database/models/Record"
import { getTitle } from "../shared/helpers/get-title"
import { createChunkDal, updateChunkDal } from "../database/dal/Chunk"
import { ChunkStatus } from "../database/models/Chunk"
import { TokenStorage } from "../main/storages/token-storage"
import { LogSender } from "../main/helpers/log-sender"
import { stringify } from "../main/helpers/stringify"

export class MigrateOldStoragePrepared {
  readonly mainPath =
    os.platform() == "darwin"
      ? path.join(
          os.homedir(),
          "Library",
          "Application Support",
          app.getName(),
          "chunks_storage"
        )
      : path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          app.getName(),
          "chunks_storage"
        )
  newStoragePath = path.join(app.getPath("userData"), "ChunkStorage")
  tokenStorage = new TokenStorage()
  logSender = new LogSender(this.tokenStorage)

  constructor() {}

  async migrate() {
    this.logSender.sendLog("database.migrate.prepared.start", stringify({}))
    try {
      const flag = await fs.promises.access(this.mainPath)
    } catch (e) {
      this.logSender.sendLog(
        "database.migrate.prepared.end",
        "no directory",
        true
      )
      return
    }
    await this.moveChunks(this.mainPath, this.newStoragePath)
    this.logSender.sendLog("database.migrate.prepared.end", "success")
  }

  async moveChunks(sourceDir, targetDir) {
    try {
      // Проверяем, существует ли целевая директория, если нет — создаем
      await fs.promises.access(targetDir).catch(async () => {
        await fs.promises.mkdir(targetDir, { recursive: true })
      })

      // Читаем содержимое исходной директории
      const entries = await fs.promises.readdir(sourceDir, {
        withFileTypes: true,
      })

      let hasChunks = false // Флаг для отслеживания наличия чанков

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Если это директория, читаем её содержимое
          const subDirPath = path.join(sourceDir, entry.name)

          // Проверяем, существует ли файл .transfer в поддиректории
          const transferFilePath = path.join(subDirPath, ".transfer")
          try {
            await fs.promises.access(transferFilePath)
            this.logSender.sendLog(
              "database.migrate.prepared.skip",
              `Skipping ${subDirPath} because .transfer file exists.`
            )
            continue // Пропускаем эту директорию, если файл .transfer существует
          } catch {
            // Файл .transfer не существует, продолжаем обработку
          }

          const files = await fs.promises.readdir(subDirPath)
          const title = getTitle()
          const rec = await createRecordDal({
            title,
            version: getVersion(),
            status: RecordStatus.RECORDING,
            server_uuid: entry.name,
          })
          const fileUuid = rec.getDataValue("uuid")
          for (const file of files) {
            if (file.startsWith("chunk-")) {
              this.logSender.sendLog(
                "database.migrate.prepared.find",
                stringify({ chunk: file, fileUuid })
              )
              hasChunks = true // Устанавливаем флаг в true, если найден хотя бы один чанк
              const chunkNumber = Number(file.split("-")[1]) + 1
              const sourcePath = path.join(subDirPath, file)
              const stats = await fs.promises.stat(sourcePath)
              const chunkDB = await createChunkDal({
                fileUuid,
                index: +chunkNumber,
                size: stats.size,
                status: ChunkStatus.SAVING,
              })
              const chunkUuid = chunkDB.getDataValue("uuid")
              const targetPath = path.join(targetDir, chunkUuid)
              // Создаем целевую поддиректорию, если её нет
              await fs.promises.mkdir(targetDir, { recursive: true })

              // Переносим файл
              await fs.promises.rename(sourcePath, targetPath)
              await updateChunkDal(chunkUuid, {
                status: ChunkStatus.PENDING,
                source: targetPath,
              })
              this.logSender.sendLog(
                "database.migrate.prepared.chunk.success",
                stringify({ chunk: file, fileUuid, targetPath })
              )
            }
          }
          await updateRecordDal(fileUuid, {
            status: RecordStatus.CREATED_ON_SERVER,
          })
          this.logSender.sendLog(
            "database.migrate.prepared.file.success",
            stringify({ fileUuid })
          )
          await fs.promises.rmdir(subDirPath)
          this.logSender.sendLog(
            "database.migrate.prepared.delete_dir.successfully",
            stringify({ subDirPath })
          )
        }
      }
      // Если ни одна директория не содержит чанков, логируем это
      if (!hasChunks) {
        this.logSender.sendLog(
          "database.migrate.prepared.no_chunks",
          `No directories with chunks found in ${sourceDir}.`
        )
      }
    } catch (error) {
      this.logSender.sendLog(
        "database.migrate.prepared.error",
        stringify({ error }),
        true
      )
    }
  }
}
