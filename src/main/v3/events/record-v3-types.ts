import { RecordEventsV3 } from "./record-v3-events"
import { ICropVideoData } from "@shared/types/types"

export interface RecordStartEventV3 {
  type: RecordEventsV3.START
}

export interface RecordSetCropDataEventV3 {
  type: RecordEventsV3.SET_CROP_DATA
  innerFileUuid: string
  cropVideoData: ICropVideoData
}

export interface RecordDataEventV3 {
  type: RecordEventsV3.SEND_DATA
  data: Buffer
  innerFileUuid: string
  timestamp: number // Добавляем timestamp вместо index
  isLast: boolean
}

export interface RecordCancelEventV3 {
  type: RecordEventsV3.CANCEL
  innerFileUuid: string
}

export type RecordEventV3 =
  | RecordStartEventV3
  | RecordDataEventV3
  | RecordCancelEventV3
  | RecordSetCropDataEventV3

export enum IRecordV3Status {
  PENDING = "pending",

  CREATING_ON_SERVER = "creating_on_server",
  CREATED_ON_SERVER = "created_on_server",

  COMPLETE = "complete",
  COMPLETING_ON_SERVER = "completing_on_server",
  COMPLETED_ON_SERVER = "completed_on_server",
}

export enum ChunkStatusV3 {
  RECORDED = "recorded",
  SENDING_TO_SERVER = "sending_to_server",
  SENT_TO_SERVER = "sent_to_server",
}

export enum ChunkTypeV3 {
  VIDEO = "video",
  AUDIO = "audio",
}

export interface IChunkV3 {
  innerRecordUuid: string
  uuid: string
  createdAt: number
  updatedAt: number
  source: string
  status: ChunkStatusV3
  type: ChunkTypeV3
  isLast: boolean
}

export interface IRecordV3 {
  localUuid: string
  serverUuid?: string
  createdAt: number
  updatedAt: number
  canceledAt?: number
  title: string
  version: string
  status: IRecordV3Status
  dirPath: string
  upload?: {
    uploadId?: string
    status: "pending" | "uploading" | "completed" | "failed"
    startedAt?: number
    completedAt?: number
  }
  chunks: {
    [uuid: string]: IChunkV3
  }
  cropData?: ICropVideoData
}

export interface ChunkPart {
  data: Buffer
  partIndex: number
  isLastPart: boolean
}
