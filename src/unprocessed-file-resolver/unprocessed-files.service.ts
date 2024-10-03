import os from "os"
import path from "path"
import { app } from "electron"
import fs from "fs"

const CHUNK_SIZE = 7 * 1024 * 1024 // Размер чанка 7 MB

export class UnprocessedFilesService {
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

  private files: string[]
  isProcessedNowFileName: null | string = null
  constructor() {
    const pathh = path.join(this.mainPath)
    if (!fs.existsSync(pathh)) {
      fs.mkdirSync(pathh, { recursive: true })
    }
  }

  // Функция для сохранения Blob файла с использованием потоков
  async saveFileWithStreams(blob, fileName): Promise<string> {
    const buffer = Buffer.from(await blob.arrayBuffer())

    let chunkIndex = 0
    const writePromises = [] // Массив промисов для отслеживания завершения записи каждого чанка

    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + CHUNK_SIZE) // Создаем чанк
      const chunkFileName = `${fileName}.part${chunkIndex}`
      const chunkPath = path.join(this.mainPath, chunkFileName)

      // Создаем промис, который завершится, когда запись чанка будет завершена
      const writePromise = new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(chunkPath)

        writeStream.write(chunk, (err) => {
          if (err) {
            console.error("Ошибка при записи чанка:", err)
            return reject(err)
          }
        })

        writeStream.end() // Закрываем поток после записи

        // Дожидаемся события 'finish', чтобы убедиться, что запись завершена
        writeStream.on("finish", () => {
          resolve()
        })

        writeStream.on("error", (err) => {
          console.error(
            `Ошибка записи в поток для файла: ${chunkFileName}`,
            err
          )
          reject(err)
        })
      })

      writePromises.push(writePromise) // Добавляем промис в массив
      chunkIndex++
    }

    // Дожидаемся завершения записи всех чанков
    await Promise.all(writePromises)
    return fileName
  }

  async restoreFileToBuffer(fileName): Promise<Buffer> {
    const directoryPath = path.join(this.mainPath) // Путь к директории с чанками
    const files = await fs.promises.readdir(directoryPath) // Читаем список файлов в директории
    // Фильтруем файлы, которые соответствуют нужному файлу (например, exampleFile.txt.partX)
    const chunkFiles = files
      .filter((file) => file.startsWith(fileName))
      .sort((a, b) => {
        // Сортируем файлы по номеру чанка (exampleFile.txt.part0, part1, ...)
        const aIndex = parseInt(a.split(".part")[1], 10)
        const bIndex = parseInt(b.split(".part")[1], 10)
        return aIndex - bIndex
      })
    // Читаем все чанки асинхронно
    const buffers = await Promise.all(
      chunkFiles.map(async (chunkFile) => {
        const chunkPath = path.join(directoryPath, chunkFile)
        return fs.promises.readFile(chunkPath) // Возвращаем Buffer для каждого чанка
      })
    )

    // Соединяем все чанки в один Buffer
    const fileBuffer = Buffer.concat(buffers)

    return fileBuffer // Возвращаем собранный файл как Buffer
  }

  getFile(fileName: string) {
    return this.restoreFileToBuffer(fileName)
  }

  async getFirstFileName(): Promise<string> {
    const files = await fs.promises.readdir(this.mainPath) // Читаем список файлов
    const filteredFiles = files
      .filter((file) => file.endsWith(".part0")) // Ищем файлы, которые являются началом файла (part0)
      .sort() // Сортируем по имени файла (по алфавиту)

    if (filteredFiles.length > 0) {
      const firstFileName = filteredFiles[0].split(".part")[0] // Убираем суффикс .part0
      return firstFileName // Возвращаем имя первого файла
    } else {
      return null // Если файлов нет, возвращаем null
    }
  }

  async deleteFile(fileName) {
    const directoryPath = path.join(this.mainPath)
    const files = await fs.promises.readdir(directoryPath)
    // Фильтруем все части файла
    const chunkFiles = files.filter((file) => file.startsWith(fileName))

    if (chunkFiles.length === 0) {
      return
    }

    // Удаляем все чанки файла
    await Promise.all(
      chunkFiles.map(async (chunkFile) => {
        const chunkPath = path.join(directoryPath, chunkFile)
        await fs.promises.unlink(chunkPath)
      })
    )
  }
}
