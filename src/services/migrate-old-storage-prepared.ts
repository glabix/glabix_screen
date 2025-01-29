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

  constructor() {}

  async migrate() {
    try {
      const flag = await fs.promises.access(this.mainPath)
    } catch (e) {
      return
    }
    console.log("move")
    await this.moveChunks(this.mainPath, this.newStoragePath)
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

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Если это директория, читаем её содержимое
          const subDirPath = path.join(sourceDir, entry.name)

          // Проверяем, существует ли файл .transfer в поддиректории
          const transferFilePath = path.join(subDirPath, ".transfer")
          try {
            await fs.promises.access(transferFilePath)
            console.log(`Skipping ${subDirPath} because .transfer file exists.`)
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
              const chunkNumber = file.split("-")[1] + 1
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
              console.log(`Moved: ${sourcePath} -> ${targetPath}`)
              await updateChunkDal(chunkUuid, {
                status: ChunkStatus.PENDING,
                source: targetPath,
              })
            }
          }
          await updateRecordDal(fileUuid, {
            status: RecordStatus.CREATED_ON_SERVER,
          })
          await fs.promises.rmdir(subDirPath)
        }
      }
    } catch (error) {
      console.error(`Error moving chunks:`, error)
    }
  }
}
