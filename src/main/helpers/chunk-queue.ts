import EventEmitter from "node:events"
import { stringify } from "@main/helpers/stringify"
import { LogSender } from "@main/helpers/log-sender"

export class ChunkQueue {
  private queue: Map<number, { fileUuid: string; blob: Blob }> = new Map() // Очередь для хранения чанков
  private expectedIndex: number = 1 // Ожидаемый номер следующего чанка
  private isLastReceived = false // Флаг, сигнализирующий о том, что пришел последний чанк
  private emitter = new EventEmitter() // Создаем эмиттер для обработки событий
  private logSender = new LogSender()
  private eventNameChunk = "chunk" + Date.now()
  private eventNameNext = "next" + Date.now()
  uuid = Date.now()
  constructor() {
    // Подписываемся на событие "chunk", которое срабатывает при получении нового чанка
    this.emitter.on(
      this.eventNameChunk,
      (chunk: {
        index: number
        fileUuid: string
        blob: Blob
        isLast: boolean
      }) => {
        this.queue.set(chunk.index, {
          fileUuid: chunk.fileUuid,
          blob: chunk.blob,
        }) // Добавляем чанк в очередь
        this.logSender.sendLog(
          "chunk_queue.set.chunk",
          stringify({
            index: chunk.index,
            fileUuid: chunk.fileUuid,
            isLast: chunk.isLast,
            size: chunk.blob.size,
          })
        )
        if (chunk.isLast) this.isLastReceived = true // Если это последний чанк, устанавливаем флаг
        this.emitter.emit(this.eventNameNext) // Генерируем событие "next", чтобы пробудить обработчик
      }
    )
  }

  /**
   * Метод для приема нового чанка из внешнего источника.
   * @param index - Порядковый номер чанка
   * @param fileUuid - Уникальный идентификатор файла
   * @param blob - Данные чанка в виде Blob
   * @param isLast - Флаг, обозначающий, что это последний чанк
   */
  receiveChunk(
    index: number,
    fileUuid: string,
    blob: Blob,
    isLast: boolean = false
  ) {
    this.logSender.sendLog(
      "chunk_queue.receive.chunk",
      stringify({ index, fileUuid, isLast, size: blob.size })
    )
    this.emitter.emit(this.eventNameChunk, { index, fileUuid, blob, isLast }) // Эмитируем событие "chunk" с переданными данными
  }

  /**
   * Асинхронный генератор, который возвращает чанки по порядку.
   * Он ждет, пока нужный чанк появится в очереди, прежде чем вернуть его.
   */
  async *processChunks() {
    while (!this.isLastReceived || this.queue.size > 0) {
      // Если ожидаемого чанка нет в очереди, ждем его появления
      if (!this.queue.has(this.expectedIndex)) {
        this.logSender.sendLog(
          "chunk_queue.next_chunk.await",
          stringify({ index: this.expectedIndex })
        )
        await new Promise((resolve) =>
          this.emitter.once(this.eventNameNext, resolve)
        ) // Ждем, пока придет нужный чанк
      }

      // Если чанк уже есть в очереди, извлекаем его
      if (this.queue.has(this.expectedIndex)) {
        this.logSender.sendLog(
          "chunk_queue.next_chunk.get",
          stringify({ index: this.expectedIndex })
        )
        const chunk = this.queue.get(this.expectedIndex)! // Получаем данные чанка
        this.queue.delete(this.expectedIndex) // Удаляем чанк из очереди, так как он обработан
        yield { index: this.expectedIndex, ...chunk } // Возвращаем чанк через `yield`
        this.expectedIndex++ // Переходим к следующему ожидаемому чанку
      }
    }
    this.emitter.removeAllListeners(this.eventNameChunk)
    this.emitter.removeAllListeners(this.eventNameNext)
  }
}
