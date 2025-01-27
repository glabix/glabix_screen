import fs from "fs"
import { fsErrorParser } from "../main/helpers/fs-error-parser"
import path from "path"
import { app } from "electron"
import { getAllRecordDal, updateRecordDal } from "../database/dal/Record"

export class PreviewManager {
  static storagePath = path.join(app.getPath("userData"), "PreviewStorage")
  static async savePreview(fileUuid: string, dataUrl: string) {
    const buffer = this.dataUrlToBuffer(dataUrl)
    fs.mkdirSync(this.storagePath, { recursive: true })
    const source = path.join(this.storagePath, fileUuid)
    await this.writeFile(source, buffer)
    return updateRecordDal(fileUuid, { previewSource: source })
  }

  static dataUrlToBuffer(dataUrl: string): Buffer {
    // Разделяем dataURL на метаданные и данные
    const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/)
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid dataURL format")
    }

    const base64Data = matches[2] // Берём только часть с Base64 данными
    return Buffer.from(base64Data, "base64") // Преобразуем Base64 в Buffer
  }

  static hasPreview(fileUuid: string) {
    const source = path.join(this.storagePath, fileUuid)
    return fs.existsSync(source)
  }

  static async writeFile(source: string, buffer: Buffer): Promise<void> {
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
  static async getPreview(source) {
    const buffer = await fs.promises.readFile(source)
    return new File([buffer], "preview.png", { type: "image/png" })
  }

  static async deleteUnknownPreviews() {
    const getPreviewInFolder = async (folderPath) => {
      const files = await fs.promises.readdir(folderPath)
      return files.filter((file) =>
        fs.promises
          .stat(path.join(folderPath, file))
          .then((stat) => stat.isFile())
      )
    }
    const getPreviewsFromDb = async () => {
      const chunks = await getAllRecordDal()
      return chunks.map((c) => c.getDataValue("uuid"))
    }
    const deleteFile = async (filePath) => {
      return fs.promises.unlink(filePath)
    }
    const previewsInFolder = await getPreviewInFolder(this.storagePath)
    const previewsInDb = await getPreviewsFromDb()
    const setDbFiles = new Set(previewsInDb)

    // Фильтруем файлы в папке, которых нет в базе данных
    const filesToDelete = previewsInFolder.filter(
      (file) => !setDbFiles.has(file)
    )

    // Удаляем файлы
    await Promise.all(
      filesToDelete.map((file) => deleteFile(path.join(this.storagePath, file)))
    )
  }
}
