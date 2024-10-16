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
} from "@shared/types/types"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
type PageViewType = "modal" | "permissions" | "limits"

let isAllowRecords: boolean | undefined = undefined
let activePageView: PageViewType
let openedDropdownType: DropdownListType | undefined = undefined
const modalContent = document.querySelector(".modal-content")!
const permissionsContent = document.querySelector(".permissions-content")!
const limitsContent = document.querySelector(".limits-content")!

const audioDeviceContainer = document.querySelector("#audio_device_container")!
const videoDeviceContainer = document.querySelector("#video_device_container")!
const screenActionsList: IDropdownItem[] = [
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
const recorderLogos = document.querySelectorAll(
  ".recorder-logo"
) as NodeListOf<HTMLElement>
recorderLogos.forEach((logo) => {
  if (import.meta.env.VITE_MODE === "dev") {
    logo.style.color = "#d91615"
  }
  if (import.meta.env.VITE_MODE === "review") {
    logo.style.color = "#01a0e3"
  }
})

async function setupMediaDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  hasMicrophone = devices.some((d) => d.kind == "audioinput")
  hasCamera = devices.some((d) => d.kind == "videoinput")
  audioDevicesList = devices.filter((d) => d.kind == "audioinput")
  audioDevicesList = [noAudioDevice, ...audioDevicesList]
  activeAudioDevice = audioDevicesList[0]!
  videoDevicesList = devices.filter((d) => d.kind == "videoinput")
  videoDevicesList = [noVideoDevice, ...videoDevicesList]
  activeVideoDevice = videoDevicesList[0]!
}

setupMediaDevices()
  .then(() => {
    if (activeVideoDevice) {
      videoDeviceContainer.appendChild(renderDeviceButton(activeVideoDevice))
    }

    if (activeAudioDevice) {
      audioDeviceContainer.appendChild(renderDeviceButton(activeAudioDevice))
    }
  })
  .catch((e) => {})

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
    if (["i-display", "i-expand-wide"].includes(item.extraData.icon)) {
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

  const btnClass =
    device.kind == "videoinput" ? "js-video-device" : "js-audio-device"
  const iconClass =
    device.kind == "videoinput"
      ? device.deviceId == "no-camera"
        ? "i-video-slash"
        : "i-video"
      : device.deviceId == "no-microphone"
        ? "i-microphone-slash"
        : "i-microphone"

  btn.classList.add(btnClass)
  text.textContent = device.label
  checkbox.name =
    device.kind == "videoinput" ? "isVideoEnabled" : "isAudioEnabled"
  checkbox.checked = !["no-camera", "no-microphone"].includes(device.deviceId)
  icon.classList.add(iconClass)

  return clone
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
  const sections = [modalContent, permissionsContent, limitsContent]
  const footer = document.querySelector("#footer")!
  sections.forEach((s) => s.setAttribute("hidden", ""))
  footer.removeAttribute("hidden")
  activePageView = view

  if (isAllowRecords === false && view != "permissions") {
    limitsContent.removeAttribute("hidden")
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
        window.electronAPI.ipcRenderer.send("modal-window:resize", {
          alwaysOnTop: false,
          width: 430,
          height: 500,
        })
        setPageView("permissions")
      } else {
        window.electronAPI.ipcRenderer.send("modal-window:resize", {
          alwaysOnTop: true,
          width: 300,
          height: isWindows ? ModalWindowHeight.WIN : ModalWindowHeight.MAC,
        })
        setPageView("modal")
      }
    })
  }
)

window.electronAPI.ipcRenderer.on(
  "dropdown:select",
  (event, data: IDropdownPageSelectData) => {
    streamSettings = { ...streamSettings, ...data }

    if (data.action && data.action != activeScreenAction) {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "mode.video.selected",
        body: data.action,
      })

      activeScreenAction = data.action
      activeScreenActionItem = data.item
      renderScreenSettings(data.item)
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
  }
)

window.electronAPI.ipcRenderer.on("modal-window:hide", (event) => {
  openedDropdownType = undefined
  isAllowRecords = undefined
})

window.electronAPI.ipcRenderer.on("dropdown:hide", (event) => {
  openedDropdownType = undefined
})

window.electronAPI.ipcRenderer.on("modal-window:render", (event, action) => {
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
    if (isAllowRecords === false && activePageView != "permissions") {
      setPageView("limits")
    }
  }
)

const redirectToPlansBtn = document.querySelector("#redirectToPlans")!
const windowsToolbar = document.querySelector(".windows-toolbar")!
const windowsMinimizeBtn = document.querySelector("#windows_minimize")!
const windowsCloseBtn = document.querySelector("#windows_close")!
const isWindows = navigator.userAgent.indexOf("Windows") != -1
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
        const offsetY = btn.getBoundingClientRect().top
        const action = btn.dataset.action as ScreenAction
        const list: IDropdownList = {
          type: "screenActions",
          items: getDropdownItems("screenActions"),
        }
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
        const offsetY = btn.getBoundingClientRect().top
        const list: IDropdownList = {
          type: "videoDevices",
          items: getDropdownItems("videoDevices"),
        }
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
        const offsetY = btn.getBoundingClientRect().top
        const list: IDropdownList = {
          type: "audioDevices",
          items: getDropdownItems("audioDevices"),
        }
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

const systemAudioCheckbox = document.querySelector(
  ".system-audio-checkbox"
) as HTMLInputElement
systemAudioCheckbox.addEventListener(
  "change",
  (event) => {
    const input = event.target as HTMLInputElement
    streamSettings = { ...streamSettings, audio: input.checked }
    sendSettings()
  },
  false
)
const startBtn = document.querySelector("#startBtn")!
startBtn.addEventListener(
  "click",
  () => {
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
    window.electronAPI.ipcRenderer.send("start-recording", streamSettings)
  },
  false
)
