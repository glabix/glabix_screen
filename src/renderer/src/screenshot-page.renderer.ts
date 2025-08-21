import "@renderer/styles/screenshot-page.scss"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
import { dataURLtoBlob } from "@shared/helpers/data-url-to-blob"
import { getTitle } from "@shared/helpers/get-title"
import {
  IScreenshotImageData,
  ScreenshotWindowEvents,
} from "@shared/types/types"
import { PaintingBoard, PaintingBoardEvents } from "./helpers/painting-board"

const paintingBoard = new PaintingBoard({})
const LAST_COLOR = "LAST_COLOR"
const LAST_SHAPE_WIDTH = "LAST_SHAPE_WIDTH"
const lastColor = localStorage.getItem(LAST_COLOR)
const lastWidth = Number(localStorage.getItem(LAST_SHAPE_WIDTH))

if (lastColor) {
  paintingBoard.setActiveColor(lastColor)
}

if (lastWidth) {
  paintingBoard.setActiveShapeWidth(lastWidth)
}

paintingBoard.on(PaintingBoardEvents.COPY_IMAGE, (event) => {
  const dataURL = event.detail
  window.electronAPI.ipcRenderer.send(
    ScreenshotWindowEvents.COPY_IMAGE,
    dataURL
  )
})

paintingBoard.on(PaintingBoardEvents.UPDATE_SHAPE_WIDTH, (event) => {
  const width = event.detail
  localStorage.setItem(LAST_SHAPE_WIDTH, width)
})

paintingBoard.on(PaintingBoardEvents.UPDATE_SHAPE_COLOR, (event) => {
  const colorName = event.detail
  localStorage.setItem(LAST_COLOR, colorName)
})

window.electronAPI?.ipcRenderer?.on(
  ScreenshotWindowEvents.RENDER_IMAGE,
  (event, data: IScreenshotImageData) => {
    window.electronAPI?.ipcRenderer?.send(LoggerEvents.SEND_LOG, {
      title: "screenshot.getImage",
    })
    paintingBoard.renderScreenshot(data)
  }
)

const copyBtn = document.querySelector(".js-copy-image")! as HTMLButtonElement
const saveBtn = document.querySelector(".js-save-image")! as HTMLButtonElement
const uploadBtn = document.querySelector(
  ".js-upload-image"
)! as HTMLButtonElement

copyBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send(
      ScreenshotWindowEvents.COPY_IMAGE,
      paintingBoard.copyTrimStage()
    )
  },
  false
)

saveBtn.addEventListener(
  "click",
  () => {
    const dataURL = paintingBoard.copyTrimStage()
    const a = document.createElement("a")
    a.style.display = "none"
    a.href = dataURL
    a.download = `${getTitle(Date.now(), true)}.png`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(dataURL)
    a.remove()
  },
  false
)
uploadBtn.addEventListener(
  "click",
  () => {
    const dataURL = paintingBoard.copyTrimStage()
    const fileSize = dataURLtoBlob(dataURL).size
    const title = getTitle(Date.now(), true)
    const fileName = `${title}.png`

    window.electronAPI.ipcRenderer.send(APIEvents.UPLOAD_SCREENSHOT, {
      fileSize,
      dataURL,
      title,
      fileName,
    })
  },
  false
)

const windowsToolbar = document.querySelector(".windows-toolbar")!
const windowsMaximizeBtn = document.querySelector("#windows_maximize")!
const windowsCloseBtn = document.querySelector("#windows_close")!
const maximizeBtns = document.querySelectorAll(
  ".maximize-dlbclick"
)! as NodeListOf<HTMLDivElement>
const isWindows = navigator.userAgent.indexOf("Windows") != -1

if (isWindows) {
  windowsToolbar.removeAttribute("hidden")
}

windowsMaximizeBtn.addEventListener(
  "click",
  () => {
    if (isWindows) {
      window.electronAPI.ipcRenderer.send("windows:maximize", {})
    }
  },
  false
)
maximizeBtns.forEach((btn) => {
  btn.addEventListener(
    "dblclick",
    () => {
      window.electronAPI.ipcRenderer.send("windows:maximize", {})
    },
    false
  )
})

windowsCloseBtn.addEventListener(
  "click",
  () => {
    if (isWindows) {
      window.electronAPI.ipcRenderer.send("windows:close", {})
    }
  },
  false
)
