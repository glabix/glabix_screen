import Record, { RecordCreationAttributes } from "../models/Record"
import { GetAllRecordsFilters } from "./types"
import Chunk from "../models/Chunk"
import { stringify } from "../../main/helpers/stringify"
import { LogSender } from "../../main/helpers/log-sender"
import { Op } from "sequelize"
const logSender = new LogSender()

export const createRecordDal = async (
  payload: RecordCreationAttributes
): Promise<Record> => {
  const record = await Record.create(payload)
  logSender.sendLog(
    "record.database.create.success",
    stringify({
      fileUuid: record.getDataValue("uuid"),
      title: record.getDataValue("title"),
      version: record.getDataValue("version"),
      status: record.getDataValue("status"),
    })
  )
  return record
}

export const updateRecordDal = async (
  uuid: string,
  payload: Partial<RecordCreationAttributes>
): Promise<Record> => {
  const record = await Record.findByPk(uuid)
  if (!record) {
    logSender.sendLog(
      "record.database.update.error",
      stringify({
        uuid,
        payload: { ...payload },
        text: "not found",
      }),
      true
    )
    // @todo throw custom error
    throw new Error(`record ${uuid} not found`)
  }
  const updatedRecord = await (record as Record).update(payload)
  logSender.sendLog(
    "record.database.update.success",
    stringify({
      uuid,
      ...payload,
    })
  )
  return updatedRecord
}

export const getByUuidRecordDal = async (uuid: string): Promise<Record> => {
  const record = await Record.findByPk(uuid, { include: Chunk })
  if (!record) {
    // @todo throw custom error
    throw new Error("not found")
  }
  return record
}

export const deleteByUuidRecordsDal = async (
  uuids: string[]
): Promise<string[]> => {
  const deletedRecordCount = await Record.destroy({
    where: { uuid: uuids },
    cascade: true,
  })
  return uuids
}

export const getAllRecordDal = async (
  filters?: GetAllRecordsFilters
): Promise<Record[]> => {
  return Record.findAll({
    where: {
      ...(filters?.status && { status: filters.status }),
      ...(filters?.updatedAfter && {
        updatedAt: { [Op.gte]: filters.updatedAfter },
      }),
      ...(filters?.updatedBefore && {
        updatedAt: { [Op.lte]: filters.updatedBefore },
      }),
    },
  })
}
