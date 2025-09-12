import "@renderer/styles/recorder-settings-page.scss"
import { LoginEvents } from "@shared/events/login.events"
import { LoggerEvents } from "../../shared/events/logger.events"
import { ZoomPageDisabled } from "./helpers/zoom-page-disable"

document.addEventListener("DOMContentLoaded", () => {
  const zoomPageDisabled = new ZoomPageDisabled()
  // videoSettings.value = 'sdfsdfdf'
})

const logger = document.querySelector(".js-logger")! as HTMLElement
const videoSettings = document.querySelector(
  ".js-input-video-settings"
)! as HTMLTextAreaElement
const codec = document.querySelector(".js-input-codec")! as HTMLInputElement
const bitrate = document.querySelector(".js-input-bitrate")! as HTMLInputElement
const updateBtn = document.querySelector(".js-update-btn")! as HTMLButtonElement

function updateLog(newLog: string, clear = false) {
  // const prevLog = logger.innerHTML
  logger.innerHTML = clear ? newLog : newLog + logger.innerHTML
}

function initSettings(settings) {
  videoSettings.value = settings.videoSettings
    ? JSON.stringify(settings.videoSettings)
    : "true"
  codec.value = settings.codec || "video/webm;codecs=h264"
  bitrate.value = settings.bitrate || 14000000
}

initSettings({})

updateBtn.addEventListener(
  "click",
  (e) => {
    try {
      const v = JSON.parse(videoSettings.value)

      const newSettings = {
        videoSettings: v,
        codec: codec.value,
        bitrate: Number(bitrate.value),
      }
      if (newSettings.codec && newSettings.bitrate) {
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
      }
    } catch {}
  },
  false
)

videoSettings.addEventListener(
  "input",
  (e) => {
    const value = (e.target as HTMLTextAreaElement).value

    try {
      JSON.parse(value)
      videoSettings.classList.remove("has-error")
    } catch {
      videoSettings.classList.add("has-error")
    }

    if (!value) {
      videoSettings.classList.remove("has-error")
    }
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
