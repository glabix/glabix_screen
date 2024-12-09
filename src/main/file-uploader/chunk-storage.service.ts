import fs from "fs"
import path from "path"
import { ChunksStorage } from "./chunk-storage"
import { Chunk } from "./chunk"
import os from "os"
import { app } from "electron"
import { LogLevel, setLog } from "@main/helpers/set-log"
import { fsErrorParser } from "../helpers/fs-error-parser"
import { LogSender } from "../helpers/log-sender"
import { stringify } from "../helpers/stringify"

const logSender = new LogSender()

export class ChunkStorageService {
  _storages: ChunksStorage[] = []
  _storagesInit = false
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
  currentProcessedStorage: ChunksStorage

  get isStoragesInit() {
    return this._storagesInit
  }

  get chunkCurrentlyLoading(): Chunk | null {
    return this._storages
      .flatMap((s) => s.chunks)
      .find((chunk) => chunk.processed)
  }

  constructor() {
    const pathh = path.join(this.mainPath)
    if (!fs.existsSync(pathh)) {
      fs.mkdirSync(pathh, { recursive: true })
    }
  }

  hasUnloadedFiles(): boolean {
    return !!this._storages.flatMap((s) => s.chunks).find((c) => !c.processed)
  }

  addStorage(chunks: Buffer[], fileUuid: string): Promise<void> {
    const dirPath = path.join(this.mainPath, fileUuid)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath)
      try {
        this.markChunkAsTransferStart(fileUuid)
      } catch (err) {
        fsErrorParser(err, dirPath)
      }
    }
    let birthTime = new Date().getTime()
    try {
      const dirStat = fs.statSync(dirPath)
      const b = dirStat.birthtime.getTime()
      if (b) {
        birthTime = b
      }
    } catch (e) {}

    const processChunk = (data: Buffer, i: number): Promise<Chunk> => {
      return new Promise<Chunk>((resolve, reject) => {
        this.writeChunk(i, fileUuid, data)
          .then((path) => {
            const chunk = new Chunk(data.byteLength, fileUuid, i, path)
            resolve(chunk)
          })
          .catch((e) => {
            fsErrorParser(e, this.mainPath)
            reject(e)
          })
      })
    }

    return new Promise<void>((resolve, reject) => {
      const lastChunkIndex = this.getLastChunkIndex(dirPath)
      const delta = lastChunkIndex !== -1 ? lastChunkIndex + 1 : 0
      const chunksPromises = chunks.map((c, i) => processChunk(c, i + delta))
      Promise.all(chunksPromises)
        .then((chunks) => {
          const stor = this._storages.find((s) => s.fileUuid === fileUuid)
          if (stor) {
            stor.addChunks(chunks)
          } else {
            this._storages.push(new ChunksStorage(fileUuid, chunks, birthTime))
          }
          resolve()
        })
        .catch((e) => {
          try {
            fsErrorParser(err, this.mainPath)
          } catch (e) {
            logSender.sendLog("processChunk.error", stringify({ err }), true)
            return reject(e)
          }
        })
    })
  }

  writeChunk(index: number, fileUuid: string, buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunkPath = path.join(this.mainPath, fileUuid, `chunk-${index}`)
      fs.writeFile(chunkPath, buffer, (err) => {
        if (err) {
          fsErrorParser(err, chunkPath)
          return reject(err)
        }
        resolve(chunkPath)
      })
    })
  }

  async initStorages() {
    this._storagesInit = false
    this._storages = []
    try {
      const dirs = await this.getDirectories(this.mainPath) // Асинхронная версия получения директорий
      for (const dirPath of dirs) {
        if (this.getState(dirPath) === "transfer") {
          this.removeStorage(dirPath)
          setLog(LogLevel.DEBUG, `Delete transfer directory ${dirPath}`)
          continue
        }
        await this.readChunksFromDirectory(dirPath) // Асинхронный метод чтения чанков
      }
    } catch (err) {
      try {
        fsErrorParser(err, this.mainPath)
      } catch (e) {
        logSender.sendLog("initStorages.error", stringify(err), true)
      }
    }
    this._storagesInit = true
  }

  private async readChunksFromDirectory(dirName: string) {
    const chunks: Chunk[] = []
    try {
      const dirPath = path.join(this.mainPath, dirName)
      const files = await this.getFiles(dirPath)

      // Ограничиваем количество параллельных операций
      const batchSize = 10 // Параллельно читаем максимум 10 файлов
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (file) => {
            const filePath = path.join(dirPath, file)
            try {
              const fileStat = await fs.promises.stat(filePath)
              const length = fileStat.size
              const baseName = path.basename(filePath)
              if (baseName.startsWith("chunk-")) {
                const chunkNumber = baseName.substring(6)
                const chunk = new Chunk(length, dirName, +chunkNumber, filePath)
                chunks.push(chunk)
                setLog(LogLevel.SILLY, `chunk: ${filePath}: , ${length}`)
              } else {
                setLog(LogLevel.ERROR, `unknown chunk name ${filePath}`)
              }
            } catch (readError) {
              setLog(
                LogLevel.ERROR,
                `Error reading file ${filePath}: ${readError}`
              )
            }
          })
        )
      }

      if (chunks.length) {
        let birthTime = new Date().getTime()
        try {
          const dirStat = fs.statSync(dirPath)
          const b = dirStat.birthtime.getTime()
          if (b) {
            birthTime = b
          }
        } catch (e) {}
        this._storages.push(new ChunksStorage(dirName, chunks, birthTime))
      } else {
        try {
          await this.rmdirStorage(dirName)
        } catch (err) {
          setLog(LogLevel.ERROR, err)
        }
      }
    } catch (err) {
      setLog(LogLevel.ERROR, err)
    }
  }

  private async getFiles(srcPath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(srcPath, {
        withFileTypes: true,
      }) // Асинхронное получение содержимого директории
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    } catch (err) {
      setLog(LogLevel.ERROR, `Error reading directory ${srcPath}: ${err}`)
      throw err
    }
  }

  private async getDirectories(srcPath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(srcPath, {
        withFileTypes: true,
      }) // Асинхронное получение содержимого директории
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch (err) {
      setLog(LogLevel.ERROR, `Error reading directories ${srcPath}: ${err}`)
      throw err
    }
  }

  removeStorage(uuid: string) {
    if (this.currentProcessedStorage?.fileUuid === uuid) {
      this.currentProcessedStorage = null
    }
    const dirPath = path.join(this.mainPath, uuid)
    fs.rm(dirPath, { recursive: true, force: true }, (err) => {
      if (err) throw err
    })
    this._storages = this._storages.filter((s) => s.fileUuid !== uuid)
  }

  getNextChunk(): Chunk | null {
    const sortedStorages = this._storages.sort(
      (a, b) => a.birthTime - b.birthTime
    )
    if (
      !this.currentProcessedStorage ||
      !this.currentProcessedStorage.chunks.length
    ) {
      if (!this._storages.length) {
        return null
      }
      const foundStorage = sortedStorages.find(
        (s) =>
          this.getState(s.fileUuid) === "done" &&
          s.chunks.find((c) => !c.processed)
      )
      if (foundStorage) {
        this.currentProcessedStorage = foundStorage
      } else {
        return null
      }
    }
    const nextChunk = this.currentProcessedStorage.getNextChunk()
    if (nextChunk) {
      return nextChunk
    }
    return null
  }

  removeChunk(chunk: Chunk): Promise<void> {
    return new Promise((resolve, reject) => {
      const storage = this._storages.find((s) => s.fileUuid === chunk.fileUuid)
      if (!storage) {
        reject(Error("Missing chunk's storage"))
      }
      storage
        .removeChunk(chunk)
        .then(() => {
          if (storage.chunks.length === 0) {
            this.rmdirStorage(chunk.fileUuid)
              .then((s) => {
                resolve()
              })
              .catch((e) => reject(e))
          } else {
            resolve()
          }
        })
        .catch((e) => reject(e))
    })
  }

  private rmdirStorage(uuid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dirPath = path.join(this.mainPath, uuid)
      fs.rmdir(dirPath, (err) => {
        this.removeStorage(uuid)
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  getLastChunkIndex(directoryPath) {
    try {
      const files = fs.readdirSync(directoryPath)
      const chunkFiles = files.filter((file) => file.startsWith("chunk-"))

      const indices = chunkFiles.map((file) => {
        const match = file.match(/chunk-(\d+)/)
        return match ? parseInt(match[1], 10) : -1
      })

      return Math.max(...indices, -1)
    } catch (err) {
      logSender.sendLog(
        "getLastChunkIndex.error",
        stringify({ directoryPath, err }),
        true
      )
      return -1
    }
  }
  markChunkAsTransferDone(uuid: string) {
    const chunkPath = path.join(this.mainPath, uuid, `.done`)
    fs.writeFileSync(chunkPath, "") // Пустой файл как метка
  }
  markChunkAsTransferStart(uuid: string) {
    const chunkPath = path.join(this.mainPath, uuid, `.transfer`)
    fs.writeFileSync(chunkPath, "") // Пустой файл как метка
  }
  markChunkAsTransferEnd(uuid: string) {
    const chunkPath = path.join(this.mainPath, uuid, `.transfer`)
    fs.unlinkSync(chunkPath) // Пустой файл как метка
  }
  getState(uuid: string): "transfer" | "done" {
    // const doneFlagChunkPath = path.join(this.mainPath, fileUuid, `${chunkPath}.done`)
    // const done = fs.existsSync(doneFlagChunkPath);
    const transferFlagChunkPath = path.join(this.mainPath, uuid, `.transfer`)
    const transfer = fs.existsSync(transferFlagChunkPath)
    return transfer ? "transfer" : "done"
  }
}
