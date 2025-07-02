import {
  IModalWindowTabData,
  ModalWindowEvents,
  ScreenshotActionEvents,
  SimpleStoreEvents,
  IStreamSettings,
  ILastDeviceSettings,
  ScreenshotWindowEvents,
  DisplayEvents,
} from "@shared/types/types"
import Moveable, { MoveableRefTargetType } from "moveable"
import { RecordSettingsEvents } from "../../shared/events/record.events"
import { LoggerEvents } from "../../shared/events/logger.events"
import { UserSettingsEvents } from "@shared/types/user-settings.types"
import { AppEvents } from "@shared/events/app.events"
import { Display } from "electron"
import { title } from "process"

type AvatarTypes =
  | "circle-sm"
  | "circle-lg"
  | "circle-xl"
  | "rect-sm"
  | "rect-lg"
  | "rect-xl"
interface ILastPanelSettings {
  left: number
  top: number
  avatarType: AvatarTypes
}
const AVATAR_TYPES: AvatarTypes[] = [
  "circle-sm",
  "circle-lg",
  "circle-xl",
  "rect-sm",
  "rect-lg",
  "rect-xl",
]
const AVATAR_SIZES: { [key: string]: { width: number; height: number } } = {
  "circle-sm": { width: 200, height: 200 },
  "circle-lg": { width: 360, height: 360 },
  "circle-xl": { width: 560, height: 560 },
  "rect-sm": { width: 300, height: (9 / 16) * 300 },
  "rect-lg": { width: 650, height: (9 / 16) * 650 },
  "rect-xl": {
    width: 0.8 * document.body.offsetWidth,
    height: (9 / 16) * 0.8 * document.body.offsetWidth,
  },
}

const LAST_PANEL_SETTINGS_NAME = "LAST_PANEL_SETTINGS"
let lastPanelSettings: ILastPanelSettings | null = null

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

function getLastPanelSettings(): ILastPanelSettings | null {
  const lastDraggablePosStr = localStorage.getItem(LAST_PANEL_SETTINGS_NAME)
  return lastDraggablePosStr ? JSON.parse(lastDraggablePosStr) : null
}

function adjustPanelPosition(
  maxWidth: number,
  maxHeight: number
): { x: number; y: number } {
  const rect = draggableZone.getBoundingClientRect()
  let x = rect.left < 0 ? 0 : rect.left
  let y = rect.top < 0 ? 0 : rect.top

  if (rect.right > maxWidth) {
    x = maxWidth - rect.width
  }

  if (y + rect.height > maxHeight) {
    y = maxHeight - rect.height
  }

  draggableZone.style.left = `${x}px`
  draggableZone.style.top = `${y}px`

  return { x, y }
}

function setLastPanelSettings(maxWidth?: number, maxHeight?: number) {
  const maxW = maxWidth || document.body.offsetWidth
  const maxH = maxHeight || document.body.offsetHeight
  const pos = adjustPanelPosition(maxW, maxH)
  const left = pos.x
  const top = pos.y
  const avatarType: AvatarTypes =
    ([...videoContainer.classList].find((c) =>
      AVATAR_TYPES.includes(c as AvatarTypes)
    ) as AvatarTypes) || AVATAR_TYPES[0]

  if (typeof left == "number" && typeof top == "number" && avatarType) {
    lastPanelSettings = { left, top, avatarType }
    localStorage.setItem(
      LAST_PANEL_SETTINGS_NAME,
      JSON.stringify(lastPanelSettings)
    )
  }
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
      setLastPanelSettings()
    })

  lastPanelSettings = getLastPanelSettings()

  if (lastPanelSettings) {
    AVATAR_TYPES.forEach((type) => {
      videoContainer.classList.remove(type)
    })
    videoContainer.classList.add(lastPanelSettings.avatarType)

    const panel = document.querySelector(
      ".panel-settings-container"
    )! as HTMLElement
    const webcamera = document.querySelector(
      ".webcamera-view-container"
    )! as HTMLElement
    const maxWidth = window.innerWidth
    const maxHeight = window.innerHeight
    const size =
      lastStreamSettings?.cameraDeviceId &&
      lastStreamSettings.cameraDeviceId != "no-camera"
        ? AVATAR_SIZES[lastPanelSettings.avatarType]!
        : { width: panel.clientWidth, height: panel.clientHeight }

    let left = lastPanelSettings.left
    let top = lastPanelSettings.top
    const topBuffer = panel.clientHeight || 0

    if (maxWidth < size.width + left) {
      left = maxWidth - size.width
    }

    if (maxHeight < size.height + top + topBuffer) {
      top = maxHeight - size.height - topBuffer
    }

    draggableZone.style.left = `${left}px`
    draggableZone.style.top = `${top}px`
  }

  draggable.updateRect()
}

function showVideo(hasError?: boolean, errorType?: "no-permission") {
  videoContainerError.setAttribute("hidden", "")
  videoContainerPermissionError.setAttribute("hidden", "")
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
  }
}

function startStream(deviseId) {
  if (!deviseId || deviseId == "no-camera") {
    return
  }

  const constraints = {
    video: { deviceId: { exact: deviseId } },
  }

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      if (lastStreamSettings?.action == "cameraOnly") {
        stream.getTracks().forEach((track) => track.stop())
      } else {
        stopStreamTracks()
        currentStream = stream
        showVideo()
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
function togglePanelHidden(isPanelHidden: boolean) {
  draggableZone.classList.toggle("is-recording-panel-hidden", isPanelHidden)
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
  // videoContainer.setAttribute("hidden", "")
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
    videoContainer.setAttribute("hidden", "")
    stopStream()
    return
  }

  if (data.cameraDeviceId && data.cameraDeviceId != "no-camera") {
    startStream(data.cameraDeviceId)
  } else {
    videoContainer.setAttribute("hidden", "")
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

window.electronAPI.ipcRenderer.on(ScreenshotWindowEvents.RENDER_IMAGE, () => {
  videoContainer.removeAttribute("hidden")
})

window.electronAPI.ipcRenderer.on(ScreenshotActionEvents.CROP, () => {
  if (isRecording || isCountdown) {
    return
  }

  skipAppShowEvent = isAppShown ? false : true
  videoContainer.setAttribute("hidden", "")
  stopStream()
})

window.electronAPI.ipcRenderer.on(
  ModalWindowEvents.TAB,
  (event, data: IModalWindowTabData) => {
    if (data.activeTab == "screenshot") {
      isScreenshotMode = true
      videoContainer.setAttribute("hidden", "")
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

window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.PANEL_HIDDEN_GET,
  (event, isPanelHidden: boolean) => {
    if (typeof isPanelHidden == "boolean") {
      togglePanelHidden(isPanelHidden)
    }
  }
)

window.electronAPI.ipcRenderer.on(
  DisplayEvents.UPDATE,
  (event, activeDisplay: Display) => {
    if (isRecording) {
      return
    }

    if (lastStreamSettings) {
      checkStream(lastStreamSettings)
    }

    setLastPanelSettings(
      activeDisplay.bounds.width,
      activeDisplay.bounds.height
    )
  }
)

changeCameraViewSizeBtn.forEach((button) => {
  button.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement
      const type = target.dataset.type! as AvatarTypes
      const prevRect = videoContainer.getBoundingClientRect()
      AVATAR_TYPES.forEach((t) => {
        videoContainer.classList.remove(t)
      })
      videoContainer.classList.add(type)
      const nextRect = videoContainer.getBoundingClientRect()

      const top =
        type == "rect-xl"
          ? window.innerHeight / 2 - nextRect.height / 2
          : prevRect.bottom - nextRect.height
      const left =
        type == "rect-xl"
          ? window.innerWidth / 2 - nextRect.width / 2
          : prevRect.left + prevRect.width / 2 - nextRect.width / 2
      const css = `left: ${left}px; top: ${top}px;`

      draggableZone.style.cssText = css

      if (draggable) {
        draggable.updateRect()
      }

      setLastPanelSettings()
      // closeWebcameraSize()
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

document.addEventListener("DOMContentLoaded", () => {
  getLastMediaDevices()
  initDraggableZone()
  if (
    lastStreamSettings?.cameraDeviceId &&
    lastStreamSettings.cameraDeviceId != "no-camera"
  ) {
    window.electronAPI.ipcRenderer
      .invoke("isMainWindowVisible")
      .then((isMainWindowVisible) => {
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "isMainWindowVisible: ",
          body: `${isMainWindowVisible}`,
        })
        if (isMainWindowVisible) {
          videoContainer.removeAttribute("hidden")
          startStream(lastStreamSettings?.cameraDeviceId)
        }
      })
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
