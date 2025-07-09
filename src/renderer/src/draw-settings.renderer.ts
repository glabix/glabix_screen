import "@renderer/styles/panel.scss"
import { LoggerEvents } from "@shared/events/logger.events"
import {
  DrawEvents,
  IDrawSettings,
  IModalWindowTabData,
  ModalWindowEvents,
} from "@shared/types/types"
import { UserSettingsEvents } from "@shared/types/user-settings.types"

class DrawSettings {
  colorPrefix = "--"
  laserColorName = `${this.colorPrefix}accent-13`
  laserStrokeWidth = 5
  webcameraSizeBtn = document.querySelector(
    "#webcamera-size-btn"
  )! as HTMLElement
  drawToggle = document.querySelector("#draw-btn")! as HTMLElement
  isScreenshotMode = false

  constructor() {
    this.setListeners()
  }

  setListeners() {
    this.handleDrawToggle()
    this.handleLaserColorChange()
    this.handleLaserStrokeWidthChange()

    this.webcameraSizeBtn.addEventListener("click", () => {
      window.electronAPI.ipcRenderer.send(DrawEvents.DRAW_END, {})
      this.end()
    })

    window.electronAPI.ipcRenderer.on(
      UserSettingsEvents.DRAW_SETTING_GET,
      (event, settings: IDrawSettings | undefined) => {
        if (settings) {
          this.laserColorName = settings.color
          this.laserStrokeWidth = settings.width

          const slider = document.querySelector(
            ".panel-slider"
          )! as HTMLInputElement
          slider.value = `${this.laserStrokeWidth}`

          const colorBtn = document.querySelector(
            `[data-color="${this.laserColorName.replace(this.colorPrefix, "")}"]`
          ) as HTMLButtonElement

          if (colorBtn) {
            document
              .querySelectorAll("[data-color]")
              .forEach((b) => b.classList.remove("is-active"))
            colorBtn?.classList.add("is-active")
          }
        }
      }
    )

    window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_START, () => {
      this.start()
    })

    window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_END, () => {
      this.end()
    })

    window.electronAPI.ipcRenderer.on(
      ModalWindowEvents.TAB,
      (event, data: IModalWindowTabData) => {
        this.end()

        if (data.activeTab == "screenshot") {
          this.isScreenshotMode = true
        }
        if (data.activeTab == "video") {
          this.isScreenshotMode = false
        }
      }
    )
  }

  handleDrawToggle() {
    this.drawToggle.addEventListener("click", () => {
      const isActive = this.drawToggle.classList.contains("active")
      this.toggle(isActive)
    })
  }

  toggle(isActive: boolean) {
    if (isActive) {
      window.electronAPI.ipcRenderer.send(DrawEvents.DRAW_END, {})
    } else {
      window.electronAPI.ipcRenderer.send(DrawEvents.DRAW_START, {})
    }
  }

  start() {
    this.drawToggle.classList.add("active")
    document.body.classList.add("is-drawing")
  }

  end() {
    this.drawToggle.classList.remove("active")
    document.body.classList.remove("is-drawing")
  }

  handleLaserColorChange() {
    document
      .querySelectorAll("[data-color]")
      .forEach((_b: Element, _: number, _bullets: NodeListOf<Element>) => {
        const b = _b as HTMLButtonElement
        const bullets = _bullets as NodeListOf<HTMLButtonElement>
        b.addEventListener("click", () => {
          this.changeLaserColor(b, bullets)
        })
      })
  }

  handleLaserStrokeWidthChange() {
    document
      .querySelector(".panel-slider")!
      .addEventListener("input", (event) => {
        this.laserStrokeWidth = +(event.target as HTMLInputElement).value
        const settings: IDrawSettings = {
          color: this.laserColorName,
          width: this.laserStrokeWidth,
        }
        window.electronAPI.ipcRenderer.send(
          UserSettingsEvents.DRAW_SETTING_SET,
          settings
        )
      })
  }

  private changeLaserColor(
    currentBullet: HTMLButtonElement,
    bullets: NodeListOf<HTMLButtonElement>
  ) {
    bullets.forEach((b: HTMLButtonElement) => {
      b.classList.remove("is-active")
    })

    currentBullet.classList.add("is-active")
    this.laserColorName = `${this.colorPrefix}${currentBullet.dataset.color}`
    // this.laserColor = getComputedStyle(document.documentElement).getPropertyValue(this.laserColorName)
    const settings: IDrawSettings = {
      color: this.laserColorName,
      width: this.laserStrokeWidth,
    }
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.DRAW_SETTING_SET,
      settings
    )
  }
}

const drawSettings = new DrawSettings()

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `draw-settings.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `draw-settings.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
