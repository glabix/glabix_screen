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
  IStreamSettings,
  ModalWindowHeight,
  IAvatarData,
  SimpleStoreEvents,
  ModalWindowEvents,
  IModalWindowTabData,
  ScreenshotActionEvents,
  ModalWindowWidth,
  HotkeysEvents,
  ILastDeviceSettings,
  IMediaDevice,
} from "@shared/types/types"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
import {
  RecordEvents,
  RecordSettingsEvents,
} from "../../shared/events/record.events"
import { Palette } from "@shared/helpers/palette"
import { debounce } from "@shared/helpers/debounce"
import {
  IUserSettingsShortcut,
  UserSettingsEvents,
} from "@shared/types/user-settings.types"
import { ShortcutsUpdater } from "./helpers/shortcuts.helper"
import { AppEvents } from "@shared/events/app.events"
import { AppUpdaterEvents } from "@shared/events/app_updater.events"
import {
  SwiftMediaDevicesEvents,
  SwiftRecorderEvents,
} from "@shared/types/swift-recorder.types"
type SettingsTabType =
  | "root"
  | "shortCuts"
  | "videoAudio"
  | "recordingProcess"
  | "common"
type PageViewType =
  | "modal"
  | "permissions"
  | "limits"
  | "no-microphone"
  | "profile"
  | "settings"

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
let isAppShown = false
const modalContent = document.querySelector(".modal-content")!
const profileContent = document.querySelector(".profile-content")!
const settingsContent = document.querySelector(".settings-content")!
const permissionsContent = document.querySelector(".permissions-content")!
const limitsContent = document.querySelector(".limits-content")!
const noMicrophoneContent = document.querySelector(".no-microphone-content")!

const startUpdateBtn = document.querySelector(".js-update-start")!

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
let audioDevicesList: IMediaDevice[] = []
let activeAudioDevice: IMediaDevice
let hasCamera = false
let hasMicrophone = false
let visualAudioAnimationId = 0
let visualAudioStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let lastDeviceIds: ILastDeviceSettings = {}
const noVideoDevice: IMediaDevice = {
  deviceId: "no-camera",
  label: "Без камеры",
  kind: "videoinput",
}
const noAudioDevice: IMediaDevice = {
  deviceId: "no-microphone",
  label: "Без микрофона",
  kind: "audioinput",
}
let videoDevicesList: IMediaDevice[] = []
let activeVideoDevice: IMediaDevice | undefined
let activeScreenAction: ScreenAction = "fullScreenVideo"
let streamSettings: IStreamSettings = {
  action: activeScreenAction,
}

let mediaDevicesList: IMediaDevice[] = []
let enumerateDevices: MediaDeviceInfo[] = []

let isScreenshotTab = false
const flipCheckbox = document.querySelector(
  ".js-flip-camera-checkbox"
)! as HTMLInputElement
const panelVisibilityCheckbox = document.querySelector(
  ".js-panel-visibility-checkbox"
)! as HTMLInputElement
const panelHiddenCheckbox = document.querySelector(
  ".js-panel-hidden-checkbox"
)! as HTMLInputElement
const autoLaunchCheckbox = document.querySelector(
  ".js-auto-launch-checkbox"
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

function getLastMediaDevices(): ILastDeviceSettings {
  const lastDevicesStr = localStorage.getItem(LAST_DEVICE_IDS)
  return lastDevicesStr ? JSON.parse(lastDevicesStr) : {}
}

function setLastMediaDevices(params: {
  lastAudioDeviceId?: string
  lastSwiftAudioDeviceId?: string
  lastVideoDeviceId?: string
  systemAudio?: boolean
}) {
  if (params.lastAudioDeviceId) {
    lastDeviceIds = { ...lastDeviceIds, audioId: params.lastAudioDeviceId }
  }

  if (params.lastSwiftAudioDeviceId) {
    lastDeviceIds = {
      ...lastDeviceIds,
      swiftAudioId: params.lastSwiftAudioDeviceId,
    }
  }

  if (params.lastVideoDeviceId) {
    lastDeviceIds = { ...lastDeviceIds, videoId: params.lastVideoDeviceId }
  }

  if (typeof params.systemAudio == "boolean") {
    lastDeviceIds = { ...lastDeviceIds, systemAudio: params.systemAudio }
  }

  localStorage.setItem(LAST_DEVICE_IDS, JSON.stringify(lastDeviceIds))
}

function stopVisualAudio() {
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }

  if (visualAudioStream) {
    visualAudioStream.getTracks().forEach((s) => s.stop())
    visualAudioStream = null
  }

  if (visualAudioAnimationId) {
    cancelAnimationFrame(visualAudioAnimationId)
    visualAudioAnimationId = 0
  }

  window.electronAPI.ipcRenderer.send(SwiftRecorderEvents.STOP_WAVE_FORM)
}

function getBrowserAudioDeviceId(): string {
  let noId = ""
  console.log("mediaDevicesList", mediaDevicesList)

  const activeMediaDevice = mediaDevicesList.find(
    (d) => d.deviceId == streamSettings.audioDeviceId
  )

  if (!activeMediaDevice) {
    return noId
  }

  if (activeMediaDevice.isDefault) {
    return (
      enumerateDevices
        .filter((d) => d.kind == "audioinput")
        .find((d) => d.deviceId == "default")?.deviceId || noId
    )
  } else {
    const label = activeMediaDevice.label
    const devicesByName = enumerateDevices.filter(
      (d) => d.label.includes(label) || d.label == label
    )
    return devicesByName.length == 1 ? devicesByName[0]!.deviceId : noId
  }
}

function initVisualAudio() {
  stopVisualAudio()

  if (
    streamSettings.audioDeviceId &&
    streamSettings.audioDeviceId != "no-microphone"
  ) {
    const browserDeviceId = getBrowserAudioDeviceId()

    window.electronAPI.ipcRenderer.send(
      "console.log",
      `
      browserDeviceId
    `,
      browserDeviceId
    )

    if (browserDeviceId) {
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            deviceId: browserDeviceId,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1,
          },
          video: false,
        })
        .then((stream) => {
          stopVisualAudio()

          visualAudioStream = stream
          audioContext = new AudioContext()
          const source = audioContext.createMediaStreamSource(visualAudioStream)
          const analyser = audioContext.createAnalyser()

          analyser.fftSize = 2048
          source.connect(analyser)

          const canvases = document.querySelectorAll(
            ".visualizer"
          )! as NodeListOf<HTMLCanvasElement>
          const bufferLength = analyser.frequencyBinCount
          const dataArray = new Uint8Array(bufferLength)

          function updateVisual() {
            analyser.getByteTimeDomainData(dataArray)
            canvases.forEach((canvas) => {
              const canvasCtx = canvas.getContext("2d")!
              canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

              canvasCtx.fillStyle = "rgb(255, 255, 255)"
              canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

              canvasCtx.lineWidth = 0
              canvasCtx.strokeStyle = "#A7EBBB"
              canvasCtx.fillStyle = "#A7EBBB"

              canvasCtx.beginPath()

              const sliceWidth = (canvas.width * 1.0) / bufferLength

              let x = 0
              let previousX = 0
              let previousY = canvas.height / 2
              // window.electronAPI.ipcRenderer.send('console.log', 'dataArray', dataArray)

              for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i]! / 128
                const y = (v * canvas.height) / 2 + canvas.height / 4
                // console.log(`v/y`, v, y)
                // window.electronAPI.ipcRenderer.send('console.log', `v/y`, v, y)

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

                // console.log("coord", previousX, x, previousY, y)

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
    } else {
      window.electronAPI.ipcRenderer.send(SwiftRecorderEvents.START_WAVE_FORM)
      // window.electronAPI.ipcRenderer.send('console.log',
      //   `
      //     run swift script
      //   `
      // )
      // GET
      // console.log("run swift script")
    }
  }
}

function useBrowserAudioDevice(): boolean {
  // return true
  return streamSettings.action == "cameraOnly" || isWindows
}
async function setupMediaDevices(setDefault = false) {
  const useBrowserDevice = useBrowserAudioDevice()

  enumerateDevices = await navigator.mediaDevices.enumerateDevices()

  if (useBrowserDevice) {
    mediaDevicesList = enumerateDevices.map((d) => ({
      deviceId: d.deviceId,
      label: d.label,
      kind: d.kind,
      groupId: d.groupId,
      isDefault: d.deviceId == "default",
    }))
  } else {
    const macAudioDevices = (await window.electronAPI.ipcRenderer.invoke(
      SwiftMediaDevicesEvents.GET_DEVICES
    )) as IMediaDevice[]
    const macVideoDevices = enumerateDevices
      .filter((d) => d.kind == "videoinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label,
        kind: d.kind,
        groupId: d.groupId,
        isDefault: d.deviceId == "default",
      }))
    mediaDevicesList = [...macAudioDevices, ...macVideoDevices]
  }

  // console.log('browserDevices', enumerateDevices)
  // console.log('mediaDevicesList', mediaDevicesList)

  // window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
  //   title: `modal-page.renderer:setupMediaDevices`,
  //   body: JSON.stringify(mediaDevicesList),
  // })

  // const devices = await navigator.mediaDevices.enumerateDevices()
  // const mDevices = devices.filter(d => d.kind == 'audioinput').map(d => (({deviceId: d.deviceId, label: d.label, kind: d.kind, groupId: d.groupId})))

  // window.electronAPI.ipcRenderer.send('console.log', 'mDevices', mDevices)

  // const data = devices.map(d => (({deviceId: d.deviceId, label: d.label, kind: d.kind, groupId: d.groupId})))
  // window.electronAPI.ipcRenderer.send(RecordSettingsEvents.GET_DEVICES, data)

  const prevSettings = { ...streamSettings }
  lastDeviceIds = getLastMediaDevices()

  // window.electronAPI.ipcRenderer.send(
  //   "console.log",
  //   `
  //   lastDeviceIds
  //   `,
  //   lastDeviceIds
  // )

  // window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
  //   title: "modal-page.renderer:getLastMediaDevices",
  //   body: JSON.stringify(lastDeviceIds)
  // })

  hasMicrophone = mediaDevicesList.some((d) => d.kind == "audioinput")
  hasCamera = mediaDevicesList.some((d) => d.kind == "videoinput")
  audioDevicesList = mediaDevicesList.filter((d) => d.kind == "audioinput")
  audioDevicesList = [noAudioDevice, ...audioDevicesList]

  videoDevicesList = mediaDevicesList.filter((d) => d.kind == "videoinput")
  videoDevicesList = [noVideoDevice, ...videoDevicesList]
  // System Audio
  systemAudioCheckbox.checked = streamSettings.audio!

  if (hasMicrophone) {
    const lastAudioDeviceId = useBrowserAudioDevice()
      ? lastDeviceIds.audioId
      : lastDeviceIds.swiftAudioId
    const lastAudioDevice = setDefault
      ? audioDevicesList.find((d) => d.deviceId == lastAudioDeviceId)
      : audioDevicesList.find((d) => d.isDefault)
    if (lastAudioDevice) {
      activeAudioDevice = lastAudioDevice
    } else {
      const defaultAudioDevice = audioDevicesList.find((d) => d.isDefault)
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

  // window.electronAPI.ipcRenderer.send(
  //   "console.log",
  //   `
  //   audioDevicesList
  //   `,
  //   audioDevicesList
  // )
  // window.electronAPI.ipcRenderer.send(
  //   "console.log",
  //   `
  //   activeAudioDevice
  //   `,
  //   activeAudioDevice
  // )

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

  if (JSON.stringify(prevSettings) != JSON.stringify(streamSettings)) {
    sendSettings()
  }
}

function initMediaDevice(setDefault = false) {
  setupMediaDevices(setDefault)
    .then(() => {
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

const changeMediaDevices = debounce(() => {
  initMediaDevice(true)
  window.electronAPI.ipcRenderer.send("devicechange", {})
  window.electronAPI.ipcRenderer.send("dropdown:close", {})
})
navigator.mediaDevices.addEventListener(
  "devicechange",
  () => {
    if (isAppShown && !isRecording) {
      changeMediaDevices()
    }
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

function renderDeviceButton(device: IMediaDevice): HTMLElement {
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
  text.textContent =
    device.isDefault && !device.label.includes("Default")
      ? `Default - ${device.label}`
      : device.label
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
          isDefault: d.isDefault,
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
  window.electronAPI.ipcRenderer.send(
    RecordSettingsEvents.UPDATE,
    streamSettings
  )
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
window.electronAPI.ipcRenderer.on(AppEvents.GET_VERSION, (event, version) => {
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
  "dropdown:select",
  (event, data: IDropdownPageSelectData) => {
    const newSettings = { ...data }
    const prevSettings = { ...streamSettings }
    streamSettings = { ...streamSettings, ...data }

    let newDeviceIds = {}

    if (data.audioDeviceId) {
      newDeviceIds = useBrowserAudioDevice()
        ? { ...newDeviceIds, lastAudioDeviceId: data.audioDeviceId }
        : { ...newDeviceIds, lastSwiftAudioDeviceId: data.audioDeviceId }
    }

    if (data.cameraDeviceId) {
      newDeviceIds = { ...newDeviceIds, lastVideoDeviceId: data.cameraDeviceId }
    }

    setLastMediaDevices(newDeviceIds)

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

    let lastDevices = {}
    if (
      (prevSettings.action != "cameraOnly" &&
        newSettings.action == "cameraOnly") ||
      (prevSettings.action == "cameraOnly" &&
        newSettings.action != "cameraOnly")
    ) {
      initMediaDevice()
    } else {
      initVisualAudio()
    }

    sendSettings()
  }
)

window.electronAPI.ipcRenderer.on(ModalWindowEvents.SHOW, (event) => {})
window.electronAPI.ipcRenderer.on(ModalWindowEvents.HIDE, (event) => {
  openedDropdownType = undefined
  isAllowRecords = undefined
})

window.electronAPI.ipcRenderer.on(AppEvents.ON_SHOW, (event) => {
  isAppShown = true
  initMediaDevice()
})
window.electronAPI.ipcRenderer.on(AppEvents.ON_BEFORE_HIDE, (event) => {
  isAppShown = false
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
          window.electronAPI.ipcRenderer.send("dropdown:close", {})
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

window.electronAPI.ipcRenderer.on(
  RecordSettingsEvents.INIT,
  (event, settings: IStreamSettings) => {
    streamSettings = { ...settings }
  }
)

window.electronAPI.ipcRenderer.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = ["recording", "paused", "countdown"].includes(
    state["recordingState"]
  )
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
        window.electronAPI.ipcRenderer.send("system-settings:open", target)

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
    // undefined, undefined, input.checked
    setLastMediaDevices({ systemAudio: input.checked })
    sendSettings()
  },
  false
)

function start() {
  // if (streamSettings.action == "fullScreenVideo") {
  //   sendSettings()
  // }

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
    window.electronAPI.ipcRenderer.send(AppEvents.LOGOUT)
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
      window.electronAPI.ipcRenderer.send("dropdown:close", {})
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

// Panel Visibility
panelVisibilityCheckbox.addEventListener(
  "change",
  (event) => {
    const checkbox = event.target as HTMLInputElement
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.PANEL_VISIBILITY_SET,
      checkbox.checked
    )
  },
  false
)
window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.PANEL_VISIBILITY_GET,
  (event, isPanelVisible: boolean) => {
    if (typeof isPanelVisible == "boolean") {
      panelVisibilityCheckbox.checked = isPanelVisible
    } else {
      panelVisibilityCheckbox.checked = false
    }
  }
)
// Panel Hidden
panelHiddenCheckbox.addEventListener(
  "change",
  (event) => {
    const checkbox = event.target as HTMLInputElement
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.PANEL_HIDDEN_SET,
      checkbox.checked
    )
  },
  false
)
window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.PANEL_HIDDEN_GET,
  (event, isPanelHidden: boolean) => {
    if (typeof isPanelHidden == "boolean") {
      panelHiddenCheckbox.checked = isPanelHidden
    } else {
      panelHiddenCheckbox.checked = false
    }
  }
)

// Auto Launch
autoLaunchCheckbox.addEventListener(
  "change",
  (event) => {
    const checkbox = event.target as HTMLInputElement
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.AUTO_LAUNCH_SET,
      checkbox.checked
    )
  },
  false
)
window.electronAPI.ipcRenderer.on(
  UserSettingsEvents.AUTO_LAUNCH_GET,
  (event, isAutoLaunch: boolean) => {
    if (typeof isAutoLaunch == "boolean") {
      autoLaunchCheckbox.checked = isAutoLaunch
    } else {
      autoLaunchCheckbox.checked = true
    }
  }
)

window.electronAPI.ipcRenderer.on(
  ModalWindowEvents.UPLOAD_PROGRESS_HIDE,
  (event, data) => {
    document.body.classList.remove("is-uploading")
    const bar = document.querySelector(".js-progress-bar")! as HTMLElement
    const value = document.querySelector(".js-progress-value")! as HTMLElement

    bar.style.width = "0%"
    value.innerHTML = ""
  }
)
window.electronAPI.ipcRenderer.on(
  ModalWindowEvents.UPLOAD_PROGRESS_SHOW,
  (event, progress: number) => {
    document.body.classList.add("is-uploading")
    const bar = document.querySelector(".js-progress-bar")! as HTMLElement
    const value = document.querySelector(".js-progress-value")! as HTMLElement

    bar.style.width = `${progress}%`
    value.innerHTML = `${progress}%`
  }
)

// App update
startUpdateBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send(AppUpdaterEvents.DOWNLOAD_START)
  },
  false
)
window.electronAPI.ipcRenderer.on(
  AppUpdaterEvents.HAS_UPDATE,
  (event, hasUpdate: boolean) => {
    document.body.classList.toggle("is-update-exist", hasUpdate)
  }
)
window.electronAPI.ipcRenderer.on(
  AppUpdaterEvents.DOWNLOAD_PROGRESS,
  (event, progress: number) => {
    document.body.classList.add("is-update-downloading")
    const bar = document.querySelector(".js-download-bar")! as HTMLElement
    const value = document.querySelector(".js-download-value")! as HTMLElement

    bar.style.width = `${progress}%`
    value.innerHTML = `${progress}%`
  }
)
window.electronAPI.ipcRenderer.on(
  AppUpdaterEvents.DOWNLOAD_END,
  (event, data) => {
    document.body.classList.remove("is-update-downloading", "is-update-exist")
    const bar = document.querySelector(".js-download-bar")! as HTMLElement
    const value = document.querySelector(".js-download-value")! as HTMLElement

    bar.style.width = "100%"
    value.innerHTML = "<span class='i i-check'></span>"
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
window.electronAPI.ipcRenderer.on(
  SwiftMediaDevicesEvents.CHANGE,
  (event, data: IMediaDevice[]) => {
    initMediaDevice(true)
  }
)

let silenceData: number[] = []
const waveDataMin = 8
const waveDataMax = 256
for (let i = 0; i < 1024; i++) {
  silenceData[i] = 128
}

window.electronAPI.ipcRenderer.on(
  SwiftMediaDevicesEvents.GET_WAVE_FORM,
  (event, _data: number[]) => {
    const size = Math.ceil(1024 / _data.length)
    const data = silenceData.map((v, i) => {
      const index = Math.round(i / size)
      let value = Math.round(v + _data[index]! * 1000)
      value = Math.max(waveDataMin, value)
      value = Math.min(waveDataMax, value)
      return value
    })

    drawWaveForm(data)
  }
)

function drawWaveForm(data: number[]) {
  const canvases = document.querySelectorAll(
    ".visualizer"
  )! as NodeListOf<HTMLCanvasElement>

  canvases.forEach((canvas) => {
    const canvasCtx = canvas.getContext("2d")!
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
    // analyser.getByteTimeDomainData(dataArray)

    canvasCtx.fillStyle = "rgb(255, 255, 255)"
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

    canvasCtx.lineWidth = 0
    canvasCtx.strokeStyle = "#A7EBBB"
    canvasCtx.fillStyle = "#A7EBBB"

    canvasCtx.beginPath()

    const sliceWidth = (canvas.width * 1.0) / data.length

    let x = 0
    let previousX = 0
    let previousY = canvas.height / 2

    for (let i = 0; i < data.length; i++) {
      const v = data[i]! / 128
      const y = (v * canvas.height) / 2 + canvas.height / 4
      console.log(`v/y`, v, y)
      if (i === 0) {
        canvasCtx.moveTo(x, y)
      } else {
        const controlX = (previousX + x) / 2
        const controlY = (previousY + y) / 2
        canvasCtx.quadraticCurveTo(previousX, previousY, controlX, controlY)
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
}

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
