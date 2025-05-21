import path from "path"
import fs from "fs"
import EventEmitter from "events"
import { app } from "electron"
import {
  IHandleChunkDataEvent,
  IRecorderLastChunkHandled,
  IRecorderSavedChunk,
} from "@shared/types/types"
import { v4 as uuidv4 } from "uuid"
import { ChunkSaverEvents } from "@shared/events/record.events"

interface IChunkData extends IHandleChunkDataEvent {
  bytesWritten: number
}

export class ChunkProcessor extends EventEmitter {
  private queues: Map<
    string,
    {
      pending: Map<number, IChunkData>
      currentFile: {
        fd?: fs.promises.FileHandle
        size: number
        path: string
        count: number
      }
    }
  > = new Map()

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024 // 100MB
  private readonly baseDir = path.join(app.getPath("userData"), "recordsV3")

  constructor() {
    super()
  }

  async addChunk(event: IHandleChunkDataEvent): Promise<void> {
    const { recordUuid, index } = event

    if (!this.queues.has(recordUuid)) {
      this.queues.set(recordUuid, {
        pending: new Map(),
        currentFile: { size: 0, path: "", count: -1 },
      })
    }

    const queue = this.queues.get(recordUuid)!
    const extendsData: IChunkData = { ...event, bytesWritten: 0 }
    queue.pending.set(index, extendsData)

    await this.processQueue(recordUuid)
  }

  private async processQueue(recordUuid: string): Promise<void> {
    const queue = this.queues.get(recordUuid)
    if (!queue) return

    let nextIndex = this.findNextIndex(queue.pending)
    while (nextIndex !== undefined) {
      console.log("while")
      const event = queue.pending.get(nextIndex)!
      await this.processChunk(event, queue)
      queue.pending.delete(nextIndex)
      nextIndex = this.findNextIndex(queue.pending)
    }
  }

  private async processChunk(event: IChunkData, queue: any): Promise<void> {
    const { data, index, isLast, recordUuid } = event
    const chunkBuffer = Buffer.from(data)

    while (event.bytesWritten < chunkBuffer.length) {
      console.log("chunkBuffer.length", chunkBuffer.length)
      if (
        !queue.currentFile.fd ||
        queue.currentFile.size >= this.MAX_FILE_SIZE
      ) {
        await this.rotateFile(recordUuid, queue)
      }

      const bytesToWrite = Math.min(
        chunkBuffer.length - event.bytesWritten,
        this.MAX_FILE_SIZE - queue.currentFile.size
      )

      await queue.currentFile.fd.write(
        chunkBuffer.subarray(
          event.bytesWritten,
          event.bytesWritten + bytesToWrite
        )
      )
      event.bytesWritten += bytesToWrite
      queue.currentFile.size += bytesToWrite
      console.log("bytesWritten", event.bytesWritten)
    }

    console.log(`Chunk ${index} processed`, {
      size: data.byteLength,
      file: queue.currentFile.path,
      fileSize: queue.currentFile.size,
    })

    if (isLast) {
      await this.finalizeRecording(recordUuid, queue)
    }
  }

  private async rotateFile(recordUuid: string, queue: any): Promise<void> {
    if (queue.currentFile.fd) {
      const res: IRecorderSavedChunk = {
        innerRecordUuid: recordUuid, // uuid записи экрана
        uuid: uuidv4(), // uuid чанка
        createdAt: Date.now(),
        videoSource: queue.currentFile.path,
        audioSource: null,
        size: queue.currentFile.size,
        isLast: false,
        index: queue.currentFile.count,
      }
      this.emit(ChunkSaverEvents.CHUNK_FINALIZED, res)
      await queue.currentFile.fd.close()
    }

    const filePath = path.join(this.baseDir, recordUuid, `${Date.now()}.mp4`)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })

    queue.currentFile = {
      fd: await fs.promises.open(filePath, "w"),
      size: 0,
      path: filePath,
      count: queue.currentFile.count + 1,
    }
  }

  private async finalizeRecording(
    recordUuid: string,
    queue: any
  ): Promise<void> {
    console.log("finalizeRecording")
    if (queue.currentFile.fd) {
      const res: IRecorderSavedChunk = {
        innerRecordUuid: recordUuid, // uuid записи экрана
        uuid: uuidv4(), // uuid чанка
        createdAt: Date.now(),
        videoSource: queue.currentFile.path,
        audioSource: null,
        size: queue.currentFile.size,
        isLast: false,
        index: queue.currentFile.count,
      }
      this.emit(ChunkSaverEvents.CHUNK_FINALIZED, res)
      await queue.currentFile.fd.close()
    }
    const data: IRecorderLastChunkHandled = {
      index: queue.currentFile.count,
      innerRecordUuid: recordUuid,
    }
    this.emit(ChunkSaverEvents.RECORD_STOPPED, data)
    this.queues.delete(recordUuid)
    this.emit("recording-completed", recordUuid)
  }

  private findNextIndex(pendingMap: Map<number, any>): number | undefined {
    const indices = Array.from(pendingMap.keys()).sort((a, b) => a - b)
    return indices.length > 0 ? indices[0] : undefined
  }
}
