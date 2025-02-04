import "@renderer/styles/index-page.scss"
import Moveable, { MoveableRefTargetType } from "moveable"
import {
  DialogWindowEvents,
  IDialogWindowButton,
  IDialogWindowData,
  ICropVideoData,
  IOrganizationLimits,
  ISimpleStoreData,
  RecorderState,
  ScreenAction,
  SimpleStoreEvents,
  StreamSettings,
  IDialogWindowCallbackData,
  HotkeysEvents,
} from "@shared/types/types"
import { Timer } from "./helpers/timer"
import { FileUploadEvents } from "@shared/events/file-upload.events"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
import { captureVideoFrame } from "./helpers/capture-video-frame"
import { RecordEvents } from "../../shared/events/record.events"
const isWindows = navigator.userAgent.indexOf("Windows") != -1

const TEXT_MAP = {
  stop: isWindows ? "Ctrl+Shift+L" : "Cmd+Shift+L",
  pause: isWindows ? "Alt+Shift+P" : "Option+Shift+P",
  restart: isWindows ? "Ctrl+Shift+R" : "Cmd+Shift+R",
  delete: isWindows ? "Alt+Shift+С" : "Option+Shift+С",
  draw: isWindows ? "Ctrl+Shift+D" : "Cmd+Shift+D",
}
const countdownContainer = document.querySelector(
  ".fullscreen-countdown-container"
)!
// const canvasContainer = document.querySelector(".crop-screenshot-container")! as HTMLDivElement
const countdown = document.querySelector("#fullscreen_countdown")!
let startTimer: NodeJS.Timeout
const timerDisplay = document.getElementById(
  "timerDisplay"
)! as HTMLButtonElement
const controlPanel = document.querySelector(".panel-wrapper")!
let timer = new Timer(timerDisplay, 0)
const stopBtn = document.getElementById("stopBtn")! as HTMLButtonElement
const cancelBtn = document.getElementById("cancelBtn")! as HTMLButtonElement
const pauseBtn = document.getElementById("pauseBtn")! as HTMLButtonElement
const resumeBtn = document.getElementById("resumeBtn")! as HTMLButtonElement
const deleteBtn = document.getElementById("deleteBtn")! as HTMLButtonElement
const restartBtn = document.getElementById("restartBtn")! as HTMLButtonElement
const changeCameraOnlySizeBtn = document.querySelectorAll(
  ".js-camera-only-size"
)!
let lastScreenAction: ScreenAction | undefined = "fullScreenVideo"
let videoRecorder: MediaRecorder | undefined
let stream: MediaStream | undefined
let cropMoveable: Moveable | undefined
let cameraMoveable: Moveable | undefined
let lastStreamSettings: StreamSettings | undefined
let desktopStream: MediaStream = new MediaStream()
let voiceStream: MediaStream = new MediaStream()
let requestId = 0
let currentRecordedUuid: string | null = null
let currentRecordChunksCount = 0
let cropVideoData: ICropVideoData | undefined = undefined
let isDialogWindowOpen = false
let isRecording = false
let isRecordCanceled = false
let isRecordRestart = false

function dialogWindowToggle(isOpen: boolean) {
  isDialogWindowOpen = isOpen
  document.body.classList.toggle("is-dialog-open", isOpen)
}

function debounce(func, wait) {
  let timeoutId

  return function (...args) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

const logResize = (x1, x2, y1, y2) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: "mode.video.region.scaled",
    body: { x1, x2, y1, y2 },
  })
}

const debouncedLogResize = debounce(logResize, 400)

function stopRecording() {
  if (videoRecorder) {
    videoRecorder.stop()
    videoRecorder = undefined

    if (requestId) {
      window.cancelAnimationFrame(requestId)
    }

    clearView()
  }
}

function pauseRecording() {
  if (videoRecorder) {
    videoRecorder.pause()
    timer.pause()
  }
}

function resumeRecording() {
  if (videoRecorder) {
    videoRecorder.resume()
    timer.start(true)
  }
}

function cancelRecording() {
  if (startTimer) {
    clearInterval(startTimer)
    currentRecordedUuid = null
    currentRecordChunksCount = 0

    if (lastStreamSettings) {
      initView(lastStreamSettings, true)
      initRecord(lastStreamSettings)
    }

    window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    window.electronAPI.ipcRenderer.send("modal-window:open", {})
  }
}

function openDeleteRecordingDialog() {
  const buttons: IDialogWindowButton[] = [
    { type: "default", text: "Продолжить", action: "cancel" },
    { type: "danger", text: "Остановить запись", action: "ok" },
  ]
  const data: IDialogWindowData = {
    title: "Хотите остановить запись?",
    text: "Запись не будет сохранена в библиотеку",
    buttons: buttons,
    data: { uuid: currentRecordedUuid },
  }

  window.electronAPI.ipcRenderer.send(DialogWindowEvents.CREATE, data)
  isRecordCanceled = true
  isRecordRestart = false
  pauseRecording()
  dialogWindowToggle(true)
}

function openRestartRecordingDialog() {
  const buttons: IDialogWindowButton[] = [
    { type: "default", text: "Продолжить", action: "cancel" },
    { type: "danger", text: "Начать заново", action: "ok" },
  ]
  const data: IDialogWindowData = {
    title: "Хотите начать запись заново?",
    text: "Текущая запись не будет сохранена в библиотеку",
    buttons: buttons,
    data: { uuid: currentRecordedUuid },
  }

  window.electronAPI.ipcRenderer.send(DialogWindowEvents.CREATE, data)
  isRecordRestart = true
  isRecordCanceled = false
  dialogWindowToggle(true)

  pauseRecording()
}

changeCameraOnlySizeBtn.forEach((button) => {
  button.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement
      const size = target.dataset.size!
      const container = document.querySelector(".webcamera-only-container")!
      container.classList.remove("sm", "lg", "xl")
      container.classList.add(size)

      if (cameraMoveable) {
        cameraMoveable.updateRect()
      }
    },
    false
  )
})

stopBtn.addEventListener("click", () => {
  stopRecording()
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: "recording.finished",
    body: JSON.stringify({ type: "manual" }),
  })
})
cancelBtn.addEventListener("click", () => {
  cancelRecording()
})

resumeBtn.addEventListener("click", () => {
  if (videoRecorder && videoRecorder.state == "paused") {
    resumeRecording()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.resume",
      body: JSON.stringify({ type: "manual" }),
    })
  }
})

pauseBtn.addEventListener("click", () => {
  if (videoRecorder && videoRecorder.state == "recording") {
    pauseRecording()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.paused",
      body: JSON.stringify({ type: "manual" }),
    })
  }
})

deleteBtn.addEventListener("click", () => {
  if (videoRecorder && ["paused", "recording"].includes(videoRecorder.state)) {
    openDeleteRecordingDialog()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.delete",
      body: JSON.stringify({ type: "manual" }),
    })
  }
})
restartBtn.addEventListener("click", () => {
  if (videoRecorder && ["paused", "recording"].includes(videoRecorder.state)) {
    openRestartRecordingDialog()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.restart",
      body: JSON.stringify({ type: "manual" }),
    })
  }
})

const mergeAudioStreams = (
  desktopStream: MediaStream,
  voiceStream: MediaStream
): MediaStreamTrack[] => {
  const context = new AudioContext()
  const hasSystemAudio = Boolean(desktopStream.getAudioTracks().length)
  const hasMicrophone = Boolean(voiceStream.getAudioTracks().length)
  const desktopSource: MediaStreamAudioSourceNode | null = hasSystemAudio
    ? context.createMediaStreamSource(desktopStream)
    : null
  const voiceSource: MediaStreamAudioSourceNode | null = hasMicrophone
    ? context.createMediaStreamSource(voiceStream)
    : null

  const combine = context.createMediaStreamDestination()

  if (desktopSource) {
    desktopSource.connect(combine)
  }

  if (voiceSource) {
    voiceSource.connect(combine)
  }

  return combine.stream.getAudioTracks()
}

const initStream = async (settings: StreamSettings): Promise<MediaStream> => {
  desktopStream.getTracks().forEach((track) => track.stop())
  voiceStream.getTracks().forEach((track) => track.stop())

  let systemAudioSettings: boolean | MediaTrackConstraints = false

  if (settings.audio && isWindows) {
    systemAudioSettings = {
      noiseSuppression: true, // Включает подавление шума
      echoCancellation: true, // Включает подавление эха
      autoGainControl: true, // Автоматическая регулировка усиления
      sampleRate: 44100, // Установите частоту дискретизации, если это необходимо
      channelCount: 1, // Используйте стерео, если это возможно
    }
  }

  if (settings.audioDeviceId) {
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.audioDeviceId,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100,
        channelCount: 1,
      },
      video: false,
    })
  }

  if (["fullScreenVideo", "cropVideo"].includes(settings.action)) {
    try {
      desktopStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: systemAudioSettings,
      })
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: `${settings.action}.mediaStream.init`,
        body: JSON.stringify({
          video: true,
          audio: systemAudioSettings,
        }),
      })
    } catch (e) {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: `${settings.action}.mediaStream.error`,
        body: `${e}`,
      })
    }
  }

  if (settings.action == "cameraOnly" && settings.cameraDeviceId) {
    try {
      desktopStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: settings.cameraDeviceId } },
      })
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: `${settings.action}.mediaStream.init`,
        body: JSON.stringify({
          video: true,
          audio: systemAudioSettings,
        }),
      })
    } catch (e) {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: `${settings.action}.mediaStream.error`,
        body: `${e}`,
      })
    }
  }

  const audioStreamTracks: MediaStreamTrack[] = systemAudioSettings
    ? mergeAudioStreams(desktopStream, voiceStream)
    : voiceStream.getAudioTracks()

  const combinedStream = new MediaStream([
    ...desktopStream.getVideoTracks(),
    ...audioStreamTracks,
  ])

  return combinedStream
}

const getSupportedMimeType = () => {
  const defaultMimeType = "video/mp4"
  const h264MimeType = "video/webm;codecs=h264"
  if (MediaRecorder.isTypeSupported(h264MimeType)) {
    return h264MimeType
  } else {
    return defaultMimeType
  }
}

const createVideo = (_stream, _canvas, _video) => {
  stream = _canvas
    ? new MediaStream([
        ..._canvas.captureStream(30).getVideoTracks(),
        ..._stream.getAudioTracks(),
      ])
    : new MediaStream([
        ..._stream.getVideoTracks(),
        ..._stream.getAudioTracks(),
      ])

  videoRecorder = new MediaRecorder(stream!, {
    mimeType: getSupportedMimeType(),
    videoBitsPerSecond: 2500000, // 2.5 Mbps
  })

  videoRecorder.onerror = (event) => {
    window.electronAPI.ipcRenderer.send(RecordEvents.ERROR, {
      title: "videoRecorder.onerror",
      body: JSON.stringify(event),
    })
  }

  let lastChunk: ArrayBuffer | string | null = null

  if (_video) {
    _video.srcObject = new MediaStream([..._stream.getVideoTracks()])
  }

  if (_canvas) {
    const canvasVideoEl = document.getElementById("__canvas_video_stream__")
    if (canvasVideoEl) {
      canvasVideoEl.remove()
    }

    const canvasVideo = document.createElement("video")
    canvasVideo.id = "__canvas_video_stream__"
    canvasVideo.style.cssText = `pointer-events: none; opacity: 0;`
    canvasVideo.srcObject = new MediaStream([..._stream.getVideoTracks()])
    document.body.appendChild(canvasVideo)
  }

  videoRecorder.onpause = function (e) {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.onpause",
    })
    updateRecorderState("paused")
  }

  videoRecorder.onstart = function (e) {}

  videoRecorder.onresume = function (e) {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.onresume",
    })
    updateRecorderState("recording")
  }

  videoRecorder.ondataavailable = function (e) {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.ondataavailable",
    })
    currentRecordChunksCount += 1
    const blob = new Blob([e.data], { type: getSupportedMimeType() })
    const reader = new FileReader()
    reader.onload = function () {
      const arrayBuffer = reader.result
      window.electronAPI.ipcRenderer.send(RecordEvents.SEND_DATA, {
        data: arrayBuffer,
        isLast: !videoRecorder?.stream?.active,
        index: currentRecordChunksCount,
        fileUuid: currentRecordedUuid,
      })
      lastChunk = arrayBuffer
    }
    reader.readAsArrayBuffer(blob)
  }

  videoRecorder.onstop = function (e) {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.onstop",
    })

    timer.stop()

    if (isRecordCanceled || isRecordRestart) {
      window.electronAPI.ipcRenderer.send(RecordEvents.CANCEL, {
        fileUuid: currentRecordedUuid,
      })
    } else {
      window.electronAPI.ipcRenderer.send(RecordEvents.STOP, {
        fileUuid: currentRecordedUuid,
      })
    }

    lastChunk = null // Reset the lastChunk for the next recording

    // Create a link to download the recorded video
    // const url = URL.createObjectURL(blob)
    // const a = document.createElement("a")
    // a.style.display = "none"
    // a.href = url
    // a.download = "recorded-video.webm"
    // document.body.appendChild(a)
    // a.click()
    // window.URL.revokeObjectURL(url)

    stream!.getTracks().forEach((track) => track.stop())

    if (_canvas) {
      _stream.getTracks().forEach((track) => track.stop())
    }

    const cropScreen = document.querySelector(
      "#crop_video_screen"
    ) as HTMLElement
    if (cropScreen) {
      cropScreen.classList.remove("is-recording")
    }

    const canvasVideo = document.getElementById("__canvas_video_stream__")
    if (canvasVideo) {
      canvasVideo.remove()
    }

    if (_video) {
      const videoContainer = document.querySelector(
        ".webcamera-only-container"
      )!
      videoContainer.setAttribute("hidden", "")
      _video.srcObject = null
    }

    updateRecorderState("stopped")

    // if (_canvas) {
    //   _stream.oninactive = () => {
    //     window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    //       title: `_stream.oninactive`,
    //       body: `videoRecorder: ${videoRecorder}`,
    //     })

    //     if (videoRecorder) {
    //       videoRecorder.stop()
    //     }
    //   }
    // }
  }
}

const updateRecorderState = (state: RecorderState) => {
  const data: ISimpleStoreData = {
    key: "recordingState",
    value: state,
  }

  window.electronAPI.ipcRenderer.send(SimpleStoreEvents.UPDATE, data)
}

const createPreview = () => {
  if (stream) {
    let crop: any = undefined
    let screenSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    }

    if (lastStreamSettings?.action == "cropVideo") {
      if (cropVideoData) {
        crop = {
          x: cropVideoData.x,
          y: cropVideoData.y,
          width: cropVideoData.out_w,
          height: cropVideoData.out_h,
          scale: isWindows ? window.devicePixelRatio : 1,
        }
      }
    }

    if (lastStreamSettings?.action == "cameraOnly") {
      const video = document.querySelector(
        ".webcamera-only-container video"
      ) as HTMLVideoElement
      screenSize = { width: video.videoWidth, height: video.videoHeight }
    }

    captureVideoFrame(stream, screenSize, crop).then((previewDataURL) => {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "captureVideoFrame",
      })

      const data: ISimpleStoreData = {
        key: "lastVideoPreview",
        value: previewDataURL,
      }

      window.electronAPI.ipcRenderer.send(SimpleStoreEvents.UPDATE, data)
    })
  }
}
const startRecording = () => {
  isRecordCanceled = false
  isRecordRestart = false

  if (videoRecorder) {
    videoRecorder.start(5000)
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.start()",
    })

    timer.start(true)
    updateRecorderState("recording")

    createPreview()
  } else {
    window.electronAPI.ipcRenderer.send(RecordEvents.ERROR, {
      title: "videoRecorder.start().missing_videoRecorder",
    })
  }
}

const clearView = () => {
  const countdown = document.getElementById("fullscreen_countdown")
  if (countdown) {
    countdown.innerHTML = "3"
  }
  if (countdownContainer) {
    countdownContainer.setAttribute("hidden", "")
  }

  const canvasVideo = document.getElementById("__canvas_video_stream__")
  if (canvasVideo) {
    canvasVideo.remove()
  }

  const videoContainer = document.querySelector(".webcamera-only-container")
  if (videoContainer) {
    videoContainer.setAttribute("hidden", "")
  }

  const screenContainer = document.querySelector(".crop-screen-container")
  if (screenContainer) {
    screenContainer.setAttribute("hidden", "")
  }

  if (cropMoveable) {
    cropMoveable.destroy()
    cropMoveable = undefined
    cropVideoData = undefined
  }

  if (cameraMoveable) {
    cameraMoveable.destroy()
    cameraMoveable = undefined
  }

  clearCameraOnlyVideoStream()
}

const clearCameraOnlyVideoStream = () => {
  const video = document.querySelector("#webcam_only_video") as HTMLVideoElement
  video.srcObject = null

  if (stream && stream.getTracks()) {
    stream.getTracks().forEach((track) => track.stop())
  }
}
const setNoMicrophoneAlerts = (settings) => {
  if (!settings.audioDeviceId) {
    document.body.classList.add("no-microphone")
  } else {
    document.body.classList.remove("no-microphone")
  }
}

const updateCropVideoData = (data: {
  top?: number
  left?: number
  height?: number
  width?: number
}) => {
  if (!cropVideoData) {
    cropVideoData = <ICropVideoData>{}
  }

  if (data.top) {
    cropVideoData = { ...cropVideoData, y: data.top }
  }

  if (data.left) {
    cropVideoData = { ...cropVideoData, x: data.left }
  }

  if (data.width) {
    cropVideoData = { ...cropVideoData, out_w: data.width }
  }

  if (data.height) {
    cropVideoData = { ...cropVideoData, out_h: data.height }
  }

  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `updateCropVideoData`,
    body: JSON.stringify(cropVideoData),
  })
}

const initView = (settings: StreamSettings, force?: boolean) => {
  clearCameraOnlyVideoStream()
  setNoMicrophoneAlerts(settings)

  if (lastScreenAction == settings.action && !force) {
    return
  }

  lastScreenAction = settings.action
  clearView()

  if (settings.action == "cameraOnly") {
    const videoContainer = document.querySelector(".webcamera-only-container")!
    const video = document.querySelector(
      "#webcam_only_video"
    )! as HTMLVideoElement
    videoContainer.removeAttribute("hidden")
    const rect = videoContainer.getBoundingClientRect()
    video.width = rect.width
    video.height = rect.height

    cameraMoveable = new Moveable(document.body, {
      target: videoContainer as MoveableRefTargetType,
      container: document.body,
      className: "moveable-invisible-container",
      draggable: true,
    })

    cameraMoveable
      .on("dragStart", () => {
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      })
      .on("drag", ({ target, left, top }) => {
        target!.style.left = `${left}px`
        target!.style.top = `${top}px`
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      })
      .on("dragEnd", () => {
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      })
  }

  if (settings.action == "cropVideo") {
    const screenContainer = document.querySelector(".crop-screen-container")!
    screenContainer.removeAttribute("hidden")
    const screen = screenContainer.querySelector("#crop_video_screen")!
    const canvasVideo = screen.querySelector("canvas")!
    const screenRect = screen.getBoundingClientRect()
    canvasVideo.width = screenRect.width
    canvasVideo.height = screenRect.height

    updateCropVideoData({
      top: screenRect.top,
      left: screenRect.left,
      width: screenRect.width,
      height: screenRect.height,
    })

    cropMoveable = new Moveable(document.body, {
      target: screen as MoveableRefTargetType,
      container: document.body,
      className: "moveable-container",
      draggable: true,
      resizable: true,
    })

    cropMoveable
      .on("dragStart", () => {
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      })
      .on("drag", ({ target, left, top }) => {
        target!.style.left = `${left}px`
        target!.style.top = `${top}px`
        updateCropVideoData({ top, left })
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      })
      .on("dragEnd", () => {
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      })

    /* resizable */
    cropMoveable.on("resize", (data) => {
      const { target, width, height, drag } = data
      debouncedLogResize(
        drag.left,
        drag.left + width,
        drag.top,
        drag.top + height
      )
      target.style.top = `${drag.top}px`
      target.style.left = `${drag.left}px`
      target.style.width = `${width}px`
      target.style.height = `${height}px`

      updateCropVideoData({ top: drag.top, left: drag.left, width, height })

      canvasVideo.width = width
      canvasVideo.height = height
    })

    cropMoveable.updateRect()
  }
}

const showOnlyCameraError = (errorType?: "no-permission" | "no-camera") => {
  const error = document.querySelector(".webcamera-only-no-device")!
  const errorPermission = document.querySelector(
    ".webcamera-only-no-permission"
  )!
  const errorCamera = document.querySelector(".webcamera-only-no-camera")!
  if (errorType == "no-permission") {
    errorPermission.removeAttribute("hidden")
  } else if (errorType == "no-camera") {
    errorCamera.removeAttribute("hidden")
  } else {
    error.removeAttribute("hidden")
  }
}
const hideOnlyCameraError = () => {
  const error = document.querySelector(".webcamera-only-no-device")!
  const errorPermission = document.querySelector(
    ".webcamera-only-no-permission"
  )!
  const errorCamera = document.querySelector(".webcamera-only-no-camera")!
  error.setAttribute("hidden", "")
  errorPermission.setAttribute("hidden", "")
  errorCamera.setAttribute("hidden", "")
}

function initRecord(data: StreamSettings) {
  initView(data)

  if (data.action == "fullScreenVideo") {
    initStream(data)
      .then((stream) => {
        createVideo(stream, undefined, undefined)
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.init`,
        })
      })
      .catch((e) => {
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.error`,
          body: `${e}`,
          error: true,
        })
      })
  }

  if (data.action == "cameraOnly") {
    hideOnlyCameraError()
    const video = document.querySelector(
      "#webcam_only_video"
    ) as HTMLVideoElement

    if (!data.cameraDeviceId) {
      showOnlyCameraError("no-camera")
    }

    initStream(data)
      .then((stream) => {
        createVideo(stream, undefined, video)
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.init`,
        })
      })
      .catch((e) => {
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.error`,
          body: `${e}`,
          error: true,
        })

        if (e.toString().toLowerCase().includes("permission denied")) {
          showOnlyCameraError("no-permission")
        } else {
          showOnlyCameraError()
        }
      })
  }

  if (data.action == "cropVideo") {
    const canvas = document.querySelector("#crop_video_screen canvas")
    initStream(data)
      .then((stream) => {
        // createVideo(stream, canvas, undefined)
        createVideo(stream, undefined, undefined)
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.init`,
        })
      })
      .catch((e) => {
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.error`,
          body: `${e}`,
          error: true,
        })
      })
  }
}

window.electronAPI.ipcRenderer.on(
  "dropdown:select.screenshot",
  (event, data: StreamSettings) => {
    if (isRecording) {
      return
    }

    const settings: StreamSettings = lastStreamSettings
      ? { ...lastStreamSettings, action: "fullScreenVideo" }
      : { action: "fullScreenVideo" }
    initRecord(settings)
    lastStreamSettings = settings
  }
)

window.electronAPI.ipcRenderer.on(
  "record-settings-change",
  (event, settings: StreamSettings) => {
    if (isRecording) {
      return
    }

    lastStreamSettings = settings
    initRecord(lastStreamSettings)
  }
)

window.electronAPI.ipcRenderer.on(
  DialogWindowEvents.CALLBACK,
  (event, data: IDialogWindowCallbackData) => {
    if (data.action == "cancel") {
      if (videoRecorder?.state == "paused") {
        resumeRecording()
        isRecordCanceled = false
        isRecordRestart = false
      }
    }

    if (data.action == "ok") {
      if (isRecordRestart || isRecordCanceled) {
        stopRecording()
        if (isRecordRestart) {
          window.electronAPI.ipcRenderer.send(
            RecordEvents.START,
            lastStreamSettings
          )
        }
      }
    }

    dialogWindowToggle(false)
  }
)

function showCountdownScreen(delay = 80): Promise<boolean> {
  return new Promise((resolve) => {
    let timeleft = 2
    countdownContainer.removeAttribute("hidden")

    startTimer = setInterval(function () {
      if (timeleft <= 0) {
        clearInterval(startTimer)
        countdownContainer.setAttribute("hidden", "")
        countdown.innerHTML = ""
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
        setTimeout(() => {
          resolve(true)
        }, delay)
      } else {
        countdown.innerHTML = `${timeleft}`
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      }
      timeleft -= 1
    }, 1000)
  })
}

window.electronAPI.ipcRenderer.on(
  RecordEvents.START,
  (event, data: StreamSettings, file_uuid: string) => {
    currentRecordedUuid = file_uuid
    currentRecordChunksCount = 0

    showCountdownScreen().then(() => {
      if (data.action == "cropVideo") {
        const screen = document.querySelector(
          "#crop_video_screen"
        )! as HTMLElement
        screen.classList.add("is-recording")
        const screenMove = cropMoveable!.getControlBoxElement()
        screenMove.style.cssText = `pointer-events: none; opacity: 0; ${screenMove.style.cssText}`

        window.electronAPI.ipcRenderer.send(RecordEvents.SET_CROP_DATA, {
          cropVideoData,
          fileUuid: file_uuid,
        })
      }
      startRecording()
    })
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = state["recordingState"] == "recording"
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: "simpleStore.recordingState",
    body: JSON.stringify({ state: state["recordingState"] }),
  })

  if (["recording", "paused"].includes(state["recordingState"])) {
    document.body.classList.add("body--is-recording")
    stopBtn.classList.add("panel-btn--stop")
    controlPanel.classList.add("is-recording")
  } else {
    stopBtn.classList.remove("panel-btn--stop")
    document.body.classList.remove("body--is-recording")
  }

  if (["paused"].includes(state["recordingState"])) {
    resumeBtn.removeAttribute("hidden")
    pauseBtn.setAttribute("hidden", "")
  } else {
    resumeBtn.setAttribute("hidden", "")
    pauseBtn.removeAttribute("hidden")
  }

  if (["stopped"].includes(state["recordingState"])) {
    stopRecording()
    window.electronAPI.ipcRenderer.send("stop-recording", {
      showModal: !isRecordRestart,
    })
    lastScreenAction = undefined
    controlPanel.classList.remove("is-recording")
    const settings: StreamSettings =
      lastStreamSettings!.action == "cropVideo" && !isRecordRestart
        ? { ...lastStreamSettings, action: "fullScreenVideo" }
        : lastStreamSettings!
    initRecord(settings)

    lastStreamSettings = settings
    window.electronAPI.ipcRenderer.send("modal-window:render", settings.action)
  }

  window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
})

window.electronAPI.ipcRenderer.on(
  APIEvents.GET_ORGANIZATION_LIMITS,
  (event, limits: IOrganizationLimits) => {
    timer.updateLimits(limits.max_upload_duration || 0)
  }
)
window.electronAPI.ipcRenderer.on("screen:change", (event) => {
  if (lastStreamSettings && lastStreamSettings.action == "cropVideo") {
    initView(lastStreamSettings, true)
    initRecord(lastStreamSettings)
  }
})

window.electronAPI.ipcRenderer.on(RecordEvents.REQUEST_DATA, (event, data) => {
  videoRecorder?.requestData()
})

window.electronAPI.ipcRenderer.on(
  HotkeysEvents.STOP_RECORDING,
  (event, data) => {
    stopRecording()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.finished",
      body: JSON.stringify({ type: "hotkey" }),
    })
  }
)
window.electronAPI.ipcRenderer.on(
  HotkeysEvents.PAUSE_RECORDING,
  (event, data) => {
    pauseRecording()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.paused",
      body: JSON.stringify({ type: "hotkey" }),
    })
  }
)
window.electronAPI.ipcRenderer.on(
  HotkeysEvents.RESUME_RECORDING,
  (event, data) => {
    resumeRecording()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.resume",
      body: JSON.stringify({ type: "hotkey" }),
    })
  }
)
window.electronAPI.ipcRenderer.on(
  HotkeysEvents.RESTART_RECORDING,
  (event, data) => {
    openRestartRecordingDialog()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.restart",
      body: JSON.stringify({ type: "hotkey" }),
    })
  }
)
window.electronAPI.ipcRenderer.on(
  HotkeysEvents.DELETE_RECORDING,
  (event, data) => {
    openDeleteRecordingDialog()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "recording.delete",
      body: JSON.stringify({ type: "hotkey" }),
    })
  }
)

const controlBtns = controlPanel.querySelectorAll("button")
const popovers = document.querySelectorAll(".popover")
controlBtns.forEach((btn) => {
  btn.addEventListener(
    "mouseenter",
    () => {
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    },
    false
  )
  btn.addEventListener(
    "mouseleave",
    () => {
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    },
    false
  )
})
popovers.forEach((element) => {
  element.addEventListener(
    "transitionend",
    () => {
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    },
    false
  )
})

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `recorder.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `recorder.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("DOMContentLoaded", (event) => {
  const textEls = document.querySelectorAll(
    "[data-text]"
  ) as NodeListOf<HTMLElement>
  textEls.forEach((el) => {
    const text = el.dataset.text
    if (text) {
      el.innerHTML = TEXT_MAP[text]
    }
  })
})
