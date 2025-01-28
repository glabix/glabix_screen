import { GetAllChunksFilters } from "./types"
import Chunk, { ChunkCreationAttributes } from "../models/Chunk"
import { LogSender } from "../../main/helpers/log-sender"
import { stringify } from "../../main/helpers/stringify"
const logSender = new LogSender()

export const createChunkDal = async (
  payload: ChunkCreationAttributes
): Promise<Chunk> => {
  const chunk = await Chunk.create(payload)
  logSender.sendLog(
    "chunk.database.create.success",
    stringify({
      fileUuid: chunk.getDataValue("fileUuid"),
      index: chunk.getDataValue("index"),
      size: chunk.getDataValue("size"),
      uuid: chunk.getDataValue("uuid"),
      source: chunk.getDataValue("source"),
    })
  )
  return chunk
}

export const updateChunkDal = async (
  uuid: string,
  payload: Partial<ChunkCreationAttributes>
): Promise<Chunk> => {
  const chunk = await Chunk.findByPk(uuid)
  if (!chunk) {
    logSender.sendLog(
      "chunk.database.update.error",
      stringify({
        uuid,
        payload: { ...payload },
        text: "not found",
      }),
      true
    )
    throw new Error(`record ${uuid} not found`)
  }
  const updatedChunk = await (chunk as Chunk).update(payload)
  logSender.sendLog(
    "chunk.database.update.success",
    stringify({
      fileUuid: chunk.getDataValue("fileUuid"),
      ...payload,
    })
  )
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
