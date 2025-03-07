import {
  IModalWindowTabData,
  ModalWindowEvents,
  ScreenshotActionEvents,
  SimpleStoreEvents,
  StreamSettings,
} from "@shared/types/types"
import Moveable, { MoveableRefTargetType } from "moveable"
import { RecordEvents } from "../../shared/events/record.events"
import { LoggerEvents } from "../../shared/events/logger.events"
import { UserSettingsEvents } from "@shared/types/user-settings.types"

const videoContainer = document.getElementById(
  "webcamera-view"
) as HTMLDivElement
const videoContainerError = videoContainer.querySelector(
  ".webcamera-view-no-device"
) as HTMLDivElement
const videoContainerPermissionError = videoContainer.querySelector(
  ".webcamera-view-no-permission"
) as HTMLDivElement
const video = document.getElementById("video") as HTMLVideoElement
const changeCameraViewSizeBtn = document.querySelectorAll(
  ".js-camera-view-size"
)

let currentStream: MediaStream | undefined = undefined
let moveable: Moveable | undefined = undefined
let lastStreamSettings: StreamSettings | undefined = undefined
let isRecording = false
let isCountdown = false
let isScreenshotMode = false
let isAppShown = false
let cameraStopInterval: NodeJS.Timeout | undefined = undefined

function clearCameraStopInterval() {
  if (cameraStopInterval) {
    clearInterval(cameraStopInterval)
    cameraStopInterval = undefined
  }
}

function initMovable() {
  moveable = new Moveable(document.body, {
    target: videoContainer as MoveableRefTargetType,
    container: document.body,
    className: "moveable-invisible-container",
    draggable: true,
  })

  moveable
    .on("dragStart", ({ target, clientX, clientY }) => {
      target.classList.add("moveable-dragging")
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
    .on("drag", ({ target, left, top }) => {
      target!.style.left = `${left}px`
      target!.style.top = `${top}px`
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
    .on("dragEnd", ({ target, isDrag, clientX, clientY }) => {
      target.classList.remove("moveable-dragging")
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
}
initMovable()

function showVideo(hasError?: boolean, errorType?: "no-permission") {
  video.srcObject = currentStream!
  videoContainer.removeAttribute("hidden")

  if (hasError) {
    if (errorType == "no-permission") {
      videoContainerPermissionError.removeAttribute("hidden")
    } else {
      videoContainerError.removeAttribute("hidden")
    }
  } else {
    videoContainerError.setAttribute("hidden", "")
    videoContainerPermissionError.setAttribute("hidden", "")
  }
}

function startStream(deviseId) {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.startStream`,
    body: `currentStream: ${Boolean(currentStream)} deviseId: ${deviseId}`,
  })

  if (!deviseId) {
    return
  }

  if (!moveable) {
    initMovable()
  }

  if (!currentStream) {
    const constraints = {
      video: { deviceId: { exact: deviseId } },
    }

    const media = navigator.mediaDevices.getUserMedia(constraints)

    media
      .then((stream) => {
        currentStream = stream
        showVideo()
      })
      .catch((e) => {
        if (e.toString().toLowerCase().includes("permission denied")) {
          showVideo(true, "no-permission")
        } else {
          showVideo(true)
        }
      })
  } else {
    showVideo()
  }
}

function flipCamera(isFlip: boolean) {
  videoContainer.classList.toggle("is-flip", isFlip)
}
function stopStream() {
  videoContainer.setAttribute("hidden", "")
  videoContainerError.setAttribute("hidden", "")
  videoContainerPermissionError.setAttribute("hidden", "")
  window.electronAPI.ipcRenderer.send("invalidate-shadow", {})

  video.srcObject = null

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop())
    currentStream = undefined
  }

  if (moveable) {
    moveable.destroy()
    moveable = undefined
  }
}

function checkStream(data: StreamSettings) {
  if (
    ["cameraOnly", "fullScreenshot", "cropScreenshot"].includes(data.action)
  ) {
    stopStream()
    return
  }

  if (data.cameraDeviceId) {
    startStream(data.cameraDeviceId)
  } else {
    stopStream()
  }
}

window.electronAPI.ipcRenderer.on(
  "record-settings-change",
  (event, data: StreamSettings) => {
    if (!isScreenshotMode) {
      lastStreamSettings = data
      if (!isRecording) {
        checkStream(data)
      }
    } else {
      isScreenshotMode = false
    }
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = state["recordingState"] == "recording"
  isCountdown = state["recordingState"] == "countdown"
})

window.electronAPI.ipcRenderer.on("app:hide", () => {
  isAppShown = false
  cameraStopInterval = setInterval(stopStream, 1000)
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.app:hide`,
  })

  if (isRecording || isCountdown) {
    return
  }

  stopStream()
})

window.electronAPI.ipcRenderer.on(ScreenshotActionEvents.CROP, () => {
  if (isRecording || isCountdown) {
    return
  }

  stopStream()
})

window.electronAPI.ipcRenderer.on(
  ModalWindowEvents.TAB,
  (event, data: IModalWindowTabData) => {
    if (data.activeTab == "screenshot") {
      stopStream()
      isScreenshotMode = true
    }

    if (data.activeTab == "video") {
      checkStream(lastStreamSettings!)
      isScreenshotMode = false
    }
  }
)

window.electronAPI.ipcRenderer.on("app:show", () => {
  isAppShown = true
  clearCameraStopInterval()

  if (!isRecording && !isScreenshotMode) {
    checkStream(lastStreamSettings!)
  }
})

window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.FLIP_CAMERA_GET,
  (event, isFlip: boolean) => {
    if (typeof isFlip == "boolean") {
      flipCamera(isFlip)
    }
  }
)

changeCameraViewSizeBtn.forEach((button) => {
  button.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement
      const size = target.dataset.size!
      const container = document.querySelector(".webcamera-view-container")!
      container.classList.remove("sm", "lg", "xl")
      container.classList.add(size)

      if (moveable) {
        moveable.updateRect()
      }
    },
    false
  )
})

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
