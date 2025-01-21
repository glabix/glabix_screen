import Chunk from "../database/models/Chunk"
import { ChunkStatus } from "../database/models/Chunk"
import { app } from "electron"
import path from "path"
import Record from "../database/models/Record"

class ChunkService {
  /**
   * Добавляет новый чанк к записи.
   * @param fileUuid UUID записи
   * @param source Путь к файлу чанка.
   * @param size Размер чанка в байтах.
   * @returns Созданный чанк.
   */
  static async addChunk(fileUuid: string, size: number): Promise<Chunk> {
    return await Chunk.create({
      fileUuid,
      size,
      status: ChunkStatus.SAVING, // Начальный статус
    })
  }

  /**
   * Получает все чанки, связанные с записью.
   * @param fileUuid UUID записи (Record).
   * @returns Массив чанков.
   */
  static async getChunksByRecord(fileUuid: string): Promise<Chunk[]> {
    return await Chunk.findAll({ where: { fileUuid } })
  }

  /**
   * Обновляет статус указанного чанка.
   * @param chunkUuid UUID чанка.
   * @param updates Объект с обновлениями.
   * @returns Обновленный чанк.
   */
  static async updateChunk(
    chunkUuid: string,
    updates: Partial<Chunk>
  ): Promise<Chunk | null> {
    const chunk = await Chunk.findByPk(chunkUuid)
    if (!chunk) {
      throw new Error(`Chunk with ID ${chunkUuid} not found.`)
    }
    Object.assign(chunk, updates)
    await chunk.save()
    return chunk
  }

  /**
   * Удаляет чанк по UUID.
   * @param chunkUuid UUID чанка.
   * @returns true, если удаление прошло успешно.
   */
  static async deleteChunk(chunkUuid: string): Promise<boolean> {
    const chunk = await Chunk.findByPk(chunkUuid)
    if (!chunk) {
      throw new Error(`Chunk with ID ${chunkUuid} not found.`)
    }
    await chunk.destroy()
    return true
  }
}

export default ChunkService
