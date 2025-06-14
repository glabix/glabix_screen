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
  recordUuid: string // uuid записи экрана
  uuid: string // uuid чанка
  timestamp: number
  videoSource: string
  audioSource: string | null
  size: number
  isLast: boolean
  index: number
}

export interface RecordLastChunkHandledV3 {
  type: RecordEventsV3.LAST_CHUNK_HANDLED
  recordUuid: string // uuid записи экрана
  lastChunkIndex: number
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
  | RecordLastChunkHandledV3

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

export interface IChunkV3 {
  innerRecordUuid: string
  uuid: string
  createdAt: number
  updatedAt: number
  videoSource: string
  audioSource: string | null
  status: ChunkStatusV3
  isLast: boolean
  size: number
  index: number
}

export enum RecorderType {
  DEFAULT = "default",
  CUSTOM_MAC = "custom_mac",
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
  previewPath?: string | null
  previewGeneratedAt?: number
  failCounter?: number
  lastUploadAttemptAt?: number
  orgId: number
  recorderType: RecorderType
  upload?: {
    status: "pending" | "uploading" | "completed" | "failed"
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
