export enum RecordEvents {
  START = "start",
  SET_CROP_DATA = "set_crop_data",
  REQUEST_DATA = "request_data",
  SEND_DATA = "send_data",
  SEND_PREVIEW = "send_preview",
  STOP = "stop",
  PAUSE = "pause",
  ERROR = "error",
  CANCEL = "cancel",
}

export enum RecordSettingsEvents {
  INIT = "record-settings:init",
  UPDATE = "record-settings:update",
}

export enum ChunkSaverEvents {
  CHUNK_FINALIZED = "chunk_finalized",
  RECORD_STOPPED = "record_stopped",
}
