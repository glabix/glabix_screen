export enum RecordEvents {
  START = "start",
  SET_CROP_DATA = "set_crop_data",
  REQUEST_DATA = "request_data",
  SEND_DATA = "send_data",
  STOP = "stop",
  PAUSE = "pause",
  ERROR = "error",
  CANCEL = "cancel",

  // SWIFT_START = "swift_start",
}

export enum RecordSettingsEvents {
  INIT = "record-settings:init",
  // GET_DEVICES = "record-settings:devices:get",
  UPDATE = "record-settings:update",
}
