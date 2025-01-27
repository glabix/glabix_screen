import { RecordStatus } from "../models/Record"
import { ChunkStatus } from "../models/Chunk"

export interface GetAllRecordsFilters {
  status?: RecordStatus
}

export interface GetAllChunksFilters {
  status?: ChunkStatus
  fileUuid?: string
}
