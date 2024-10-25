import "@renderer/styles/index-page.scss"
import Moveable, { MoveableRefTargetType } from "moveable"
import {
  IOrganizationLimits,
  ISimpleStoreData,
  RecorderState,
  ScreenAction,
  SimpleStoreEvents,
  StreamSettings,
} from "@shared/types/types"
import { Timer } from "./helpers/timer"
import { FileUploadEvents } from "@shared/events/file-upload.events"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
import { captureVideoFrame } from "./helpers/capture-video-frame"

const isWindows = navigator.userAgent.indexOf("Windows") != -1
const countdownContainer = document.querySelector(
  ".fullscreen-countdown-container"
)!
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

function cancelRecording() {
  if (startTimer) {
    clearInterval(startTimer)

    if (lastStreamSettings) {
      initView(lastStreamSettings, true)
      initRecord(lastStreamSettings)
    }

    window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    window.electronAPI.ipcRenderer.send("modal-window:open", {})
  }
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
    videoRecorder.resume()
    timer.start(true)
  }
})

pauseBtn.addEventListener("click", () => {
  if (videoRecorder && videoRecorder.state == "recording") {
    videoRecorder.pause()
    timer.pause()
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
    mimeType: "video/mp4",
    videoBitsPerSecond: 2500000, // 2.5 Mbps
  })

  videoRecorder.onerror = (event) => {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.onerror",
      body: JSON.stringify(event),
    })
  }

  let chunks: any[] = []

  if (_video) {
    _video.srcObject = new MediaStream([..._stream.getVideoTracks()])

    if (_stream.getVideoTracks()[0]) {
      const stream_settings = _stream.getVideoTracks()[0].getSettings()
    }
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
    chunks.push(e.data)
  }

  videoRecorder.onstop = function (e) {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.onstop",
    })
    timer.stop()
    const blob = new Blob(chunks, { type: "video/mp4" })
    chunks = [] // Reset the chunks for the next recording

    const reader = new FileReader()
    reader.onload = function () {
      const arrayBuffer = reader.result

      window.electronAPI.ipcRenderer.send(
        FileUploadEvents.RECORD_CREATED,
        arrayBuffer
      )
    }
    reader.readAsArrayBuffer(blob)

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
    let size = { width: window.innerWidth, height: window.innerHeight }

    if (lastStreamSettings?.action == "cropVideo") {
      const canvas = document.querySelector(
        "#crop_video_screen canvas"
      ) as HTMLCanvasElement
      const position = canvas.getBoundingClientRect()
      size = { width: position.width, height: position.height }
    }

    if (lastStreamSettings?.action == "cameraOnly") {
      const video = document.querySelector(
        ".webcamera-only-container video"
      ) as HTMLVideoElement
      size = { width: video.videoWidth, height: video.videoHeight }
    }

    captureVideoFrame(stream, size).then((previewDataURL) => {
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
  if (videoRecorder) {
    videoRecorder.start()
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "videoRecorder.start()",
    })

    timer.start(true)
    updateRecorderState("recording")

    createPreview()
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
    canvasVideo.width = screen.getBoundingClientRect().width
    canvasVideo.height = screen.getBoundingClientRect().height

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
        createVideo(stream, canvas, undefined)
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.init`,
        })
      })
      .catch((e) => {
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `${data.action}.combineStream.error`,
          body: `${e}`,
        })
      })
  }
}

window.electronAPI.ipcRenderer.on(
  "record-settings-change",
  (event, data: StreamSettings) => {
    lastStreamSettings = data
    initRecord(data)
  }
)

window.electronAPI.ipcRenderer.on(
  "start-recording",
  (event, data: StreamSettings) => {
    if (data.action == "fullScreenVideo") {
      countdownContainer.removeAttribute("hidden")
      let timeleft = 2
      startTimer = setInterval(function () {
        if (timeleft <= 0) {
          clearInterval(startTimer)
          countdownContainer.setAttribute("hidden", "")
          countdown.innerHTML = ""
          window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
          setTimeout(() => {
            startRecording()
          }, 80)
        } else {
          countdown.innerHTML = `${timeleft}`
          window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
        }
        timeleft -= 1
      }, 1000)
    } else {
      if (data.action == "cropVideo") {
        const screen = document.querySelector(
          "#crop_video_screen"
        )! as HTMLElement
        screen.classList.add("is-recording")
        const screenMove = cropMoveable!.getControlBoxElement()
        screenMove.style.cssText = `pointer-events: none; opacity: 0; ${screenMove.style.cssText}`

        const canvasVideo = document.querySelector(
          "#__canvas_video_stream__"
        )! as HTMLVideoElement
        canvasVideo.play()

        // Координаты области экрана для захвата
        const canvas = document.querySelector(
          "#crop_video_screen canvas"
        ) as HTMLCanvasElement
        const canvasPosition = canvas.getBoundingClientRect()
        const ctx = canvas.getContext("2d")
        const deviceRation =
          navigator.userAgent.indexOf("Mac") != -1 ? 1 : window.devicePixelRatio
        const captureX = deviceRation * canvasPosition.left
        const captureY = deviceRation * canvasPosition.top
        const captureWidth = deviceRation * canvasPosition.width
        const captureHeight = deviceRation * canvasPosition.height

        // Обновление canvas с захваченной областью экрана
        function updateCanvas() {
          ctx!.drawImage(
            canvasVideo,
            captureX,
            captureY,
            captureWidth,
            captureHeight,
            0,
            0,
            canvasPosition.width,
            canvasPosition.height
          )
          requestId = requestAnimationFrame(updateCanvas)
        }

        updateCanvas()
      }

      setTimeout(() => {
        startRecording()
      })
    }
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
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
    window.electronAPI.ipcRenderer.send("stop-recording", {})
    lastScreenAction = undefined
    controlPanel.classList.remove("is-recording")
    const settings: StreamSettings =
      lastStreamSettings!.action == "cropVideo"
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
