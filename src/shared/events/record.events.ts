export enum RecordEvents {
  START = "start",
  SET_CROP_DATA = "set_crop_data",
  REQUEST_DATA = "request_data",
  SEND_DATA = "send_data",
  STOP = "stop",
  PAUSE = "pause",
  ERROR = "error",
  CANCEL = "cancel",
}

export enum RecordSettingsEvents {
  INIT = "record-settings:init",
  UPDATE = "record-settings:update",
}
