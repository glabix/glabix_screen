import {
  IModalWindowTabData,
  ModalWindowEvents,
  ScreenshotActionEvents,
  SimpleStoreEvents,
  IStreamSettings,
  ILastDeviceSettings,
} from "@shared/types/types"
import Moveable, { MoveableRefTargetType } from "moveable"
import { RecordSettingsEvents } from "../../shared/events/record.events"
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
const changeCameraOnlySizeBtn = document.querySelectorAll(
  ".js-camera-only-size"
)!
const controlPanel = document.querySelector(".panel-wrapper")!
const draggableZone = document.querySelector(".draggable-zone") as HTMLElement
const draggableZoneTarget = draggableZone.querySelector(
  ".draggable-zone-target"
) as HTMLElement
let draggable: Moveable | undefined = undefined
let currentStream: MediaStream | undefined = undefined
let lastStreamSettings: IStreamSettings | undefined = undefined
let isRecording = false
let isCountdown = false
let isScreenshotMode = false
let isAppShown = false
let skipAppShowEvent = false
let isControlsHidden = false

const LAST_DEVICE_IDS = "LAST_DEVICE_IDS"
function getLastMediaDevices() {
  const lastDevicesStr = localStorage.getItem(LAST_DEVICE_IDS)

  if (lastDevicesStr) {
    const devices: ILastDeviceSettings = JSON.parse(lastDevicesStr)
    lastStreamSettings = {
      action: "fullScreenVideo",
      cameraDeviceId: devices.videoId,
    }
  }

  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `webcamera.renderer.getLastMediaDevices`,
    body: JSON.stringify({ lastStreamSettings }),
  })
}

function initDraggableZone() {
  draggable = new Moveable(document.body, {
    target: draggableZone as MoveableRefTargetType,
    dragTarget: draggableZoneTarget,
    preventClickEventOnDrag: false,
    container: document.body,
    className: "moveable-invisible-container",
    draggable: true,
  })

  draggable
    .on("dragStart", ({ target }) => {
      target.classList.add("moveable-dragging")
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
    .on("drag", ({ target, left, top }) => {
      target!.style.left = `${left}px`
      target!.style.top = `${top}px`
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
    .on("dragEnd", ({ target }) => {
      target.classList.remove("moveable-dragging")
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
}

function showVideo(hasError?: boolean, errorType?: "no-permission") {
  videoContainer.removeAttribute("hidden")
  draggableZone.classList.add("has-avatar")

  if (currentStream) {
    video.srcObject = currentStream
  }

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
  if (!deviseId || deviseId == "no-camera") {
    return
  }

  if (currentStream) {
    showVideo()
    return
  }

  const constraints = {
    video: { deviceId: { exact: deviseId } },
  }

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      if (lastStreamSettings?.action != "cameraOnly") {
        stopStreamTracks()
        currentStream = stream
        showVideo()
      } else {
        stream.getTracks().forEach((track) => track.stop())
      }
    })
    .catch((e) => {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: `webcamera.renderer.startStream.catch(e)`,
        body: JSON.stringify({ e }),
        error: true,
      })
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

function togglePanelVisibility(_isControlsHidden: boolean) {
  isControlsHidden = _isControlsHidden
  draggableZone.classList.toggle("is-controls-hidden", isControlsHidden)
  closeWebcameraSize()
}

function stopStreamTracks() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop())
    currentStream = undefined
    video.srcObject = null
  }
}

function stopStream() {
  videoContainer.setAttribute("hidden", "")
  videoContainerError.setAttribute("hidden", "")
  videoContainerPermissionError.setAttribute("hidden", "")
  draggableZone.classList.remove("has-avatar")
  window.electronAPI.ipcRenderer.send("invalidate-shadow", {})

  stopStreamTracks()
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

    if (isAppShown && !currentStream) {
      startStream(lastStreamSettings.cameraDeviceId)
    }
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = state["recordingState"] == "recording"
  isCountdown = state["recordingState"] == "countdown"
})

window.electronAPI.ipcRenderer.on(AppEvents.ON_BEFORE_HIDE, () => {
  if (isRecording || isCountdown) {
    return
  }

  isAppShown = false

  stopStream()
})

window.electronAPI.ipcRenderer.on(AppEvents.ON_HIDE, () => {
  if (isRecording || isCountdown) {
    return
  }

  stopStream()
})

window.electronAPI.ipcRenderer.on(AppEvents.ON_SHOW, () => {
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

window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.PANEL_VISIBILITY_GET,
  (event, isPanelHidden: boolean) => {
    if (typeof isPanelHidden == "boolean") {
      togglePanelVisibility(isPanelHidden)
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

      draggableZone.style.cssText = css

      if (draggable) {
        draggable.updateRect()
      }

      closeWebcameraSize()
    },
    false
  )
})

changeCameraOnlySizeBtn.forEach((button) => {
  button.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement
      const size = target.dataset.size!
      const container = document.querySelector(".webcamera-only-container")!
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

      draggableZone.style.cssText = css

      if (draggable) {
        draggable.updateRect()
      }

      closeWebcameraSize()
    },
    false
  )
})

// Toggle webcamera size
const webcameraSizeBtn = document.querySelector(
  "#webcamera-size-btn"
)! as HTMLElement
const drawToggle = document.querySelector("#draw-btn")! as HTMLElement
let isWebcameraSizeOpen = false
function openWebcameraSize() {
  isWebcameraSizeOpen = true
  document.body.classList.add("is-webcamera-size-open")
}

function closeWebcameraSize() {
  isWebcameraSizeOpen = false
  document.body.classList.remove("is-webcamera-size-open")
}

drawToggle.addEventListener(
  "click",
  () => {
    closeWebcameraSize()
  },
  false
)

webcameraSizeBtn.addEventListener(
  "click",
  () => {
    if (isWebcameraSizeOpen) {
      closeWebcameraSize()
    } else {
      openWebcameraSize()
    }
  },
  false
)

draggableZone.addEventListener(
  "mouseenter",
  () => {
    draggableZone.classList.add("is-mouseenter")
  },
  false
)

controlPanel.addEventListener(
  "mouseenter",
  () => {
    draggableZone.classList.add("is-panel-mouseenter")
  },
  false
)

draggableZone.addEventListener(
  "mouseleave",
  () => {
    draggableZone.classList.remove("is-mouseenter", "is-panel-mouseenter")
    if (isControlsHidden && draggableZone.classList.contains("has-avatar")) {
      closeWebcameraSize()
    }
  },
  false
)

getLastMediaDevices()
initDraggableZone()

document.addEventListener("DOMContentLoaded", () => {
  if (
    lastStreamSettings?.cameraDeviceId &&
    lastStreamSettings.cameraDeviceId != "no-camera" &&
    isAppShown
  ) {
    startStream(lastStreamSettings?.cameraDeviceId)
  }
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
