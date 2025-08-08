import "@renderer/styles/index-page.scss"
import "@renderer/styles/panel.scss"
import {
  IModalWindowTabData,
  ModalWindowEvents,
  ScreenshotActionEvents,
  SimpleStoreEvents,
  IStreamSettings,
  ILastDeviceSettings,
  ScreenshotWindowEvents,
  DisplayEvents,
  IOrganizationLimits,
  DrawEvents,
  WebCameraWindowEvents,
} from "@shared/types/types"
import {
  RecordSettingsEvents,
  VideoRecorderEvents,
} from "../../shared/events/record.events"
import { LoggerEvents } from "../../shared/events/logger.events"
import {
  IUserSettingsShortcut,
  UserSettingsEvents,
} from "@shared/types/user-settings.types"
import { AppEvents } from "@shared/events/app.events"
import { ZoomPageDisabled } from "./helpers/zoom-page-disable"
import { Display } from "electron"
import { Timer } from "./helpers/timer"
import { APIEvents } from "@shared/events/api.events"
import {
  ILastWebCameraSize,
  IWebCameraWindowSettings,
  WebCameraAvatarTypes,
} from "@shared/types/webcamera.types"

let webCameraWindowSettings: IWebCameraWindowSettings = {
  avatarType: "circle-sm",
  isDropdownOpen: false,
  skipPosition: false,
}

let savedCameraWindowType: WebCameraAvatarTypes

const AVATAR_TYPES: WebCameraAvatarTypes[] = [
  "circle-sm",
  "circle-lg",
  "circle-xl",
  "rect-sm",
  "rect-lg",
  "rect-xl",
]

const ONLY_CAMERA_TYPES: WebCameraAvatarTypes[] = [
  "camera-only-sm",
  "camera-only-lg",
  "camera-only-xl",
]

const videoContainer = document.getElementById(
  "webcamera-view"
) as HTMLDivElement
const videoContainerError = videoContainer.querySelector(
  ".webcamera-view-no-device"
) as HTMLDivElement
const videoContainerPermissionError = videoContainer.querySelector(
  ".webcamera-view-no-permission"
) as HTMLDivElement
const videoContainerNoCamera = videoContainer.querySelector(
  ".webcamera-view-no-camera"
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

const timerDisplay = document.getElementById(
  "timerDisplay"
)! as HTMLButtonElement
let timer = new Timer(timerDisplay, 0)

const stopBtn = document.getElementById("stopBtn")! as HTMLButtonElement
const pauseBtn = document.getElementById("pauseBtn")! as HTMLButtonElement
const resumeBtn = document.getElementById("resumeBtn")! as HTMLButtonElement
const deleteBtn = document.getElementById("deleteBtn")! as HTMLButtonElement
const restartBtn = document.getElementById("restartBtn")! as HTMLButtonElement

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

function showVideo(
  hasError?: boolean,
  errorType?: "no-permission" | "no-camera"
) {
  videoContainerError.setAttribute("hidden", "")
  videoContainerPermissionError.setAttribute("hidden", "")
  videoContainerNoCamera.setAttribute("hidden", "")

  if (currentStream) {
    video.srcObject = currentStream
  }

  if (hasError) {
    if (errorType == "no-camera") {
      videoContainerNoCamera.removeAttribute("hidden")
    } else if (errorType == "no-permission") {
      videoContainerPermissionError.removeAttribute("hidden")
    } else {
      videoContainerError.removeAttribute("hidden")
    }
  }

  videoContainer.removeAttribute("hidden")
}

function startStream(deviseId) {
  if (!deviseId || deviseId == "no-camera") {
    if (lastStreamSettings?.action == "cameraOnly") {
      draggableZone.classList.add("has-avatar")
      showVideo(true, "no-camera")
    }
    return
  }

  draggableZone.classList.add("has-avatar")

  const constraints = {
    video: { deviceId: { exact: deviseId } },
  }

  window.electronAPI.ipcRenderer
    .invoke("isWebCameraWindowVisible")
    .then((isWebCameraWindowVisible) => {
      if (isWebCameraWindowVisible) {
        navigator.mediaDevices
          .getUserMedia(constraints)
          .then((stream) => {
            stopStreamTracks()
            currentStream = stream
            showVideo()
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
  if (data.cameraDeviceId && data.cameraDeviceId != "no-camera") {
    startStream(data.cameraDeviceId)
  } else {
    videoContainer.setAttribute("hidden", "")
    stopStream()
  }

  if (data.action == "cameraOnly") {
    stopStream()
    startStream(data.cameraDeviceId)
    videoContainer.removeAttribute("hidden")
  }
}

function handlePanelWithoutCamera(data: IStreamSettings) {
  const isCameraOnlyMode =
    webCameraWindowSettings.avatarType?.includes("camera-only")
  draggableZone.classList.remove("without-camera")
  if (!data.cameraDeviceId || data.cameraDeviceId == "no-camera") {
    if (data.action == "cameraOnly") {
      const type = isCameraOnlyMode
        ? webCameraWindowSettings.avatarType
        : "camera-only-sm"

      videoContainer.classList.add(type!)
      webCameraWindowSettings = {
        ...webCameraWindowSettings,
        skipPosition: false,
        avatarType: type,
      }
    } else {
      draggableZone.classList.add("without-camera")
      webCameraWindowSettings = {
        ...webCameraWindowSettings,
        skipPosition: false,
        avatarType: null,
      }
    }

    window.electronAPI.ipcRenderer.send(
      WebCameraWindowEvents.RESIZE,
      webCameraWindowSettings
    )
  } else {
    if (data.action == "cameraOnly") {
      const type = isCameraOnlyMode
        ? webCameraWindowSettings.avatarType
        : "camera-only-sm"
      videoContainer.classList.add(type!)
      webCameraWindowSettings = {
        ...webCameraWindowSettings,
        skipPosition: false,
        avatarType: type,
      }
      window.electronAPI.ipcRenderer.send(
        WebCameraWindowEvents.RESIZE,
        webCameraWindowSettings
      )
    } else {
    }
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

    draggableZone.classList.remove("has-webcamera-only")
    ;[...AVATAR_TYPES, ...ONLY_CAMERA_TYPES].forEach((t) => {
      if (t) {
        videoContainer.classList.remove(t)
      }
    })

    if (data.action == "cameraOnly") {
      draggableZone.classList.add("has-webcamera-only")
    } else {
      if (savedCameraWindowType) {
        videoContainer.classList.add(savedCameraWindowType)
      }

      webCameraWindowSettings = {
        ...webCameraWindowSettings,
        skipPosition: false,
        avatarType: savedCameraWindowType,
      }

      window.electronAPI.ipcRenderer.send(
        WebCameraWindowEvents.RESIZE,
        webCameraWindowSettings
      )
    }

    if (isAppShown) {
      handlePanelWithoutCamera(data)
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

    if (
      settings.action != "cameraOnly" &&
      (!settings.cameraDeviceId || settings.cameraDeviceId == "no-camera")
    ) {
      draggableZone.classList.add("without-camera")
    } else {
      draggableZone.classList.remove("without-camera")
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

window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_START, () => {
  closeWebcameraSize()
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

    if (lastStreamSettings && !skipAppShowEvent) {
      checkStream(lastStreamSettings)
    }

    // setLastPanelSettings(
    //   activeDisplay.bounds.width,
    //   activeDisplay.bounds.height
    // )
  }
)

changeCameraViewSizeBtn.forEach((button) => {
  button.addEventListener(
    "click",
    (event) => {
      renderWebcameraView(event.target as HTMLElement)
    },
    false
  )
})

changeCameraOnlySizeBtn.forEach((button) => {
  button.addEventListener(
    "click",
    (event) => {
      renderWebcameraView(event.target as HTMLElement)
      closeWebcameraSize()
    },
    false
  )
})

function renderWebcameraView(target: HTMLElement) {
  const type = target.dataset.type! as WebCameraAvatarTypes
  ;[...AVATAR_TYPES, ...ONLY_CAMERA_TYPES].forEach((t) => {
    if (t) {
      videoContainer.classList.remove(t)
    }
  })

  if (type) {
    videoContainer.classList.add(type)
  }

  webCameraWindowSettings = {
    ...webCameraWindowSettings,
    skipPosition: false,
    avatarType: type,
  }
  window.electronAPI.ipcRenderer.send(
    WebCameraWindowEvents.RESIZE,
    webCameraWindowSettings
  )
}

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

function checkDropdownVisibility() {
  setTimeout(() => {
    if (
      document.body.classList.contains("is-drawing") ||
      document.body.classList.contains("is-webcamera-size-open")
    ) {
      webCameraWindowSettings = {
        ...webCameraWindowSettings,
        isDropdownOpen: true,
        skipPosition: true,
      }
    } else {
      webCameraWindowSettings = {
        ...webCameraWindowSettings,
        isDropdownOpen: false,
        skipPosition: true,
      }
    }

    window.electronAPI.ipcRenderer.send(
      WebCameraWindowEvents.RESIZE,
      webCameraWindowSettings
    )
  })
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
  "mouseleave",
  () => {
    if (isControlsHidden && draggableZone.classList.contains("has-avatar")) {
      closeWebcameraSize()
    }
  },
  false
)

stopBtn.addEventListener("click", () => {
  window.electronAPI.ipcRenderer.send(VideoRecorderEvents.STOP, {})
  timer.stop()
})

resumeBtn.addEventListener("click", () => {
  timer.start(true)
  window.electronAPI.ipcRenderer.send(VideoRecorderEvents.RESUME, {})
})

pauseBtn.addEventListener("click", () => {
  timer.pause()
  window.electronAPI.ipcRenderer.send(VideoRecorderEvents.PAUSE, {})
})

deleteBtn.addEventListener("click", () => {
  timer.pause()
  window.electronAPI.ipcRenderer.send(VideoRecorderEvents.DELETE, {})
})
restartBtn.addEventListener("click", () => {
  timer.pause()
  window.electronAPI.ipcRenderer.send(VideoRecorderEvents.RESTART, {})
})

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isCountdown = state["recordingState"] == "countdown"

  if (state["recordingState"] == null) {
    timer.stop()
  }

  if (isCountdown) {
    document.body.classList.add("body--is-countdown")
    return
  }

  isRecording = ["recording", "paused"].includes(state["recordingState"])
  document.body.classList.remove("body--is-countdown")

  if (["recording"].includes(state["recordingState"])) {
    timer.start(true)
  }

  if (isRecording) {
    document.body.classList.add("body--is-recording")
    stopBtn.classList.add("panel-btn--stop")
    controlPanel.classList.add("is-recording")
  } else {
    stopBtn.classList.remove("panel-btn--stop")
    document.body.classList.remove("body--is-recording")
  }

  if (["paused"].includes(state["recordingState"])) {
    document.body.classList.add("is-paused")
    resumeBtn.removeAttribute("hidden")
    pauseBtn.setAttribute("hidden", "")
  } else {
    document.body.classList.remove("is-paused")
    resumeBtn.setAttribute("hidden", "")
    pauseBtn.removeAttribute("hidden")
  }

  if (["stopped"].includes(state["recordingState"])) {
    timer.stop()
  }
})

window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_END, (event, data) => {
  checkDropdownVisibility()
})
window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_START, (event, data) => {
  checkDropdownVisibility()
})

function setupAvatarSettings(settings: ILastWebCameraSize) {
  const type = settings.avatarType || "circle-sm"

  AVATAR_TYPES.forEach((t) => {
    if (t) {
      videoContainer.classList.remove(t)
    }
  })

  if (type) {
    videoContainer.classList.add(type)
  }

  webCameraWindowSettings = {
    ...webCameraWindowSettings,
    skipPosition: false,
    avatarType: type,
  }

  savedCameraWindowType = type
}

window.electronAPI.ipcRenderer.on(
  WebCameraWindowEvents.AVATAR_UPDATE,
  (event, settings: ILastWebCameraSize) => {
    setupAvatarSettings(settings)
  }
)

window.electronAPI.ipcRenderer.on(
  APIEvents.GET_ORGANIZATION_LIMITS,
  (event, limits: IOrganizationLimits) => {
    timer.updateLimits(limits.max_upload_duration || 0)
  }
)

let SHORTCUTS_TEXT_MAP = {}
function updateHotkeysTexts() {
  const textEls = document.querySelectorAll(
    "[data-text]"
  ) as NodeListOf<HTMLElement>
  textEls.forEach((el) => {
    const text = el.dataset.text
    if (text) {
      if (SHORTCUTS_TEXT_MAP[text]) {
        el.removeAttribute("hidden")
        el.innerHTML = SHORTCUTS_TEXT_MAP[text]
      } else {
        el.setAttribute("hidden", "")
      }
    }
  })
}
window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.SHORTCUTS_GET,
  (event, data: IUserSettingsShortcut[]) => {
    data.forEach((s) => {
      SHORTCUTS_TEXT_MAP[s.name] = s.disabled ? "" : s.keyCodes
    })
    updateHotkeysTexts()
  }
)

document.addEventListener("DOMContentLoaded", () => {
  const zoomPageDisabled = new ZoomPageDisabled()
  getLastMediaDevices()
  // initDraggableZone()
  if (
    lastStreamSettings?.cameraDeviceId &&
    lastStreamSettings.cameraDeviceId != "no-camera"
  ) {
    window.electronAPI.ipcRenderer
      .invoke("isWebCameraWindowVisible")
      .then((isWebCameraWindowVisible) => {
        if (isWebCameraWindowVisible) {
          videoContainer.removeAttribute("hidden")
          startStream(lastStreamSettings?.cameraDeviceId)
        }
      })
  }

  window.electronAPI.ipcRenderer
    .invoke("getLastWebcameraPosition")
    .then((settings) => {
      setupAvatarSettings(settings)
    })
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
