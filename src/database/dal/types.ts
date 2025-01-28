import { RecordStatus } from "../models/Record"
import { ChunkStatus } from "../models/Chunk"

export interface GetAllRecordsFilters {
  status?: RecordStatus
  updatedAfter?: Date
  updatedBefore?: Date
}

export interface GetAllChunksFilters {
  status?: ChunkStatus
  fileUuid?: string
}
