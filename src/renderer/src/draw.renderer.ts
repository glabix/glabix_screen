import "@renderer/styles/panel.scss"
import { KonvaPointerEvent } from "konva/lib/PointerEvents"
import Konva from "konva"
import Moveable, { MoveableRefTargetType, MoveableRefType } from "moveable"
import { LoggerEvents } from "@shared/events/logger.events"
import {
  DialogWindowEvents,
  HotkeysEvents,
  IModalWindowTabData,
  ModalWindowEvents,
} from "@shared/types/types"

const COUNTDOWN_DELAY = 2000

class Draw {
  stage: Konva.Stage
  countdownTimer: number | null
  laserColor = getComputedStyle(document.documentElement).getPropertyValue(
    "--accent-13"
  )
  laserStrokeWidth = 5
  panelDraw = document.querySelector("#panel-draw")
  drawToggle = document.querySelector("#draw-btn")
  isScreenshotMode = false

  constructor() {
    this.setListeners()
  }

  debounce(func, wait) {
    let timeoutId

    return function (...args) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(() => {
        func(...args)
      }, wait)
    }
  }

  logWidthChange(laserStrokeWidth) {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.settings.change.width",
      body: { width: laserStrokeWidth },
    })
  }

  debouncedLogWidth = this.debounce(this.logWidthChange, 200)

  setListeners() {
    this.handleDrawToggle()
    this.handleDrawSettingsToggle()
    this.handleDrawSettingsClose()
    this.handleLaserColorChange()
    this.handleLaserStrokeWidthChange()

    window.electronAPI.ipcRenderer.on("stop-recording", () => {
      this.drawEnd()
    })

    window.electronAPI.ipcRenderer.on(DialogWindowEvents.CREATE, () => {
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

    window.electronAPI.ipcRenderer.on(HotkeysEvents.DRAW, () => {
      if (this.isScreenshotMode) {
        return
      }

      if (this.stage) {
        this.drawEnd()
      } else {
        this.drawStart()
      }
    })
  }

  handleDrawToggle() {
    this.drawToggle.addEventListener("click", () => {
      if (this.stage) {
        this.drawEnd()
      } else {
        this.drawStart()
      }
    })
  }

  handleDrawSettingsToggle() {
    document
      .querySelector("#draw-settings-btn")
      .addEventListener("click", () => {
        this.drawStart()
        this.panelDraw.classList.toggle("visible")
        this.panelDraw.classList.toggle("invisible")
      })
  }

  handleDrawSettingsClose() {
    document
      .querySelector("#draw-settings-close-btn")
      .addEventListener("click", () => {
        this.closeSettings()
      })
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.settings.close",
    })
  }

  handleLaserColorChange() {
    document
      .querySelectorAll("[data-color]")
      .forEach(
        (b: HTMLButtonElement, _, bullets: NodeListOf<HTMLButtonElement>) => {
          b.addEventListener("click", () => {
            this.changeLaserColor(b, bullets)
          })
        }
      )
  }

  handleLaserStrokeWidthChange() {
    document
      .querySelector(".panel-slider")
      .addEventListener("input", (event) => {
        this.laserStrokeWidth = +(event.target as HTMLInputElement).value
        this.debouncedLogWidth(this.laserStrokeWidth)
      })
  }

  private drawStart() {
    if (this.stage) return
    window.electronAPI.ipcRenderer.send("draw:start", {})
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.enabled",
      body: { color: this.laserColor, width: this.laserStrokeWidth },
    })
    this.drawToggle.classList.add("active")

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
      const pos = this.stage.getPointerPosition()

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

      const pos = this.stage.getPointerPosition()
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
    this.drawToggle.classList.remove("active")
    window.electronAPI.ipcRenderer.send("draw:end", {})
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.disabled",
    })
    if (this.stage) {
      this.stage.clear()
      this.stage.destroy()
      this.stage = null
      this.countdownTimer = null

      this.closeSettings()
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

  private closeSettings() {
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.settings.close",
    })
    this.panelDraw.classList.add("invisible")
    this.panelDraw.classList.remove("visible")
  }

  private changeLaserColor(
    currentBullet: HTMLButtonElement,
    bullets: NodeListOf<HTMLButtonElement>
  ) {
    bullets.forEach((b: HTMLButtonElement) => {
      b.classList.remove("scale-140")
    })

    currentBullet.classList.add("scale-140")
    this.laserColor = getComputedStyle(
      document.documentElement
    ).getPropertyValue(`--${currentBullet.dataset.color}`)
    window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
      title: "tools.lazer.settings.color.change",
      body: { color: this.laserColor },
    })
  }
}

const draw = new Draw()
setPanelDraggable()

function setPanelDraggable() {
  const container = document.querySelector(".panel-wrapper")
  const dragHandler = document.querySelector(".panel-drag-handler")
  const moveable = new Moveable(document.body, {
    target: container as MoveableRefTargetType,
    container: document.body,
    className: "moveable-invisible-container",
    draggable: true,
    dragTarget: dragHandler as MoveableRefType,
  })

  moveable
    .on("dragStart", ({ target, clientX, clientY }) => {
      target.classList.add("moveable-dragging")
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
    .on(
      "drag",
      ({
        target,
        transform,
        left,
        top,
        right,
        bottom,
        beforeDelta,
        beforeDist,
        delta,
        dist,
        clientX,
        clientY,
      }) => {
        target!.style.left = `${left}px`
        target!.style.top = `${top}px`
        window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
      }
    )
    .on("dragEnd", ({ target, isDrag, clientX, clientY }) => {
      target.classList.remove("moveable-dragging")
      window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
    })
}

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
