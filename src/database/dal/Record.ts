import Record, { RecordCreationAttributes } from "../models/Record"
import { GetAllRecordsFilters } from "./types"
import Chunk from "../models/Chunk"
import { stringify } from "../../main/helpers/stringify"
import { LogSender } from "../../main/helpers/log-sender"
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
    throw new Error("not found")
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

export const deleteByUuidRecordDal = async (uuid: string): Promise<string> => {
  const deletedRecordCount = await Record.destroy({
    where: { uuid },
    cascade: true,
  })
  return uuid
}

export const getAllRecordDal = async (
  filters?: GetAllRecordsFilters
): Promise<Record[]> => {
  return Record.findAll({
    where: {
      ...(filters?.status && { status: filters.status }),
    },
  })
}
