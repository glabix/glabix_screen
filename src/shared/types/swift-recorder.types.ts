import { Rectangle } from "electron"

export enum SwiftRecorderEvents {
  START = "swift-recorder:start",
  STOP = "swift-recorder:stop",
  PAUSE = "swift-recorder:pause",
  RESUME = "swift-recorder:resume",
  CONFIGURE = "swift-recorder:configure",
  START_WAVE_FORM = "swift-recorder:wave-form:start",
  STOP_WAVE_FORM = "swift-recorder:wave-form:stop",
}

export enum SwiftMediaDevicesEvents {
  GET_DEVICES = "swift:media-device:get-devices",
  CHANGE = "swift:media-device:change",
  GET_WAVE_FORM = "swift:media-device:get-wave-form",
}

export interface ISwiftMediaDevice {
  name: string
  isDefault: boolean
  id: string
}
export interface ISwiftRecorderConfig {
  systemAudio?: boolean
  audioDeviceId?: string
  displayId?: number
  cropRect?: Rectangle
}

export enum SwiftRecorderCallbackActions {
  CHUNK_FINALIZED = "chunkFinalized",
  RECORD_STOPPED = "stopped",
  RECORD_STARTED = "started",
  GET_AUDIO_INPUT_DEVICES = "audioInputDevices",
  GET_AUDIO_WAVE_FORM = "microphoneWaveform",
}

export interface ISwiftRecorderCallbackStated {
  action: SwiftRecorderCallbackActions.RECORD_STARTED
  path: string
}
export interface ISwiftRecorderCallbackStopped {
  action: SwiftRecorderCallbackActions.RECORD_STOPPED
  lastChunkIndex: number
}

export interface ISwiftRecorderCallbackAudioDevices {
  action: SwiftRecorderCallbackActions.GET_AUDIO_INPUT_DEVICES
  devices: ISwiftMediaDevice[]
}

export interface ISwiftRecorderCallbackChunkFinalized {
  action: SwiftRecorderCallbackActions.CHUNK_FINALIZED
  index: number
}
