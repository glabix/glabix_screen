import Record, { RecordStatus } from "../database/models/Record"
import Chunk from "../database/models/Chunk"
import { Transaction } from "sequelize"

class RecordService {
  /**
   * Создает новую запись (Record) с заданными параметрами.
   * @param title Название записи.
   * @param version Версия записи.
   * @param server_uuid Уникальный идентификатор на сервере (необязательно).
   * @param preview Путь к превью записи (необязательно).
   * @returns Созданная запись.
   */
  static async createRecord(title: string, version: string, preview?: string) {
    return await Record.create({
      title,
      version,
      preview,
      status: RecordStatus.RECORDING,
    })
  }

  /**
   * Получает запись по ID.
   * @param recordUuid ID записи.
   * @returns Найденная запись.
   */
  static async getRecordById(recordUuid: string): Promise<Record | null> {
    return await Record.findByPk(recordUuid, { include: [Chunk] })
  }

  /**
   * Получает все записи.
   * @returns Массив записей.
   */
  static async getAllRecords(): Promise<Record[]> {
    return await Record.findAll({ include: [Chunk] })
  }

  /**
   * Обновляет запись.
   * @param recordUuid UUID записи.
   * @param updates Объект с обновлениями.
   * @returns Обновленная запись.
   */
  static async updateRecord(
    recordUuid: string,
    updates: Partial<Record>
  ): Promise<Record | null> {
    const record = await Record.findByPk(recordUuid)
    if (!record) {
      throw new Error(`Record with ID ${recordUuid} not found.`)
    }
    Object.assign(record, updates)
    await record.save()
    return record
  }

  /**
   * Удаляет запись и связанные с ней чанки.
   * @param recordUuid UUID записи (Record), которую нужно удалить.
   * @returns true, если удаление прошло успешно.
   */
  static async deleteRecord(recordUuid: string): Promise<boolean> {
    const transaction: Transaction = await Record.sequelize!.transaction()
    try {
      await Chunk.destroy({ where: { fileUuid: recordUuid }, transaction })
      await Record.destroy({ where: { uuid: recordUuid }, transaction })
      await transaction.commit()
      return true
    } catch (error) {
      await transaction.rollback()
      console.error("Error deleting record:", error)
      throw error
    }
  }
}

export default RecordService
