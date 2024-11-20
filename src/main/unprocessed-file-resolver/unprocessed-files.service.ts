import os from "os"
import path from "path"
import { app } from "electron"
import fs from "fs"
import { s } from "vite/dist/node/types.d-aGj9QkWt"
import { fsErrorParser } from "../helpers/fs-error-parser"

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

  isAcceptedFileNames: string[] = []
  isProcessedNowFileName: null | string = null

  constructor() {
    const pathh = path.join(this.mainPath)
    if (!fs.existsSync(pathh)) {
      fs.mkdirSync(pathh, { recursive: true })
    }
  }

  async awaitWriteFile(filename: string) {
    const check = () => {
      return this.isAcceptedFileNames.find((a) => a === filename)
    }
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const res = check()
        if (res) {
          clearInterval(timer)
          return resolve(res)
        }
      }, 1000)
    })
  }

  async findMaxChunkIndex(fileName: string): Promise<number | null> {
    try {
      const pathh = path.join(this.mainPath)
      const files = await fs.promises.readdir(pathh) // Асинхронно читаем список файлов в директории
      const regex = new RegExp(`^${fileName}\\.part(\\d+)$`) // Регулярное выражение для проверки шаблона

      let maxChunkIndex: number | null = null

      for (const file of files) {
        const match = file.match(regex)
        if (match) {
          const chunkIndex = parseInt(match[1], 10)
          if (!isNaN(chunkIndex)) {
            maxChunkIndex =
              maxChunkIndex === null
                ? chunkIndex
                : Math.max(maxChunkIndex, chunkIndex)
          }
        }
      }

      return maxChunkIndex
    } catch (error) {
      return null
    }
  }

  async saveFileWithStreams(
    blob: Blob,
    fileName: string,
    last: boolean
  ): Promise<string> {
    const buffer = Buffer.from(await blob.arrayBuffer())
    const lastIndex = await this.findMaxChunkIndex(fileName)
    let chunkIndex = lastIndex === null ? 0 : lastIndex + 1

    const chunkFileName = `${fileName}.part${chunkIndex}`
    const chunkPath = path.join(this.mainPath, chunkFileName)

    const writePromise = new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(chunkPath)

      writeStream.write(buffer, (err) => {
        if (err) {
          console.error("Ошибка при записи чанка:", err)
          fsErrorParser(err, chunkPath)
          return reject(err)
        }
      })

      writeStream.end() // Закрываем поток после записи

      // Дожидаемся события 'finish', чтобы убедиться, что запись завершена
      writeStream.on("finish", () => {
        resolve()
      })

      writeStream.on("error", (err) => {
        fsErrorParser(err, chunkPath)
        reject(err)
      })
    })

    // Дожидаемся завершения записи всех чанков
    await writePromise
    if (last) {
      this.endWriteFile(fileName)
    }
    return fileName
  }

  endWriteFile(filename: string) {
    this.isAcceptedFileNames.push(filename)
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

  async getTotalChunks(
    fileName: string,
    maxChunkSize: number = 10 * 1024 * 1024
  ): Promise<{ totalChunks: number; totalSize: number }> {
    const directoryPath = path.join(this.mainPath) // Путь к директории с чанками
    const files = await fs.promises.readdir(directoryPath) // Читаем список файлов в директории

    // Фильтруем файлы, которые соответствуют нужному файлу
    const chunkFiles = files.filter((file) => file.startsWith(fileName))

    // Суммируем размеры всех файлов
    let totalSize = 0
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(directoryPath, chunkFile)
      const stats = await fs.promises.stat(chunkPath)
      totalSize += stats.size // Добавляем размер текущего файла
    }

    // Вычисляем количество чанков
    const totalChunks = Math.ceil(totalSize / maxChunkSize)

    return { totalChunks, totalSize }
  }

  async *restoreFileToBufferIterator(
    fileName: string,
    maxChunkSize: number = 10 * 1024 * 1024
  ) {
    const directoryPath = path.join(this.mainPath) // Путь к директории с чанками
    const files = await fs.promises.readdir(directoryPath) // Читаем список файлов в директории

    // Фильтруем файлы, которые соответствуют нужному файлу
    const chunkFiles = files
      .filter((file) => file.startsWith(fileName))
      .sort((a, b) => {
        // Сортируем файлы по номеру чанка
        const aIndex = parseInt(a.split(".part")[1], 10)
        const bIndex = parseInt(b.split(".part")[1], 10)
        return aIndex - bIndex
      })

    let currentBuffer = Buffer.alloc(0) // Буфер для накопления данных

    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(directoryPath, chunkFile)
      const chunkBuffer = await fs.promises.readFile(chunkPath) // Читаем текущий чанк

      currentBuffer = Buffer.concat([currentBuffer, chunkBuffer]) // Добавляем данные к текущему буферу

      // Пока текущий буфер превышает размер порции, выдаем порции
      while (currentBuffer.length >= maxChunkSize) {
        yield currentBuffer.slice(0, maxChunkSize) // Отдаем порцию
        currentBuffer = currentBuffer.slice(maxChunkSize) // Оставляем остаток
      }
    }

    // Если остались данные, которые меньше максимального размера, отдаем их
    if (currentBuffer.length > 0) {
      yield currentBuffer
    }
  }
}
