import {
  IModalWindowTabData,
  ModalWindowEvents,
  ScreenshotActionEvents,
  SimpleStoreEvents,
  IStreamSettings,
} from "@shared/types/types"
import Moveable, { MoveableRefTargetType } from "moveable"
import {
  RecordEvents,
  RecordSettingsEvents,
} from "../../shared/events/record.events"
import { LoggerEvents } from "../../shared/events/logger.events"
import { UserSettingsEvents } from "@shared/types/user-settings.types"
import { AppEvents } from "@shared/events/app.events"

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
let lastStreamSettings: IStreamSettings | undefined = undefined
let isRecording = false
let isCountdown = false
let isScreenshotMode = false
let isAppShown = false
let skipAppShowEvent = false

function initMovable() {
  moveable = new Moveable(document.body, {
    target: videoContainer as MoveableRefTargetType,
    dragTarget: videoContainer.querySelector(
      "#webcamera-view-target"
    ) as HTMLElement,
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
  if (!deviseId) {
    return
  }

  if (currentStream) {
    showVideo()
    return
  }

  if (!moveable) {
    initMovable()
  }

  const constraints = {
    video: { deviceId: { exact: deviseId } },
  }

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      if (lastStreamSettings?.action != "cameraOnly") {
        currentStream = stream
        showVideo()
      }
    })
    .catch((e) => {
      if (e.toString().toLowerCase().includes("permission denied")) {
        showVideo(true, "no-permission")
      } else {
        showVideo(true)
      }
    })
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

function checkStream(data: IStreamSettings) {
  if (
    ["cameraOnly", "fullScreenshot", "cropScreenshot"].includes(data.action)
  ) {
    stopStream()
    return
  }

  if (data.cameraDeviceId && data.cameraDeviceId != "no-camera") {
    startStream(data.cameraDeviceId)
  } else {
    stopStream()
  }
}

window.electronAPI.ipcRenderer.on(
  RecordSettingsEvents.UPDATE,
  (event, data: IStreamSettings) => {
    lastStreamSettings = data

    if (!isScreenshotMode) {
      if (!isRecording) {
        stopStream()
        checkStream(data)
      }
    } else {
      isScreenshotMode = false
    }
  }
)

window.electronAPI.ipcRenderer.on(
  RecordSettingsEvents.INIT,
  (event, settings: IStreamSettings) => {
    lastStreamSettings = settings

    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: `webcamera.renderer.${RecordSettingsEvents.INIT}`,
      body: JSON.stringify({ lastStreamSettings }),
    })

    if (isAppShown) {
      checkStream(lastStreamSettings)
    }
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = state["recordingState"] == "recording"
  isCountdown = state["recordingState"] == "countdown"
})

window.electronAPI.ipcRenderer.on(AppEvents.ON_BEFORE_HIDE, () => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.renderer.${AppEvents.ON_BEFORE_HIDE}`,
  })
  if (isRecording || isCountdown) {
    return
  }

  isAppShown = false

  stopStream()
})

window.electronAPI.ipcRenderer.on(AppEvents.ON_SHOW, () => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.renderer.${AppEvents.ON_BEFORE_HIDE}`,
    body: JSON.stringify({ lastStreamSettings }),
  })
  if (isRecording || isCountdown) {
    return
  }

  isAppShown = true

  if (!isRecording && !isScreenshotMode && !skipAppShowEvent) {
    if (lastStreamSettings) {
      checkStream(lastStreamSettings)
    }
  }

  skipAppShowEvent = false
})

window.electronAPI.ipcRenderer.on(ScreenshotActionEvents.CROP, () => {
  if (isRecording || isCountdown) {
    return
  }

  skipAppShowEvent = isAppShown ? false : true

  stopStream()
})

window.electronAPI.ipcRenderer.on(
  ModalWindowEvents.TAB,
  (event, data: IModalWindowTabData) => {
    if (data.activeTab == "screenshot") {
      isScreenshotMode = true
      stopStream()
    }

    if (data.activeTab == "video") {
      isScreenshotMode = false
      checkStream(lastStreamSettings!)
    }
  }
)

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
      const container = document.querySelector(
        ".webcamera-view-container"
      )! as HTMLElement
      const prevRect = container.getBoundingClientRect()
      container.classList.remove("sm", "lg", "xl")
      container.classList.add(size)
      const nextRect = container.getBoundingClientRect()

      const top =
        size == "xl"
          ? window.innerHeight / 2 - nextRect.height / 2
          : prevRect.bottom - nextRect.height
      const left =
        size == "xl"
          ? window.innerWidth / 2 - nextRect.width / 2
          : prevRect.left + prevRect.width / 2 - nextRect.width / 2
      const css = `left: ${left}px; top: ${top}px;`

      container.style.cssText = css

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
