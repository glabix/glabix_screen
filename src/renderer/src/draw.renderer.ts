import "@renderer/styles/panel.scss"
import { KonvaPointerEvent } from "konva/lib/PointerEvents"
import Konva from "konva"
import { LoggerEvents } from "@shared/events/logger.events"
import {
  DialogWindowEvents,
  DrawEvents,
  HotkeysEvents,
  IDrawLaserDelaySettings,
  IDrawSettings,
  IModalWindowTabData,
  ModalWindowEvents,
} from "@shared/types/types"
import { UserSettingsEvents } from "@shared/types/user-settings.types"

const COUNTDOWN_DELAY_DAY = 1000 * 60 * 60 * 24
let COUNTDOWN_DELAY = 2000

class Draw {
  stage: Konva.Stage
  countdownTimer: number | null
  laserColor = getComputedStyle(document.documentElement).getPropertyValue(
    "--accent-13"
  )
  laserStrokeWidth = 5
  isScreenshotMode = false

  constructor() {
    this.setListeners()
  }

  setListeners() {
    window.electronAPI.ipcRenderer.on("stop-recording", () => {
      this.drawEnd()
    })

    window.electronAPI.ipcRenderer.on(
      ModalWindowEvents.TAB,
      (event, data: IModalWindowTabData) => {
        this.drawEnd()

        if (data.activeTab == "screenshot") {
          this.isScreenshotMode = true
        }
        if (data.activeTab == "video") {
          this.isScreenshotMode = false
        }
      }
    )

    window.electronAPI.ipcRenderer.on(
      UserSettingsEvents.DRAW_SETTING_GET,
      (event, settings: IDrawSettings | undefined) => {
        if (settings) {
          this.laserColor = getComputedStyle(
            document.documentElement
          ).getPropertyValue(`${settings.color}`)
          this.laserStrokeWidth = settings.width
        }
      }
    )

    window.electronAPI.ipcRenderer.on(
      UserSettingsEvents.DRAW_LASER_DELAY_SETTINGS_GET,
      (event, data: IDrawLaserDelaySettings) => {
        if (typeof data.delay == "number") {
          COUNTDOWN_DELAY = data.delay
        }

        if (data.disabled) {
          COUNTDOWN_DELAY = COUNTDOWN_DELAY_DAY
        }
      }
    )

    window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_START, () => {
      this.drawStart()
    })

    window.electronAPI.ipcRenderer.on(DrawEvents.DRAW_END, () => {
      this.drawEnd()
    })

    window.electronAPI.ipcRenderer.on(HotkeysEvents.DRAW, () => {
      if (this.isScreenshotMode) {
        return
      }

      if (this.stage) {
        window.electronAPI.ipcRenderer.send(DrawEvents.DRAW_END, {})
      } else {
        window.electronAPI.ipcRenderer.send(DrawEvents.DRAW_START, {})
      }
    })
  }

  private drawStart() {
    if (this.stage) return
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.enabled",
      body: { color: this.laserColor, width: this.laserStrokeWidth },
    })

    document.body.classList.add("is-drawing")

    this.stage = new Konva.Stage({
      container: "draw-container",
      width: window.innerWidth,
      height: window.innerHeight,
    })

    const layer = new Konva.Layer()
    this.stage.add(layer)
    const layerOpacity = new Konva.Layer()
    this.stage.add(layerOpacity)

    let isPaint: boolean
    let lastLine: Konva.Line
    let circle: Konva.Circle

    this.stage.on("mouseenter", () => {
      this.stage.container().style.cursor = "cell"
    })
    this.stage.on("mouseleave", () => {
      this.stage.container().style.cursor = "default"
    })

    this.stage.on("mousedown touchstart", () => {
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "tools.lazer.drawing.started",
      })

      if (this.countdownTimer) {
        window.clearTimeout(this.countdownTimer)
      }

      isPaint = true
      const pos = this.stage.getPointerPosition()!

      lastLine = new Konva.Line({
        stroke: this.laserColor,
        strokeWidth: this.laserStrokeWidth,
        bezier: true,
        lineCap: "round",
        points: [pos.x, pos.y, pos.x, pos.y],
      })
      layer.add(lastLine)

      circle = new Konva.Circle({
        x: pos.x,
        y: pos.y,
        fill: this.laserColor,
        radius: this.laserStrokeWidth / 2,
        opacity: 0.5,
      })
      layerOpacity.add(circle)
    })

    this.stage.on("mousemove touchmove", (e: KonvaPointerEvent) => {
      if (!isPaint) {
        return
      }
      // prevent scrolling on touch devices
      e.evt.preventDefault()

      const pos = this.stage.getPointerPosition()!
      const newPoints = lastLine.points().concat([pos.x, pos.y])
      lastLine.points(newPoints)
      circle.x(pos.x)
      circle.y(pos.y)
    })

    this.stage.on("mouseup touchend", () => {
      isPaint = false
      window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
        title: "tools.lazer.drawing.finished",
      })
      this.startCountdown().then(() => {
        const tween = new Konva.Tween({
          node: layer,
          duration: 0.2,
          opacity: 0,
          onFinish: () => {
            layer.destroyChildren()
            layer.opacity(1)
          },
        })
        tween.play()
      })

      const tweenOpacity = new Konva.Tween({
        node: layerOpacity,
        duration: 0.2,
        opacity: 0,
        onFinish: () => {
          layerOpacity.destroyChildren()
          layerOpacity.opacity(1)
        },
      })
      tweenOpacity.play()
    })
  }

  private drawEnd() {
    document.body.classList.remove("is-drawing")
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.disabled",
    })
    if (this.stage) {
      this.stage.clear()
      this.stage.destroy()
      this.stage = null
      this.countdownTimer = null
    }
  }

  private startCountdown(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.countdownTimer) {
        window.clearTimeout(this.countdownTimer)
      }

      this.countdownTimer = window.setTimeout(() => {
        if (this.countdownTimer) {
          this.countdownTimer = null
          resolve(true)
        }
      }, COUNTDOWN_DELAY)
    })
  }
}

const draw = new Draw()

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `draw.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `draw.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
