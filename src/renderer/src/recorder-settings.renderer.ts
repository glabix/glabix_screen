import "@renderer/styles/recorder-settings-page.scss"
import { LoginEvents } from "@shared/events/login.events"
import { LoggerEvents } from "../../shared/events/logger.events"
import { ZoomPageDisabled } from "./helpers/zoom-page-disable"

document.addEventListener("DOMContentLoaded", () => {
  const zoomPageDisabled = new ZoomPageDisabled()
  // videoSettings.value = 'sdfsdfdf'
})

const logger = document.querySelector(".js-logger")! as HTMLElement
const codec = document.querySelector(".js-input-codec")! as HTMLInputElement
const bitrate = document.querySelector(".js-input-bitrate")! as HTMLInputElement
const maxHeight = document.querySelector(
  ".js-input-max-height"
)! as HTMLInputElement
const maxWidth = document.querySelector(
  ".js-input-max-width"
)! as HTMLInputElement
const maxRate = document.querySelector(
  ".js-input-max-rate"
)! as HTMLInputElement
const updateBtn = document.querySelector(".js-update-btn")! as HTMLButtonElement

function updateLog(newLog: string, clear = false) {
  // const prevLog = logger.innerHTML
  logger.innerHTML = clear ? newLog : newLog + logger.innerHTML
}

function initSettings(settings) {
  // videoSettings.value = settings.videoSettings
  //   ? JSON.stringify(settings.videoSettings)
  //   : "true"
  maxWidth.value = settings?.streamSettings?.maxWidth || ""
  maxHeight.value = settings?.streamSettings?.maxHeight || ""
  maxRate.value = settings?.streamSettings?.maxRate || ""
  codec.value = settings.codec || "video/webm;codecs=h264"
  bitrate.value = settings.bitrate || 14000000
}

initSettings({})

updateBtn.addEventListener(
  "click",
  (e) => {
    let streamSettings = {
      maxHeight: Number(maxHeight.value) || undefined,
      maxWidth: Number(maxWidth.value) || undefined,
      maxRate: Number(maxRate.value) || undefined,
    }

    const newSettings = {
      streamSettings,
      codec: codec.value,
      bitrate: Number(bitrate.value),
    }

    const success = `
    <span class="text-primary">
    ================== <br>
    настройки обновлены
    </span>
    <br>
    `
    updateLog(success)

    window.electronAPI.ipcRenderer.send(
      "recorder-settings-window:set",
      newSettings
    )
  },
  false
)

// .send('recorder-settings-window:get', settings)
window.electronAPI.ipcRenderer.on(
  "recorder-settings-window:get",
  (event, settings) => {
    initSettings(settings)
  }
)

window.electronAPI.ipcRenderer.on(
  "recorder-settings-window:log",
  (event, data) => {
    updateLog(data)
  }
)

window.electronAPI.ipcRenderer.on(LoginEvents.LOGIN_FAILED, () => {
  alert("Login failed. Try again.")
})

window.electronAPI.ipcRenderer.on(LoginEvents.TOKEN_CONFIRMED, (token) => {
  alert(token)
})

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `login-page.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `login-page.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
