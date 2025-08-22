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

const activeBgBtn = document.querySelector(
  ".js-toggle-bg"
)! as HTMLButtonElement
const activeBgBtns = document.querySelectorAll(
  "[data-bg]"
)! as NodeListOf<HTMLButtonElement>
const bgPopover = document.querySelector(
  ".js-active-bg-popover"
)! as HTMLDivElement
// activeColorBtn?: HTMLButtonElement
const paintingBoard = new PaintingBoard({
  activeBgBtn,
  activeBgBtns,
  bgPopover,
})
const LAST_COLOR = "LAST_COLOR"
const LAST_SHAPE_WIDTH = "LAST_SHAPE_WIDTH"
const LAST_PAINTING_BOARD_BG = "LAST_PAINTING_BOARD_BG"
const lastColor = localStorage.getItem(LAST_COLOR)
const lastWidth = Number(localStorage.getItem(LAST_SHAPE_WIDTH))
const lastBoardBg = localStorage.getItem(LAST_PAINTING_BOARD_BG)

if (lastColor) {
  paintingBoard.setActiveColor(lastColor)
}

if (lastWidth) {
  paintingBoard.setActiveShapeWidth(lastWidth)
}

if (lastBoardBg) {
  paintingBoard.setBgColor(lastBoardBg)
}

paintingBoard.renderBackground(lastBoardBg || "")

paintingBoard.on(PaintingBoardEvents.UPDATE_BOARD_BG, (event) => {
  const bg = event.detail
  localStorage.setItem(LAST_PAINTING_BOARD_BG, bg)
})

paintingBoard.on(PaintingBoardEvents.UPDATE_SHAPE_WIDTH, (event) => {
  const width = event.detail
  localStorage.setItem(LAST_SHAPE_WIDTH, width)
})

paintingBoard.on(PaintingBoardEvents.UPDATE_SHAPE_COLOR, (event) => {
  const colorName = event.detail
  localStorage.setItem(LAST_COLOR, colorName)
})

const copyBtn = document.querySelector(".js-copy-image")! as HTMLButtonElement
const saveBtn = document.querySelector(".js-save-image")! as HTMLButtonElement

copyBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send(
      ScreenshotWindowEvents.COPY_IMAGE,
      paintingBoard.copyStage()
    )
  },
  false
)

saveBtn.addEventListener(
  "click",
  () => {
    const dataURL = paintingBoard.copyStage()
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

window.addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    if (e.keyCode == 67 && (e.metaKey || e.ctrlKey)) {
      window.electronAPI.ipcRenderer.send(
        ScreenshotWindowEvents.COPY_IMAGE,
        paintingBoard.copyStage()
      )
    }
  },
  false
)
