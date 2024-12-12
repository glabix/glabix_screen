import { LoggerEvents } from "@shared/events/logger.events"
import { StreamSettings } from "@shared/types/types"
import { Display, Rectangle } from "electron"

let canvasContainer = document.querySelector(
  ".crop-screenshot-container"
)! as HTMLDivElement
let canvas = document.querySelector(
  "canvas#crop_screenshot"
) as HTMLCanvasElement
canvas.width = window.innerWidth
canvas.height = window.innerHeight
let ctx = canvas.getContext("2d")!

let cropRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 }

let isDown = false

let startX = 0
let startY = 0

function initView() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)" // Черный с 50% прозрачностью
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  cropRect = { x: 0, y: 0, width: 0, height: 0 }
}

initView()

function handleMouseDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  startX = e.clientX
  startY = e.clientY

  isDown = true

  window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
}

function handleMouseUp(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  isDown = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  canvasContainer.setAttribute("hidden", "")
  window.electronAPI.ipcRenderer.send("invalidate-shadow", {})

  setTimeout(() => {
    const crop = cropRect.width && cropRect.height ? cropRect : undefined
    window.electronAPI.ipcRenderer.send("screenshot:create", crop)
    initView()
  }, 100)
}

function handleMouseMove(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (!isDown) {
    return
  }

  // get the current mouse position
  const mouseX = e.clientX
  const mouseY = e.clientY

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const dirX = mouseX - startX < 0 ? -1 : 1
  const dirY = mouseY - startY < 0 ? -1 : 1
  const width = Math.abs(mouseX - startX)
  const height = Math.abs(mouseY - startY)
  const x = dirX > 0 ? startX : mouseX
  const y = dirY > 0 ? startY : mouseY

  cropRect = { x, y, width, height }

  ctx.clearRect(x, y, width, height)

  ctx.strokeStyle = "white" // Цвет рамки
  ctx.lineWidth = 1 // Толщина линии
  ctx.strokeRect(x - 1, y - 1, width + 1, height + 1)

  ctx.fillStyle = "white" // Цвет текста
  ctx.font = "14px Roboto"
  ctx.fillText(`${width}x${height}`, width + x, height + y + 20)

  window.electronAPI.ipcRenderer.send("invalidate-shadow", {})
}

canvas.addEventListener("mousedown", handleMouseDown, false)
canvas.addEventListener("mousemove", handleMouseMove, false)
canvas.addEventListener("mouseup", handleMouseUp, false)
// canvas.addEventListener('mouseout', handleMouseUp, false)

window.electronAPI.ipcRenderer.on(
  "dropdown:select.screenshot",
  (event, data: StreamSettings) => {
    if (data.action == "cropScreenshot") {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initView()
      canvasContainer.removeAttribute("hidden")
    } else {
      canvasContainer.setAttribute("hidden", "")
    }
  }
)
window.electronAPI.ipcRenderer.on(
  "dropdown:select.video",
  (event, data: StreamSettings) => {
    canvasContainer.setAttribute("hidden", "")
  }
)

window.electronAPI.ipcRenderer.on(
  "screen:change",
  (event, display: Display) => {
    canvas.width = display.bounds.width
    canvas.height = display.bounds.height
    initView()
  }
)
