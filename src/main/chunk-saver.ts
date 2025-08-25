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
import { fsErrorParser } from "@main/helpers/fs-error-parser"
import { LogSender } from "@main/helpers/log-sender"

interface IChunkData extends IHandleChunkDataEvent {
  bytesWritten: number
}

interface IQueue {
  pending: Map<number, IChunkData>
  currentFile: {
    fd?: fs.promises.FileHandle
    size: number
    path: string
    count: number
  }
  isProcessing: boolean
  shouldProcessAgain: boolean
  currentIndex: number
}

export class ChunkProcessor extends EventEmitter {
  private logSender = new LogSender()

  private queues: Map<string, IQueue> = new Map()

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  private readonly baseDir = path.join(app.getPath("userData"), "recordsV3")

  // 👇 буфер для временного хранения последнего чанка
  private lastChunkBuffer: Map<
    string,
    {
      timer: NodeJS.Timeout
      chunk: IHandleChunkDataEvent
    }
  > = new Map()

  constructor() {
    super()
  }

  async accumulate(chunk: IHandleChunkDataEvent) {
    const { recordUuid, isLast } = chunk

    // если чанк не последний → сразу отправляем в очередь
    if (!isLast) {
      return this.addChunk(chunk)
    }

    // если чанк последний → проверяем, есть ли уже ожидающий
    const existing = this.lastChunkBuffer.get(recordUuid)
    if (!existing) {
      // сохраняем и ждём 1 секунду
      this.logSender.sendLog(
        "chunk_saver.accumulate.start_await_another_last",
        JSON.stringify(chunk)
      )
      const timer = setTimeout(async () => {
        // времени вышло → отправляем чанк как есть
        this.logSender.sendLog(
          "chunk_saver.accumulate.end_await_another_last",
          JSON.stringify(chunk)
        )
        this.lastChunkBuffer.delete(recordUuid)
        await this.addChunk(chunk)
      }, 1000)

      this.lastChunkBuffer.set(recordUuid, { timer, chunk })
    } else {
      // если уже есть "ждущий" последний чанк → объединяем
      this.logSender.sendLog(
        "chunk_saver.accumulate.another_last_is_exist",
        JSON.stringify(chunk)
      )
      clearTimeout(existing.timer)
      this.logSender.sendLog(
        "chunk_saver.received.start",
        JSON.stringify(event)
      )
      // сортируем по index
      const chunks = [existing.chunk, chunk].sort((a, b) => a.index - b.index)

      const buffers = chunks.map((c) => Buffer.from(c.data))
      const merged = Buffer.concat(buffers)

      const mergedChunk: IHandleChunkDataEvent = {
        ...chunks[chunks.length - 1]!, // берём метаданные от "самого последнего"
        data: merged.buffer, // ArrayBuffer
        size: merged.length,
        index: chunks[0]!.index, // минимальный индекс
      }
      this.logSender.sendLog(
        "chunk_saver.accumulate.another_last_is_exist.created",
        JSON.stringify(mergedChunk)
      )
      this.lastChunkBuffer.delete(recordUuid)
      await this.addChunk(mergedChunk)
    }
  }

  async addChunk(event: IHandleChunkDataEvent): Promise<void> {
    const { recordUuid, index } = event
    this.logSender.sendLog("chunk_saver.received.start", JSON.stringify(event))
    if (!this.queues.has(recordUuid)) {
      this.queues.set(recordUuid, {
        pending: new Map(),
        currentFile: { size: 0, path: "", count: -1 },
        isProcessing: false,
        shouldProcessAgain: false,
        currentIndex: 0,
      })
      this.logSender.sendLog(
        "chunk_saver.queue.set",
        JSON.stringify({ recordUuid })
      )
    }

    const queue = this.queues.get(recordUuid)!
    const extendsData: IChunkData = { ...event, bytesWritten: 0 }
    queue.pending.set(index, extendsData)
    this.logSender.sendLog(
      "chunk_saver.received.set",
      JSON.stringify({ index, extendsData })
    )
    await this.processQueue(recordUuid)
  }

  private async processQueue(recordUuid: string): Promise<void> {
    const queue = this.queues.get(recordUuid)
    if (!queue) {
      this.logSender.sendLog(
        "chunk_saver.queue.process.error",
        JSON.stringify({ recordUuid }),
        true
      )
      return
    }

    if (queue.isProcessing) {
      this.logSender.sendLog(
        "chunk_saver.queue.already_processing",
        JSON.stringify({ recordUuid })
      )
      queue.shouldProcessAgain = true // пометили повторную обработку
      return
    }

    queue.isProcessing = true // Начинаем обработку

    let nextIndex = this.findNextIndex(queue.pending, queue.currentIndex)
    this.logSender.sendLog(
      "chunk_saver.queue.next_index_1",
      JSON.stringify({ nextIndex })
    )
    try {
      while (nextIndex !== undefined) {
        const event = queue.pending.get(nextIndex)!
        await this.processChunk(event, queue)
        queue.currentIndex += 1
        queue.pending.delete(nextIndex)
        nextIndex = this.findNextIndex(queue.pending, queue.currentIndex)
        this.logSender.sendLog(
          "chunk_saver.queue.next_index_2",
          JSON.stringify({ nextIndex })
        )
      }
    } finally {
      queue.isProcessing = false // Завершаем обработку
      // 🔁 если что-то добавилось во время обработки — повторяем
      if (queue.shouldProcessAgain) {
        queue.shouldProcessAgain = false
        await this.processQueue(recordUuid)
      }
    }
  }

  private async processChunk(event: IChunkData, queue: IQueue): Promise<void> {
    this.logSender.sendLog(
      "chunk_saver.queue.process_chunk",
      JSON.stringify({ event })
    )
    const { data, index, isLast, recordUuid } = event
    const chunkBuffer = Buffer.from(data)

    while (event.bytesWritten < chunkBuffer.length) {
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
      try {
        await queue.currentFile!.fd!.write(
          chunkBuffer.subarray(
            event.bytesWritten,
            event.bytesWritten + bytesToWrite
          )
        )
      } catch (error) {
        fsErrorParser(error, queue.currentFile.path)
      }

      event.bytesWritten += bytesToWrite
      queue.currentFile.size += bytesToWrite
    }
    const isRealLast = !queue.pending
      .entries()
      .find(([index, data]) => data.isLast && data.index > event.index)
    if (isLast && !isRealLast) {
      this.logSender.sendLog(
        "chunk_saver.queue.process_chunk.is_not_real_last",
        JSON.stringify({ event })
      )
    }
    if (isLast && isRealLast) {
      await this.finalizeRecording(recordUuid, queue)
    }
  }

  private async rotateFile(recordUuid: string, queue: any): Promise<void> {
    this.logSender.sendLog(
      "chunk_saver.file.rotate.start",
      JSON.stringify({ recordUuid })
    )
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
      this.logSender.sendLog(
        "chunk_saver.file.finalized_before_rotate",
        JSON.stringify({ res })
      )
      this.emit(ChunkSaverEvents.CHUNK_FINALIZED, res)
      await queue.currentFile.fd.close()
    }

    const filePath = path.join(this.baseDir, recordUuid, `${Date.now()}.mp4`)
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      this.logSender.sendLog(
        "chunk_saver.file.created",
        JSON.stringify({ filePath })
      )
    } catch (error) {
      fsErrorParser(error, filePath)
    }

    queue.currentFile = {
      fd: await fs.promises.open(filePath, "w"),
      size: 0,
      path: filePath,
      count: queue.currentFile.count + 1,
    }
    this.logSender.sendLog(
      "chunk_saver.queue.created",
      JSON.stringify({ currentFile: queue.currentFile })
    )
  }

  private async finalizeRecording(
    recordUuid: string,
    queue: any
  ): Promise<void> {
    this.logSender.sendLog(
      "chunk_saver.recording.finalize.start",
      JSON.stringify({ currentFile: queue.currentFile })
    )
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
  }

  private findNextIndex(
    pendingMap: Map<number, any>,
    findIndex: number
  ): number | undefined {
    return pendingMap.get(findIndex) ? findIndex : undefined
  }
}
