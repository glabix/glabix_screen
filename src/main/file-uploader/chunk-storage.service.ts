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
    }

    const processChunk = (data: Buffer, i: number): Promise<Chunk> => {
      return new Promise<Chunk>((resolve, reject) => {
        this.writeChunk(i, fileUuid, data)
          .then((path) => {
            const chunk = new Chunk(data.byteLength, fileUuid, i, path)
            resolve(chunk)
          })
          .catch((e) => reject(e))
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
            this._storages.push(new ChunksStorage(fileUuid, chunks))
          }
          resolve()
        })
        .catch((e) => {
          logSender.sendLog("processChunk.error", stringify({ err }), true)
          return reject(e)
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

  initStorages() {
    this._storages = []
    try {
      const dirs = this.getDirectoriesSync(this.mainPath)
      // readChunks
      for (let i = 0; i < dirs.length; i++) {
        const dirPath = dirs[i]
        this.readChunksFromDirectorySync(dirPath)
      }
    } catch (err) {
      try {
        fsErrorParser(err, this.mainPath)
      } catch (e) {
        logSender.sendLog("initStorages.error", stringify(err), true)
      }
    }
  }

  private readChunksFromDirectorySync(dirName: string) {
    const chunks: Chunk[] = []
    try {
      const dirPath = path.join(this.mainPath, dirName)
      const files = this.getFilesSync(dirPath)
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        const fileContent = fs.readFileSync(filePath, "utf-8")
        const buffer = Buffer.from(fileContent)
        const baseName = path.basename(filePath)
        if (baseName.startsWith("chunk-")) {
          // Извлекаем номер чанка после "chunk-"
          const chunkNumber = baseName.substring(6)
          const chunk = new Chunk(
            buffer.length,
            dirName,
            +chunkNumber,
            filePath
          )
          chunks.push(chunk)
          setLog(LogLevel.DEBUG, `chunk: ${filePath}: , ${fileContent.length}`)
        } else {
          setLog(LogLevel.ERROR, `unknown chunk name ${filePath}`)
        }
      }
      if (chunks.length) {
        this._storages.push(new ChunksStorage(dirName, chunks))
      } else {
        this.rmdirStorage(dirName).catch((err) => {
          setLog(LogLevel.ERROR, err)
        })
      }
    } catch (err) {
      setLog(LogLevel.ERROR, err)
    }
  }

  private getFilesSync(srcPath) {
    const entries = fs.readdirSync(srcPath, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)

    return files
  }

  private getDirectoriesSync(srcPath) {
    const entries = fs.readdirSync(srcPath, { withFileTypes: true })
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    return directories
  }

  removeStorage(uuid: string) {
    if (this.currentProcessedStorage?.fileUuid === uuid) {
      this.currentProcessedStorage = null
    }
    this._storages = this._storages.filter((s) => s.fileUuid !== uuid)
  }

  getNextChunk(): Chunk | null {
    if (
      !this.currentProcessedStorage ||
      !this.currentProcessedStorage.chunks.length
    ) {
      if (!this._storages.length) {
        return null
      }
      const foundStorage = this._storages.find((s) =>
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
}
