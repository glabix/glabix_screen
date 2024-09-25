import "./styles/modal-page.scss"
import {
  DropdownListType,
  IDropdownItem,
  IDropdownList,
  IDropdownPageData,
  IDropdownPageSelectData,
  IOrganizationLimits,
  IMediaDevicesAccess,
  IScreenActionItem,
  MediaDeviceType,
  ScreenAction,
  SimpleStoreEvents,
  StreamSettings,
} from "./helpers/types"
import { APIEvents } from "./events/api.events"
;(function () {
  let openedDropdownType: DropdownListType | undefined = undefined
  const audioDeviceContainer = document.querySelector("#audio_device_container")
  const videoDeviceContainer = document.querySelector("#video_device_container")
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
  let activeScreenActionItem: IDropdownItem = screenActionsList[0]
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
  let activeVideoDevice: MediaDeviceInfo
  let activeScreenAction: ScreenAction = "fullScreenVideo"
  let streamSettings: StreamSettings = {
    action: activeScreenAction,
    video: true,
  }

  async function setupMediaDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    hasMicrophone = devices.some((d) => d.kind == "audioinput")
    hasCamera = devices.some((d) => d.kind == "videoinput")
    audioDevicesList = devices.filter((d) => d.kind == "audioinput")
    audioDevicesList = [noAudioDevice, ...audioDevicesList]
    activeAudioDevice = audioDevicesList[0]
    videoDevicesList = devices.filter((d) => d.kind == "videoinput")
    videoDevicesList = [noVideoDevice, ...videoDevicesList]
    activeVideoDevice = videoDevicesList[0]
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
    ) as HTMLElement
    const template = document.querySelector(
      "#screen_settings_tpl"
    ) as HTMLTemplateElement

    const clone = template.content.cloneNode(true) as HTMLElement
    const btn = clone.querySelector("button")
    const text = clone.querySelector("span")
    const icon = clone.querySelector("i")

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

    container.innerHTML = null
    container.appendChild(clone)
  }

  renderScreenSettings(activeScreenActionItem)

  function renderDeviceButton(device: MediaDeviceInfo): HTMLElement {
    const template = document.querySelector(
      "#media_device_tpl"
    ) as HTMLTemplateElement
    const clone = template.content.cloneNode(true) as HTMLElement
    const btn = clone.querySelector("button")
    const checkbox = clone.querySelector(
      "input[type='checkbox']"
    ) as HTMLInputElement
    const text = clone.querySelector("span")
    const icon = clone.querySelector("i")

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
          isSelected: item.id == activeScreenActionItem.id,
          extraData: item.extraData,
        }
      })
    }

    if (type == "videoDevices") {
      items = videoDevicesList.map((d) => {
        return {
          label: d.label,
          id: d.deviceId,
          isSelected: d.deviceId == activeVideoDevice.deviceId,
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

    window.electronAPI.ipcRenderer.send(
      "record-settings-change",
      streamSettings
    )
  }

  // IPC
  window.electronAPI.ipcRenderer.on("app:version", (event, version) => {
    const versionEl = document.querySelector("#app_version")
    versionEl.innerHTML = `, v${version}`
  })

  window.electronAPI.ipcRenderer.on(
    "mediaDevicesAccess:get",
    async (event, permissions: IMediaDevicesAccess) => {
      const modalContent = document.querySelector(".modal-content")
      const permissionsContent = document.querySelector(".permissions-content")

      navigator.mediaDevices.enumerateDevices().then((devices) => {
        hasMicrophone = devices.some((d) => d.kind == "audioinput")
        hasCamera = devices.some((d) => d.kind == "videoinput")

        const noCameraAccess = hasCamera && !permissions.camera
        const noMicrophoneAccess = hasMicrophone && !permissions.microphone
        const noScreenAccess = !permissions.screen

        Object.keys(permissions).forEach((deviceName: MediaDeviceType) => {
          const deviceEl = document.querySelector(
            `.js-permission-${deviceName}`
          )

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
          modalContent.setAttribute("hidden", "")
          permissionsContent.removeAttribute("hidden")
        } else {
          window.electronAPI.ipcRenderer.send("modal-window:resize", {
            alwaysOnTop: true,
            width: 300,
            height: 395,
          })
          modalContent.removeAttribute("hidden")
          permissionsContent.setAttribute("hidden", "")
        }

        const footer = document.querySelector("#footer")
        footer.removeAttribute("hidden")
      })
    }
  )

  window.electronAPI.ipcRenderer.on(
    "dropdown:select",
    (event, data: IDropdownPageSelectData) => {
      streamSettings = { ...streamSettings, ...data }

      if (data.action && data.action != activeScreenAction) {
        activeScreenAction = data.action
        activeScreenActionItem = data.item
        renderScreenSettings(data.item)
      }

      if (data.audioDeviceId) {
        activeAudioDevice = audioDevicesList.find(
          (d) => d.deviceId == data.audioDeviceId
        )
        audioDeviceContainer.innerHTML = null
        audioDeviceContainer.appendChild(renderDeviceButton(activeAudioDevice))
      }

      if (data.cameraDeviceId) {
        activeVideoDevice = videoDevicesList.find(
          (d) => d.deviceId == data.cameraDeviceId
        )
        videoDeviceContainer.innerHTML = null
        videoDeviceContainer.appendChild(renderDeviceButton(activeVideoDevice))
      }

      openedDropdownType = undefined
      sendSettings()
    }
  )

  window.electronAPI.ipcRenderer.on("modal-window:hide", (event) => {
    openedDropdownType = undefined
  })
  window.electronAPI.ipcRenderer.on("modal-window:render", (event, action) => {
    const item = screenActionsList.find((i) => i.id == action)
    activeScreenAction = action
    activeScreenActionItem = item
    streamSettings = { ...streamSettings, action }
    renderScreenSettings(item)
  })

  window.electronAPI.ipcRenderer.on(
    APIEvents.GET_ORGANIZATION_LIMITS,
    (event, limits: IOrganizationLimits) => {
      if (limits.upload_allowed) {
      }
    }
  )

  document.addEventListener("DOMContentLoaded", () => {})
  const windowsToolbar = document.querySelector(".windows-toolbar")
  const windowsMinimizeBtn = document.querySelector("#windows_minimize")
  const windowsCloseBtn = document.querySelector("#windows_close")
  const isWindows = navigator.userAgent.indexOf("Windows") != -1
  if (isWindows) {
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

  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target as HTMLElement

      if (btn.classList.contains("js-btn-action-type")) {
        if (openedDropdownType == "screenActions") {
          window.electronAPI.ipcRenderer.send("dropdown:close", {})
          openedDropdownType = undefined
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

  const startBtn = document.querySelector("#startBtn")
  startBtn.addEventListener(
    "click",
    () => {
      if (streamSettings.action == "fullScreenVideo") {
        sendSettings()
      }

      window.electronAPI.ipcRenderer.send("start-recording", streamSettings)
    },
    false
  )
})()
