import Record, { RecordCreationAttributes } from "../models/Record"
import { GetAllRecordsFilters } from "./types"

export const createRecordDal = async (
  payload: RecordCreationAttributes
): Promise<Record> => {
  const record = await Record.create(payload)
  return record
}

export const updateRecordDal = async (
  uuid: string,
  payload: Partial<RecordCreationAttributes>
): Promise<Record> => {
  const record = await Record.findByPk(uuid)
  if (!record) {
    // @todo throw custom error
    throw new Error("not found")
  }
  const updatedRecord = await (record as Record).update(payload)
  return updatedRecord
}

export const getByUuidRecordDal = async (uuid: string): Promise<Record> => {
  const record = await Record.findByPk(uuid)
  if (!record) {
    // @todo throw custom error
    throw new Error("not found")
  }
  return record
}

export const deleteByUuidRecordDal = async (uuid: string): Promise<string> => {
  const deletedRecordCount = await Record.destroy({
    where: { uuid },
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
