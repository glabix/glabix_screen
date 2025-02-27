import "@renderer/styles/modal-page.scss"
import {
  DropdownListType,
  IDropdownItem,
  IDropdownList,
  IDropdownPageSelectData,
  IOrganizationLimits,
  IMediaDevicesAccess,
  MediaDeviceType,
  ScreenAction,
  StreamSettings,
  ModalWindowHeight,
  IAvatarData,
  SimpleStoreEvents,
  ModalWindowEvents,
  IModalWindowTabData,
  ScreenshotActionEvents,
  ModalWindowWidth,
  HotkeysEvents,
} from "@shared/types/types"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
import { RecordEvents } from "../../shared/events/record.events"
import { Palette } from "@shared/helpers/palette"
import { debounce } from "@shared/helpers/debounce"
import {
  IUserSettingsShortcut,
  UserSettingsEvents,
} from "@shared/types/user-settings.types"
import { ShortcutsUpdater } from "./helpers/shortcuts.helper"
type SettingsTabType = "root" | "shortCuts" | "videoAudio"
type PageViewType =
  | "modal"
  | "permissions"
  | "limits"
  | "no-microphone"
  | "profile"
  | "settings"
interface IDeviceIds {
  videoId?: string
  audioId?: string
  systemAudio?: boolean
}
const SETTINGS_SHORT_CUTS_LOCALES = {
  [HotkeysEvents.FULL_SCREENSHOT]: "Скриншот всего экрана",
  [HotkeysEvents.CROP_SCREENSHOT]: "Скриншот выбранной области",
  [HotkeysEvents.STOP_RECORDING]: "Остановка видео",
  [HotkeysEvents.PAUSE_RECORDING]: "Пауза/отмена паузы видео",
  [HotkeysEvents.RESTART_RECORDING]: "Перезапуск записи",
  [HotkeysEvents.DELETE_RECORDING]: "Отмена записи",
  [HotkeysEvents.DRAW]: "Вкл./выкл. лазерной указки",
}
let SHORTCUTS_TEXT_MAP = {}
const shortcutsUpdater = new ShortcutsUpdater()
const LAST_DEVICE_IDS = "LAST_DEVICE_IDS"
const ACCOUNT_DATA = "ACCOUNT_DATA"
const isWindows = navigator.userAgent.indexOf("Windows") != -1
let isAllowRecords: boolean | undefined = undefined
let isAllowScreenshots: boolean | undefined = undefined
let activePageView: PageViewType
let activeSettingTab: SettingsTabType = "root"
let openedDropdownType: DropdownListType | undefined = undefined
const modalContent = document.querySelector(".modal-content")!
const profileContent = document.querySelector(".profile-content")!
const settingsContent = document.querySelector(".settings-content")!
const permissionsContent = document.querySelector(".permissions-content")!
const limitsContent = document.querySelector(".limits-content")!
const noMicrophoneContent = document.querySelector(".no-microphone-content")!

const audioDeviceContainer = document.querySelector("#audio_device_container")!
const videoDeviceContainer = document.querySelector("#video_device_container")!
const organizationContainer = document.querySelector(
  "#organizations_container"
)!
const systemAudioCheckbox = document.querySelector(
  ".system-audio-checkbox"
) as HTMLInputElement

let isRecording = false

let screenActionsList: IDropdownItem[] = [
  {
    id: "fullScreenVideo",
    label: "Запись всего экрана",
    isSelected: true,
    extraData: {
      icon: "i-display",
    },
  },
  {
    id: "cropVideo",
    label: "Произвольная область",
    isSelected: false,
    extraData: {
      icon: "i-expand-wide",
    },
  },
  {
    id: "cameraOnly",
    label: "Только камера",
    isSelected: false,
    extraData: {
      icon: "i-video",
    },
  },
]

let activeScreenActionItem: IDropdownItem | undefined = screenActionsList[0]!
let audioDevicesList: MediaDeviceInfo[] = []
let activeAudioDevice: MediaDeviceInfo
let hasCamera = false
let hasMicrophone = false
let visualAudioAnimationId = 0
let visualAudioStream: MediaStream | null = null
let lastDeviceIds: IDeviceIds = {}
const noVideoDevice: MediaDeviceInfo = {
  deviceId: "no-camera",
  label: "Без камеры",
  kind: "videoinput",
  groupId: "",
  toJSON: () => {},
}
const noAudioDevice: MediaDeviceInfo = {
  deviceId: "no-microphone",
  label: "Без микрофона",
  kind: "audioinput",
  groupId: "",
  toJSON: () => {},
}
let videoDevicesList: MediaDeviceInfo[] = []
let activeVideoDevice: MediaDeviceInfo | undefined
let activeScreenAction: ScreenAction = "fullScreenVideo"
let streamSettings: StreamSettings = {
  action: activeScreenAction,
  video: true,
}
let isScreenshotTab = false
const flipCheckbox = document.querySelector(
  ".js-flip-camera-checkbox"
)! as HTMLInputElement
const tabButtons = document.querySelectorAll(
  "[data-record-button]"
) as NodeListOf<HTMLElement>
const tabContainers = document.querySelectorAll(
  "[data-record-container]"
) as NodeListOf<HTMLElement>
tabButtons.forEach((btn) => {
  btn.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement
      const targetType = target.dataset.recordButton
      const data = { activeTab: targetType } as IModalWindowTabData

      if (
        (isScreenshotTab && data.activeTab == "screenshot") ||
        (!isScreenshotTab && data.activeTab == "video")
      ) {
        return
      }

      tabButtons.forEach((b) => {
        b.classList.remove("selected")
      })
      tabContainers.forEach((c) => c.setAttribute("hidden", ""))
      document
        .querySelector(`[data-record-container="${targetType}"]`)
        ?.removeAttribute("hidden")
      target.classList.add("selected")

      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "modal-window.tab.change",
        body: targetType,
      })

      if (data.activeTab == "screenshot") {
        stopVisualAudio()
        isScreenshotTab = true
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: true,
          width: ModalWindowWidth.MODAL,
          height: ModalWindowHeight.SCREENSHOT_TAB,
        })
      }

      if (data.activeTab == "video") {
        initVisualAudio()
        isScreenshotTab = false
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: true,
          width: ModalWindowWidth.MODAL,
          height: ModalWindowHeight.MODAL,
        })
      }

      window.electronAPI.ipcRenderer.send(ModalWindowEvents.TAB, data)
    },
    false
  )
})

const screenshotButtons = document.querySelectorAll(
  "[data-screenshot-button]"
) as NodeListOf<HTMLButtonElement>
screenshotButtons.forEach((btn) => {
  btn.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLButtonElement
      const targetData = target.dataset.screenshotButton

      if (!isAllowScreenshots) {
        window.electronAPI.ipcRenderer.send(
          "redirect:app",
          "org/%orgId%/settings/payments"
        )
        return
      }

      if (targetData == "full") {
        window.electronAPI.ipcRenderer.send(ScreenshotActionEvents.FULL)
      }

      if (targetData == "crop") {
        window.electronAPI.ipcRenderer.send(ScreenshotActionEvents.CROP)
      }
    },
    false
  )
})

function getLastMediaDevices(): IDeviceIds {
  const lastDeviceIdsStr = localStorage.getItem(LAST_DEVICE_IDS)
  const lastDeviceIds: IDeviceIds = lastDeviceIdsStr
    ? JSON.parse(lastDeviceIdsStr)
    : {}
  return lastDeviceIds
}

function setLastMediaDevices(
  lastAudioDeviceId?: string,
  lastVideoDeviceId?: string,
  systemAudio?: boolean
) {
  if (lastAudioDeviceId) {
    lastDeviceIds = { ...lastDeviceIds, audioId: lastAudioDeviceId }
  }

  if (lastVideoDeviceId) {
    lastDeviceIds = { ...lastDeviceIds, videoId: lastVideoDeviceId }
  }

  if (typeof systemAudio == "boolean") {
    lastDeviceIds = { ...lastDeviceIds, systemAudio }
  }

  localStorage.setItem(LAST_DEVICE_IDS, JSON.stringify(lastDeviceIds))
}

function stopVisualAudio() {
  if (visualAudioStream) {
    visualAudioStream.getTracks().forEach((s) => s.stop())
    visualAudioStream = null
  }

  if (visualAudioAnimationId) {
    cancelAnimationFrame(visualAudioAnimationId)
    visualAudioAnimationId = 0
  }
}

function initVisualAudio() {
  stopVisualAudio()

  if (
    streamSettings.audioDeviceId &&
    streamSettings.audioDeviceId != "no-microphone"
  ) {
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: streamSettings.audioDeviceId,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        },
        video: false,
      })
      .then((stream) => {
        visualAudioStream = stream
        const context = new AudioContext()
        const source = context.createMediaStreamSource(visualAudioStream)
        const analyser = context.createAnalyser()

        analyser.fftSize = 2048
        source.connect(analyser)

        const canvases = document.querySelectorAll(
          ".visualizer"
        )! as NodeListOf<HTMLCanvasElement>
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        function updateVisual() {
          canvases.forEach((canvas) => {
            const canvasCtx = canvas.getContext("2d")!
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
            analyser.getByteTimeDomainData(dataArray)

            canvasCtx.fillStyle = "rgb(255, 255, 255)"
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

            canvasCtx.lineWidth = 0
            canvasCtx.strokeStyle = "#b3e0d1"
            canvasCtx.fillStyle = "#b3e0d1"

            canvasCtx.beginPath()

            const sliceWidth = (canvas.width * 1.0) / bufferLength
            let x = 0
            let previousX = 0
            let previousY = canvas.height / 2

            for (let i = 0; i < bufferLength; i++) {
              const v = dataArray[i]! / 128
              const y = (v * canvas.height) / 2 + canvas.height / 4

              if (i === 0) {
                canvasCtx.moveTo(x, y)
              } else {
                const controlX = (previousX + x) / 2
                const controlY = (previousY + y) / 2
                canvasCtx.quadraticCurveTo(
                  previousX,
                  previousY,
                  controlX,
                  controlY
                )
              }

              previousX = x
              previousY = y
              x += sliceWidth
            }

            // Завершение фигуры для заливки
            canvasCtx.lineTo(canvas.width, canvas.height)
            canvasCtx.lineTo(0, canvas.height)
            canvasCtx.closePath()

            canvasCtx.stroke()
            canvasCtx.fill()
          })

          visualAudioAnimationId = requestAnimationFrame(() => updateVisual())
        }

        updateVisual()
      })
      .catch((e) => {})
  }
}

async function setupMediaDevices() {
  lastDeviceIds = getLastMediaDevices()
  const devices = await navigator.mediaDevices.enumerateDevices()
  hasMicrophone = devices.some((d) => d.kind == "audioinput")
  hasCamera = devices.some((d) => d.kind == "videoinput")
  audioDevicesList = devices.filter((d) => d.kind == "audioinput")
  audioDevicesList = [noAudioDevice, ...audioDevicesList]

  videoDevicesList = devices.filter((d) => d.kind == "videoinput")
  videoDevicesList = [noVideoDevice, ...videoDevicesList]

  // System Audio
  const systemAudio =
    lastDeviceIds.systemAudio === undefined ? true : lastDeviceIds.systemAudio
  systemAudioCheckbox.checked = systemAudio
  streamSettings = { ...streamSettings, audio: systemAudio }

  if (hasMicrophone) {
    const lastAudioDevice = audioDevicesList.find(
      (d) => d.deviceId == lastDeviceIds.audioId
    )
    if (lastAudioDevice) {
      activeAudioDevice = lastAudioDevice
    } else {
      const defaultAudioDevice = audioDevicesList.find((d) =>
        d.label.includes("Default")
      )
      activeAudioDevice = defaultAudioDevice || audioDevicesList[1]!
    }
    streamSettings = {
      ...streamSettings,
      audioDeviceId: activeAudioDevice.deviceId,
    }
  } else {
    activeAudioDevice = audioDevicesList[0]!
    streamSettings = {
      ...streamSettings,
      audioDeviceId: undefined,
    }
  }

  if (hasCamera) {
    const lastVideoDevice = videoDevicesList.find(
      (d) => d.deviceId == lastDeviceIds.videoId
    )

    if (lastVideoDevice) {
      activeVideoDevice = lastVideoDevice
    } else {
      const defaultVideoDevice = videoDevicesList.find((d) =>
        d.label.includes("Default")
      )
      activeVideoDevice = defaultVideoDevice || videoDevicesList[1]!
    }

    streamSettings = {
      ...streamSettings,
      cameraDeviceId: activeVideoDevice.deviceId,
    }
  } else {
    activeVideoDevice = videoDevicesList[0]!
    streamSettings = {
      ...streamSettings,
      cameraDeviceId: undefined,
    }
  }
}
function initMediaDevice() {
  setupMediaDevices()
    .then(() => {
      sendSettings()
      initVisualAudio()

      if (activeVideoDevice) {
        videoDeviceContainer.innerHTML = ""
        videoDeviceContainer.appendChild(renderDeviceButton(activeVideoDevice))
      }

      if (activeAudioDevice) {
        audioDeviceContainer.innerHTML = ""
        audioDeviceContainer.appendChild(renderDeviceButton(activeAudioDevice))
      }
    })
    .catch((e) => {})
}

initMediaDevice()
const changeMediaDevices = debounce(() => {
  initMediaDevice()
  window.electronAPI.ipcRenderer.send("dropdown:close", {})
})
navigator.mediaDevices.addEventListener(
  "devicechange",
  () => {
    changeMediaDevices()
  },
  false
)

function renderScreenSettings(item: IDropdownItem) {
  const container = document.querySelector(
    "#screen_settings_container"
  )! as HTMLElement
  const template = document.querySelector(
    "#screen_settings_tpl"
  )! as HTMLTemplateElement

  const clone = template.content.cloneNode(true) as HTMLElement
  const btn = clone.querySelector("button")!
  const text = clone.querySelector("span")!
  const icon = clone.querySelector("i")!

  btn.setAttribute("data-action", item.id)

  text.textContent = item.label

  if (item.extraData && item.extraData.icon) {
    if (["fullScreenVideo", "cropVideo"].includes(item.id)) {
      const i = document.createElement("div")
      i.classList.add("icon-dot", "i-br")
      icon.appendChild(i)
    }

    icon.classList.add(item.extraData.icon)
  }

  container.innerHTML = ""
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: "screen.settings.close",
  })
  container.appendChild(clone)
}

renderScreenSettings(activeScreenActionItem)

function renderDeviceButton(device: MediaDeviceInfo): HTMLElement {
  const template = document.querySelector(
    "#media_device_tpl"
  )! as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as HTMLElement
  const btn = clone.querySelector("button")!
  const checkbox = clone.querySelector(
    "input[type='checkbox']"
  )! as HTMLInputElement
  const text = clone.querySelector("span")!
  const icon = clone.querySelector("i")!
  const canvas = clone.querySelector("canvas")!

  const btnClass =
    device.kind == "videoinput" ? "js-video-device" : "js-audio-device"
  const iconClass =
    device.kind == "videoinput"
      ? device.deviceId == "no-camera"
        ? ["i-video-slash", "text-error"]
        : ["i-video"]
      : device.deviceId == "no-microphone"
        ? ["i-microphone-slash", "text-error"]
        : ["i-microphone"]

  btn.classList.add(btnClass)
  text.textContent = device.label
  checkbox.name =
    device.kind == "videoinput" ? "isVideoEnabled" : "isAudioEnabled"
  checkbox.checked = !["no-camera", "no-microphone"].includes(device.deviceId)
  iconClass.forEach((iClass) => {
    icon.classList.add(iClass)
  })

  if (device.kind == "audioinput") {
    canvas.removeAttribute("hidden")
  }

  return clone
}

function renderProfile(data: IAvatarData) {
  const containers = document.querySelectorAll(".profile-container")
  const template = document.querySelector(
    "#profile_tpl"
  )! as HTMLTemplateElement

  containers.forEach((container) => {
    const clone = template.content.cloneNode(true) as HTMLElement
    const userName = clone.querySelector(".user-name")!
    const orgName = clone.querySelector(".org-name")!
    const avatar = clone.querySelector(".avatar")! as HTMLElement
    const img = avatar.querySelector("img")!

    userName.innerHTML = data.name
    orgName.innerHTML = data.currentOrganization.name

    if (data.avatar_url) {
      img.src = data.avatar_url
      img.removeAttribute("hidden")
    } else {
      img.setAttribute("hidden", "")
      avatar.innerHTML = data.initials
      avatar.style.backgroundColor = Palette.common[data.bg_color_number]!
    }
    container.innerHTML = ""
    container.appendChild(clone)
  })
}

function renderOrganizations(data: IAvatarData) {
  const template = document.querySelector(
    "#organization_tpl"
  )! as HTMLTemplateElement

  organizationContainer.innerHTML = ""

  data.organizations.forEach((o) => {
    const clone = template.content.cloneNode(true) as HTMLElement
    const btn = clone.querySelector("button")!
    const span = clone.querySelector("span")!

    span.innerHTML = o.name
    btn.dataset.id = `${o.id}`
    organizationContainer.appendChild(clone)
  })
}

function getDropdownItems(type: DropdownListType): IDropdownItem[] {
  let items: IDropdownItem[] = []

  if (type == "screenActions") {
    items = screenActionsList.map((item) => {
      return {
        label: item.label,
        id: item.id,
        isSelected: item.id == activeScreenActionItem?.id,
        extraData: item.extraData,
      }
    })
  }

  if (type == "videoDevices") {
    items = videoDevicesList.map((d) => {
      return {
        label: d.label,
        id: d.deviceId,
        isSelected: d.deviceId == activeVideoDevice?.deviceId,
        extraData: {
          icon: d.deviceId == "no-camera" ? "i-video-slash" : "i-video",
        },
      }
    })
  }

  if (type == "audioDevices") {
    items = audioDevicesList.map((d) => {
      return {
        label: d.label,
        id: d.deviceId,
        isSelected: d.deviceId == activeAudioDevice.deviceId,
        extraData: {
          icon:
            d.deviceId == "no-microphone"
              ? "i-microphone-slash"
              : "i-microphone",
        },
      }
    })
  }

  return items
}

function sendSettings() {
  if (streamSettings.audioDeviceId == "no-microphone") {
    delete streamSettings.audioDeviceId
  }

  if (streamSettings.cameraDeviceId == "no-camera") {
    delete streamSettings.cameraDeviceId
  }

  window.electronAPI.ipcRenderer.send("record-settings-change", streamSettings)
}

function setPageView(view: PageViewType) {
  const sections = [
    modalContent,
    profileContent,
    permissionsContent,
    limitsContent,
    noMicrophoneContent,
    settingsContent,
  ]
  const footer = document.querySelector("#footer")!
  sections.forEach((s) => s.setAttribute("hidden", ""))
  footer.removeAttribute("hidden")
  activePageView = view

  if (isAllowRecords === false && !["permissions", "profile"].includes(view)) {
    limitsContent.removeAttribute("hidden")
    activePageView = "limits"
    return
  }

  switch (view) {
    case "modal":
      modalContent.removeAttribute("hidden")
      break
    case "permissions":
      permissionsContent.removeAttribute("hidden")
      break
    case "limits":
      limitsContent.removeAttribute("hidden")
      break
    case "no-microphone":
      noMicrophoneContent.removeAttribute("hidden")
      break
    case "profile":
      profileContent.removeAttribute("hidden")
      break
    case "settings":
      settingsContent.removeAttribute("hidden")
      break
  }
}

// IPC
window.electronAPI.ipcRenderer.on("app:version", (event, version) => {
  const versionEl = document.querySelector("#app_version")!
  versionEl.innerHTML = `, v${version}`
})

window.electronAPI.ipcRenderer.on(
  "mediaDevicesAccess:get",
  async (event, permissions: IMediaDevicesAccess) => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      hasMicrophone = devices.some((d) => d.kind == "audioinput")
      hasCamera = devices.some((d) => d.kind == "videoinput")

      const noCameraAccess = hasCamera && !permissions.camera
      const noMicrophoneAccess = hasMicrophone && !permissions.microphone
      const noScreenAccess = !permissions.screen

      Object.keys(permissions).forEach((deviceName) => {
        const deviceEl = document.querySelector(`.js-permission-${deviceName}`)!

        if (permissions[deviceName]) {
          deviceEl.classList.add("has-access")
        } else {
          deviceEl.classList.remove("has-access")
        }

        if (
          (deviceName == "microphone" && !hasMicrophone) ||
          (deviceName == "camera" && !hasCamera)
        ) {
          deviceEl.classList.add("is-disabled")
        }
      })

      if (noCameraAccess || noMicrophoneAccess || noScreenAccess) {
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: false,
          width: 430,
          height: 500,
        })
        setPageView("permissions")
      } else {
        const height = isScreenshotTab
          ? ModalWindowHeight.SCREENSHOT_TAB
          : ModalWindowHeight.MODAL
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: true,
          width: ModalWindowWidth.MODAL,
          height: height,
        })

        setPageView("modal")
        // setPageView("settings")
        // showSettingsTab("shortCuts")
        // window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
        //   alwaysOnTop: true,
        //   width: ModalWindowWidth.SETTINGS,
        //   height: ModalWindowHeight.SETTINGS,
        // })
        // setPageView("no-microphone")
      }
    })
  }
)

window.electronAPI.ipcRenderer.on(
  "dropdown:select.video",
  (event, data: IDropdownPageSelectData) => {
    streamSettings = { ...streamSettings, ...data }

    setLastMediaDevices(
      streamSettings.audioDeviceId,
      streamSettings.cameraDeviceId
    )

    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "dropdown:select",
    })

    if (data.action && data.action != activeScreenAction) {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "mode.video.selected",
        body: data.action,
      })

      if (!["fullScreenshot", "cropScreenshot"].includes(data.action)) {
        activeScreenAction = data.action
        activeScreenActionItem = data.item
        renderScreenSettings(data.item)
      }
    }

    if (data.audioDeviceId) {
      activeAudioDevice = audioDevicesList.find(
        (d) => d.deviceId == data.audioDeviceId
      )!
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "mode.audio.selected",
        body: {
          activeAudioDeviceName: activeAudioDevice.label,
          activeAudioDeviceId: data.audioDeviceId,
        },
      })
      audioDeviceContainer.innerHTML = ""
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "microphone.settings.close",
      })
      audioDeviceContainer.appendChild(renderDeviceButton(activeAudioDevice))
    }

    if (data.cameraDeviceId) {
      activeVideoDevice = videoDevicesList.find(
        (d) => d.deviceId == data.cameraDeviceId
      )!
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "mode.camera.selected",
        body: {
          cameraDeviceName: activeVideoDevice.label,
          cameraDeviceId: data.cameraDeviceId,
        },
      })
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "video.settings.close",
      })
      videoDeviceContainer.innerHTML = ""
      videoDeviceContainer.appendChild(renderDeviceButton(activeVideoDevice))
    }

    openedDropdownType = undefined
    sendSettings()
    initVisualAudio()
  }
)

window.electronAPI.ipcRenderer.on(ModalWindowEvents.SHOW, (event) => {
  initVisualAudio()
})
window.electronAPI.ipcRenderer.on(ModalWindowEvents.HIDE, (event) => {
  openedDropdownType = undefined
  isAllowRecords = undefined
})
window.electronAPI.ipcRenderer.on("app:hide", (event) => {
  stopVisualAudio()
})

window.electronAPI.ipcRenderer.on("dropdown:hide", (event) => {
  openedDropdownType = undefined
})

window.electronAPI.ipcRenderer.on(ModalWindowEvents.RENDER, (event, action) => {
  const item = screenActionsList.find((i) => i.id == action)
  activeScreenAction = action
  activeScreenActionItem = item
  streamSettings = { ...streamSettings, action }
  renderScreenSettings(item!)
})

window.electronAPI.ipcRenderer.on(
  APIEvents.GET_ORGANIZATION_LIMITS,
  (event, limits: IOrganizationLimits) => {
    isAllowRecords = limits.upload_allowed
    isAllowScreenshots = limits.allow_screenshots
    screenshotButtons.forEach((btn) => {
      const b = btn.querySelector(".js-screenshot-not-allowed")
      if (isAllowScreenshots) {
        btn.classList.remove("disabled")
        b?.setAttribute("hidden", "")
      } else {
        btn.classList.add("disabled")
        b?.removeAttribute("hidden")
      }
    })

    if (isAllowRecords === false && activePageView != "permissions") {
      setPageView("limits")
    }
  }
)

window.electronAPI.ipcRenderer.on(
  "userAccountData:get",
  (event, data: IAvatarData) => {
    const localDataStr = localStorage.getItem(ACCOUNT_DATA)
    const newDataStr = JSON.stringify(data)
    const localData = localDataStr ? JSON.parse(localDataStr) : null

    if (newDataStr != localDataStr) {
      renderProfile(data)
      renderOrganizations(data)
      localStorage.setItem(ACCOUNT_DATA, newDataStr)
    } else if (localData) {
      renderProfile(localData)
      renderOrganizations(localData)
    }

    const settingsBtn = document.querySelectorAll(".js-settings-btn")
    settingsBtn.forEach((btn) => {
      btn.addEventListener(
        "click",
        (event) => {
          event.preventDefault()
          event.stopPropagation()
          setPageView("settings")
          showSettingsTab("root")
          window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
            alwaysOnTop: true,
            width: ModalWindowWidth.SETTINGS,
            height: ModalWindowHeight.SETTINGS,
          })
        },
        false
      )
    })
    const toModalPageBtn = document.querySelector(".js-to-modal-page")!
    toModalPageBtn.addEventListener(
      "click",
      () => {
        setPageView("modal")
        const height = isScreenshotTab
          ? ModalWindowHeight.SCREENSHOT_TAB
          : ModalWindowHeight.MODAL
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: true,
          width: ModalWindowWidth.MODAL,
          height: height,
        })
      },
      false
    )
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = state["recordingState"] == "recording"
})

// DOM
const redirectToPlansBtn = document.querySelector("#redirectToPlans")!
const windowsToolbar = document.querySelector(".windows-toolbar")!
const windowsMinimizeBtn = document.querySelector("#windows_minimize")!
const windowsCloseBtn = document.querySelector("#windows_close")!
const systemAudioEl = document.querySelector(".system-audio-container")!

if (isWindows) {
  systemAudioEl.removeAttribute("hidden")
  windowsToolbar.removeAttribute("hidden")
}

windowsMinimizeBtn.addEventListener(
  "click",
  () => {
    if (isWindows) {
      window.electronAPI.ipcRenderer.send("windows:minimize", {})
    }
  },
  false
)
windowsCloseBtn.addEventListener(
  "click",
  () => {
    if (isWindows) {
      window.electronAPI.ipcRenderer.send("windows:close", {})
    }
  },
  false
)

redirectToPlansBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send(
      "redirect:app",
      "org/%orgId%/settings/payments"
    )
  },
  false
)

document.addEventListener(
  "click",
  (event) => {
    const btn = event.target as HTMLElement

    if (btn.classList.contains("js-btn-action-type")) {
      if (openedDropdownType == "screenActions") {
        window.electronAPI.ipcRenderer.send("dropdown:close", {})
        openedDropdownType = undefined
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "screen.settings.close",
        })
      } else {
        const offsetY = Math.round(btn.getBoundingClientRect().top) || 0
        const action = btn.dataset.action as ScreenAction
        const list: IDropdownList = {
          type: "screenActions",
          items: getDropdownItems("screenActions"),
        }

        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `screen.settings.open - offsetY: ${offsetY}`,
        })

        window.electronAPI.ipcRenderer.send("dropdown:open", {
          action,
          offsetY,
          list,
        })
        openedDropdownType = "screenActions"
      }
    }

    if (btn.classList.contains("js-video-device")) {
      if (openedDropdownType == "videoDevices") {
        window.electronAPI.ipcRenderer.send("dropdown:close", {})
        openedDropdownType = undefined
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "webcam.settings.close",
        })
      } else {
        const offsetY = Math.round(btn.getBoundingClientRect().top) || 0
        const list: IDropdownList = {
          type: "videoDevices",
          items: getDropdownItems("videoDevices"),
        }

        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `webcam.settings.open - offsetY: ${offsetY}`,
        })

        window.electronAPI.ipcRenderer.send("dropdown:open", {
          offsetY,
          list,
        })
        openedDropdownType = "videoDevices"
      }
    }

    if (btn.classList.contains("js-audio-device")) {
      if (openedDropdownType == "audioDevices") {
        window.electronAPI.ipcRenderer.send("dropdown:close", {})
        openedDropdownType = undefined
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "microphone.settings.close",
        })
      } else {
        const offsetY = Math.round(btn.getBoundingClientRect().top) || 0
        const list: IDropdownList = {
          type: "audioDevices",
          items: getDropdownItems("audioDevices"),
        }

        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: `microphone.settings.open - offsetY: ${offsetY}`,
        })

        window.electronAPI.ipcRenderer.send("dropdown:open", {
          offsetY,
          list,
        })
        openedDropdownType = "audioDevices"
      }
    }
  },
  false
)

const deviceAccessBtn = document.querySelectorAll(".js-device-access")
deviceAccessBtn.forEach((btn) => {
  btn.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement).dataset
        .type as MediaDeviceType

      if (target == "microphone") {
        navigator.mediaDevices
          .getUserMedia({
            audio: true,
            video: false,
          })
          .then((stream) => {
            stream.getTracks().forEach((track) => track.stop())
          })
          .catch((e) => {
            if (e.toString().toLowerCase().includes("permission denied")) {
              window.electronAPI.ipcRenderer.send(
                "system-settings:open",
                target
              )
            }
          })
      }

      if (target == "camera") {
        navigator.mediaDevices
          .getUserMedia({
            audio: false,
            video: true,
          })
          .then((stream) => {
            stream.getTracks().forEach((track) => track.stop())
          })
          .catch((e) => {
            if (e.toString().toLowerCase().includes("permission denied")) {
              window.electronAPI.ipcRenderer.send(
                "system-settings:open",
                target
              )
            }
          })
      }

      if (target == "screen") {
        navigator.mediaDevices
          .getDisplayMedia({
            audio: false,
            video: true,
          })
          .then((stream) => {
            stream.getTracks().forEach((track) => track.stop())
          })
          .catch((e) => {
            if (e.toString().toLowerCase().includes("permission denied")) {
              window.electronAPI.ipcRenderer.send(
                "system-settings:open",
                target
              )
            }
          })
      }
    },
    false
  )
})

systemAudioCheckbox.addEventListener(
  "change",
  (event) => {
    const input = event.target as HTMLInputElement
    streamSettings = { ...streamSettings, audio: input.checked }
    setLastMediaDevices(undefined, undefined, input.checked)
    sendSettings()
  },
  false
)

function start() {
  if (streamSettings.action == "fullScreenVideo") {
    sendSettings()
  }

  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: "recording.started",
    body: JSON.stringify({
      microphoneId: streamSettings.audioDeviceId,
      webcamId: streamSettings.cameraDeviceId,
      webcam:
        videoDevicesList.find(
          (a) => a.deviceId === streamSettings.cameraDeviceId
        )?.label || "",
      microphone:
        audioDevicesList.find(
          (a) => a.deviceId === streamSettings.audioDeviceId
        )?.label || "",
      mode: streamSettings.action,
    }),
  })
  window.electronAPI.ipcRenderer.send(RecordEvents.START, streamSettings)
}

const continueWithoutMicBtn = document.querySelector("#continueWithoutMicBtn")!
continueWithoutMicBtn.addEventListener(
  "click",
  () => {
    start()
    setPageView("modal")
  },
  false
)

const unmuteBtn = document.querySelector("#unmuteBtn")!
unmuteBtn.addEventListener(
  "click",
  () => {
    const items = getDropdownItems("audioDevices")
    const item = items.find((i) => i.label.includes("Default"))

    if (item) {
      const data: IDropdownPageSelectData = { item, audioDeviceId: item.id }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      setPageView("modal")
    } else {
      setPageView("modal")
    }
  },
  false
)

const startBtn = document.querySelector("#startBtn")!
startBtn.addEventListener(
  "click",
  () => {
    if (
      hasMicrophone &&
      (streamSettings.audioDeviceId == noAudioDevice.deviceId ||
        !streamSettings.audioDeviceId)
    ) {
      setPageView("no-microphone")
      return
    }

    start()
  },
  false
)

const logoutBtn = document.querySelector(".js-logout-btn")!
logoutBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send("app:logout")
    setPageView("modal")
  },
  false
)

const profileToggleBtn = document.querySelectorAll(".js-profile-toggle-btn")
profileToggleBtn.forEach((btn) => {
  btn.addEventListener(
    "click",
    () => {
      if (["modal", "limits"].includes(activePageView)) {
        setPageView("profile")
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: true,
          width: ModalWindowWidth.MODAL,
          height: ModalWindowHeight.PROFILE,
        })
      } else {
        setPageView("modal")
        const height = isScreenshotTab
          ? ModalWindowHeight.SCREENSHOT_TAB
          : ModalWindowHeight.MODAL
        window.electronAPI.ipcRenderer.send(ModalWindowEvents.RESIZE, {
          alwaysOnTop: true,
          width: ModalWindowWidth.MODAL,
          height: height,
        })
      }
    },
    false
  )
})

organizationContainer.addEventListener(
  "click",
  (event) => {
    const target = event.target as HTMLButtonElement

    if (target.nodeName.toLowerCase() == "button") {
      const orgId = Number(target.dataset.id)
      window.electronAPI.ipcRenderer.send("change-organization", orgId)
    }
  },
  false
)
// FlipCamera
flipCheckbox.addEventListener(
  "change",
  (event) => {
    const checkbox = event.target as HTMLInputElement
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.FLIP_CAMERA_SET,
      checkbox.checked
    )
  },
  false
)

window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.FLIP_CAMERA_GET,
  (event, isFlip: boolean) => {
    if (typeof isFlip == "boolean") {
      flipCheckbox.checked = isFlip
    } else {
      flipCheckbox.checked = true
    }
  }
)
// Shortcuts
function renderShortcutSettings(shortcut: IUserSettingsShortcut): HTMLElement {
  const template = document.querySelector(
    "#shortcut_settings_tpl"
  )! as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as HTMLElement
  const section = clone.querySelector(".settings-section")!
  const title = clone.querySelector("span")!
  const checkbox = clone.querySelector(
    "input[type='checkbox']"
  )! as HTMLInputElement
  const input = clone.querySelector("input[type='text']")! as HTMLInputElement

  title.innerHTML = SETTINGS_SHORT_CUTS_LOCALES[shortcut.name]
  checkbox.checked = !shortcut.disabled
  input.value = shortcut.keyCodes

  input.dataset.shortcutValue = shortcut.keyCodes
  input.dataset.shortcutName = shortcut.name
  checkbox.dataset.shortcutName = shortcut.name

  section.classList.toggle("is-disabled", shortcut.disabled)

  return clone
}

function showSettingsTab(tab: SettingsTabType) {
  const settingsTabContainers = document.querySelectorAll(
    "[data-settings-container]"
  )
  const activeTabContainer = document.querySelector(
    `[data-settings-container="${tab}"]`
  )
  activeSettingTab = tab
  settingsTabContainers.forEach((c) => c.setAttribute("hidden", ""))
  activeTabContainer?.removeAttribute("hidden")
}
const settingsTabBtn = document.querySelectorAll("[data-settings-tab]")
settingsTabBtn.forEach((btn) => {
  btn.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLButtonElement
      const tab = target.dataset.settingsTab as SettingsTabType
      showSettingsTab(tab)
    },
    false
  )
})

window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.SHORTCUTS_GET,
  (event, data: IUserSettingsShortcut[]) => {
    const shortCutsContainer = document.querySelector(
      "#shortcut_settings_container"
    )! as HTMLElement
    shortCutsContainer.innerHTML = ""
    data.forEach((s) => {
      shortCutsContainer.appendChild(renderShortcutSettings(s))
    })

    const inputs = document.querySelectorAll(
      ".settings-shortcut-input"
    ) as NodeListOf<HTMLInputElement>
    const checkboxes = document.querySelectorAll(
      ".settings-shortcut-checkbox"
    ) as NodeListOf<HTMLInputElement>
    shortcutsUpdater.bindEvents(inputs, checkboxes, data)

    const shortcutSelects = document.querySelectorAll(
      ".settings-shortcut-input-wrapper"
    )

    shortcutSelects.forEach((select) => {
      select.addEventListener(
        "click",
        () => {
          const input = select.querySelector(
            ".settings-shortcut-input"
          )! as HTMLElement
          const activeItem = input.dataset.shortcutValue
          // const items:
        },
        false
      )
    })
  }
)

window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.SHORTCUTS_GET,
  (event, data: IUserSettingsShortcut[]) => {
    data.forEach((s) => {
      SHORTCUTS_TEXT_MAP[s.name] = s.disabled ? "" : s.keyCodes
    })
    updateHotkeysTexts()
  }
)

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

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `modal-page.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `modal-page.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
