// Класс для накопления данных из входящих чанков (частей данных).
class ChunkAccumulator {
  private buffer: Buffer
  private readonly threshold: number

  constructor(thresholdMB: number = 10) {
    this.buffer = Buffer.alloc(0)
    this.threshold = thresholdMB * 1024 * 1024 // Конвертируем МБ в байты
  }

  /**
   * Обрабатывает входящий чанк данных в виде Blob.
   * @param blob - Часть данных в виде Blob.
   * @param isLastChunk - Флаг, указывающий, что это последний чанк.
   * @returns Результирующий буфер, если достигнут порог или это последний чанк, иначе null.
   */
  async processChunk(
    blob: Blob,
    isLastChunk: boolean = false
  ): Promise<Buffer | null> {
    // Преобразуем Blob в Buffer
    const chunk = Buffer.from(await blob.arrayBuffer())

    // Добавляем чанк в буфер
    this.buffer = Buffer.concat([this.buffer, chunk])

    // Проверяем, достиг ли размер буфера порога или это последний чанк
    if (this.buffer.length >= this.threshold || isLastChunk) {
      const result = this.buffer
      this.buffer = Buffer.alloc(0) // Очищаем буфер
      return result
    }

    return null // Возвращаем null, если порог не достигнут
  }
}

export default ChunkAccumulator
