import Record, { RecordCreationAttributes } from "../models/Record"
import { GetAllChunksFilters, GetAllRecordsFilters } from "./types"
import Chunk, { ChunkCreationAttributes } from "../models/Chunk"
import { Op } from "sequelize"

export const createChunkDal = async (
  payload: ChunkCreationAttributes
): Promise<Chunk> => {
  const record = await Chunk.create(payload)
  return record
}

export const updateChunkDal = async (
  uuid: string,
  payload: Partial<ChunkCreationAttributes>
): Promise<Chunk> => {
  const chunk = await Chunk.findByPk(uuid)
  if (!chunk) {
    // @todo throw custom error
    throw new Error("not found")
  }
  const updatedChunk = await (chunk as Chunk).update(payload)
  return updatedChunk
}

export const getByUuidChunkDal = async (uuid: string): Promise<Chunk> => {
  const chunk = await Chunk.findByPk(uuid)
  if (!chunk) {
    // @todo throw custom error
    throw new Error("not found")
  }
  return chunk
}

export const deleteByUuidChunkDal = async (uuid: string): Promise<string> => {
  const deletedChunkCount = await Chunk.destroy({
    where: { uuid },
  })
  return uuid
}

export const getAllChunkDal = async (
  filters?: GetAllChunksFilters
): Promise<Chunk[]> => {
  return Chunk.findAll({
    where: {
      ...(filters?.status && { status: filters.status }),
      ...(filters?.fileUuid && { fileUuid: filters.fileUuid }),
    },
  })
}
