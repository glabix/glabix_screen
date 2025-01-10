import "@renderer/styles/screenshot-page.scss"
import { APIEvents } from "@shared/events/api.events"
import { LoggerEvents } from "@shared/events/logger.events"
import { dataURLtoBlob } from "@shared/helpers/data-url-to-blob"
import { getTitle } from "@shared/helpers/get-title"
import { IScreenshotImageData } from "@shared/types/types"
import Konva from "konva"
import { Arrow } from "konva/lib/shapes/Arrow"
import { Circle, CircleConfig } from "konva/lib/shapes/Circle"
import { Ellipse } from "konva/lib/shapes/Ellipse"
import { Line } from "konva/lib/shapes/Line"
import { Rect } from "konva/lib/shapes/Rect"
import { Text } from "konva/lib/shapes/Text"
import { TransformerConfig } from "konva/lib/shapes/Transformer"
import { Vector2d } from "konva/lib/types"

type ShapeTypes = "arrow" | "text" | "line" | "ellipse" | "rect" | "curved_line"
class CurvedLine extends Konva.Line {}
const COLORS_MAP = [
  { name: "accent-0", hex: "#00962a" },
  { name: "accent-1", hex: "#0061fd" },
  { name: "accent-2", hex: "#ff8a00" },
  { name: "accent-3", hex: "#04c1b6" },
  { name: "accent-4", hex: "#6a1b9a" },
  { name: "accent-5", hex: "#ab47bc" },
  { name: "accent-6", hex: "#ff24bd" },
  { name: "accent-7", hex: "#880e4f" },
  { name: "accent-8", hex: "#d81b60" },
  { name: "accent-9", hex: "#ff1744" },
  { name: "accent-10", hex: "#795548" },
  { name: "accent-11", hex: "#827717" },
  { name: "accent-12", hex: "#bf360c" },
  { name: "accent-13", hex: "#e65100" },
  { name: "accent-14", hex: "#78909c" },
  { name: "accent-15", hex: "#004d40" },
  { name: "accent-16", hex: "#03a9f4" },
  { name: "accent-17", hex: "#00838f" },
  { name: "accent-18", hex: "#4caf50" },
  { name: "accent-19", hex: "#283593" },
  { name: "light", hex: "#ffffff" },
]

const screenshotImageId = "screenshot_image"
const arrowIdSeparator = ":"
const arrowCircleStartId = "arrow_start_id"
const arrowCircleEndId = "arrow_end_id"

let shapes: any[] = []
let clickedShapeId = ""
let activeShape: Arrow | Text | Line | CurvedLine | Ellipse | Rect | undefined =
  undefined
let activeTextShape: Text | undefined = undefined
const LAST_COLOR = "LAST_COLOR"
let activeColor = ""

const LAST_SHAPE_WIDTH = "LAST_SHAPE_WIDTH"
let activeShapeWidth = 4
const fontSizeFactor = 6

let isMouseDown = false
let isShapeCreated = false

let activeShapeType: ShapeTypes = "arrow"
let startPos: Vector2d = { x: 0, y: 0 }
const mouseMoveTypes: ShapeTypes[] = [
  "arrow",
  "line",
  "ellipse",
  "rect",
  "curved_line",
]

const activeColorBtn = document.querySelector(
  ".js-toggle-color"
) as HTMLButtonElement
const activeColorBtns = document.querySelectorAll(
  "[data-color]"
)! as NodeListOf<HTMLButtonElement>
const colorPopover = document.querySelector(
  ".js-active-color-popover"
)! as HTMLDivElement
const activeWidthSlider = document.querySelector(
  ".js-slider-width"
) as HTMLInputElement
const pageContainer = document.querySelector(
  "#page_container"
)! as HTMLDivElement
const copyBtn = document.querySelector(".js-copy-image")! as HTMLButtonElement
const saveBtn = document.querySelector(".js-save-image")! as HTMLButtonElement
const uploadBtn = document.querySelector(
  ".js-upload-image"
)! as HTMLButtonElement
const textarea = document.querySelector(
  "#textarea_ghost"
)! as HTMLTextAreaElement
let isTextareaFocused = false
const shapeBtns = document.querySelectorAll(
  "[data-shape-type]"
)! as NodeListOf<HTMLButtonElement>
// const pageHeader = document.querySelector("#page_header")! as HTMLDivElement
// const pageFooter = document.querySelector("#page_footer")! as HTMLDivElement
let lastData: IScreenshotImageData | undefined = undefined

// Init Stage
const stage = new Konva.Stage({
  container: pageContainer,
  width: pageContainer.clientWidth,
  height: pageContainer.clientHeight,
})

const layer = new Konva.Layer()
stage.add(layer)

// Init Global Transformer
const trId = "transformer"
const trDefaultConfig: TransformerConfig = {
  id: trId,
  resizeEnabled: false,
  rotateEnabled: false,
  padding: 1,
  ignoreStroke: true,
  anchorSize: 10,
  anchorCornerRadius: 10,
  anchorFill: "#f0f0f0",
  anchorStroke: "#f0f0f0",
  borderStroke: "#bbb",
  anchorStyleFunc: (anchor) => {
    anchor.setAttrs({
      shadowColor: "black",
      shadowBlur: 5,
      shadowOffset: { x: 0, y: 3 },
      shadowOpacity: 0.6,
    })
  },
}
let tr = new Konva.Transformer(trDefaultConfig)

// Init Arrows Transform Circles
const transformCircleConfig: CircleConfig = {
  x: 0,
  y: 0,
  radius: 5,
  name: "_anchor",
  fill: "#f0f0f0",
  shadowColor: "black",
  shadowBlur: 5,
  shadowOffset: { x: 0, y: 3 },
  shadowOpacity: 0.6,
  draggable: true,
  hitStrokeWidth: 10,
  visible: false,
}

let arrowCircleStart = new Konva.Circle({
  id: arrowCircleStartId,
  ...transformCircleConfig,
})

let arrowCircleEnd = new Konva.Circle({
  id: arrowCircleEndId,
  ...transformCircleConfig,
})

const getActiveColorByName = (colorName: string): string => {
  return COLORS_MAP.find((c) => c.name == colorName)!.hex
}
const getActiveColorNameByHex = (hex: string): string => {
  return COLORS_MAP.find((c) => c.hex == hex)!.name
}

const getFontSize = (strokeWidth: number): number => {
  const width = strokeWidth < 2 ? 2 : strokeWidth
  return fontSizeFactor * width
}
const getShapeWidthByFontSize = (fontSize: number): number => {
  return Math.ceil(fontSize / fontSizeFactor)
}

const setActiveColor = (colorName?: string) => {
  const lastColor = localStorage.getItem(LAST_COLOR)

  if (colorName) {
    activeColor = getActiveColorByName(colorName)
    localStorage.setItem(LAST_COLOR, colorName)
  } else {
    activeColor = lastColor
      ? getActiveColorByName(lastColor)
      : getActiveColorByName("accent-6")
  }

  activeColorBtns.forEach((btn) => {
    const color = colorName ? colorName : lastColor || "accent-6"
    btn.classList.toggle("scale-140", btn.dataset.color?.includes(color))
  })

  activeColorBtn.querySelector("span")!.style.background = activeColor
}
setActiveColor()

const setActiveShapeWidth = (width?: number) => {
  const lastWidth = Number(localStorage.getItem(LAST_SHAPE_WIDTH))

  if (width) {
    activeShapeWidth = width
    localStorage.setItem(LAST_SHAPE_WIDTH, String(activeShapeWidth))
  } else {
    activeShapeWidth = lastWidth ? lastWidth : 4
  }

  activeWidthSlider.value = String(activeShapeWidth)
}
setActiveShapeWidth()

const init = () => {
  arrowCircleStart.destroy()
  arrowCircleEnd.destroy()

  tr = new Konva.Transformer(trDefaultConfig)
  layer.add(tr)

  arrowCircleStart = new Konva.Circle({
    id: arrowCircleStartId,
    ...transformCircleConfig,
  })

  arrowCircleEnd = new Konva.Circle({
    id: arrowCircleEndId,
    ...transformCircleConfig,
  })

  layer.add(arrowCircleStart)
  layer.add(arrowCircleEnd)
  layer.draw()

  arrowCircleStart.on("dragmove", () => {
    moveArrow(arrowCircleStart)
  })
  arrowCircleEnd.on("dragmove", () => {
    moveArrow(arrowCircleEnd)
  })
}
init()

window.electronAPI?.ipcRenderer?.on(
  "screenshot:getImage",
  (event, data: IScreenshotImageData) => {
    window.electronAPI?.ipcRenderer?.send(LoggerEvents.SEND_LOG, {
      title: "screenshot.getImage",
    })

    layer.destroyChildren()
    init()
    lastData = data

    let imageWidth = Math.ceil(lastData.width / lastData.scale)
    let imageHeight = Math.ceil(lastData.height / lastData.scale)

    if (imageHeight > stage.height()) {
      const scaleH = stage.height() / imageHeight
      imageHeight = stage.height()
      imageWidth = Math.ceil(imageWidth * scaleH)
    }

    if (imageWidth > stage.width()) {
      const scaleW = stage.width() / imageWidth
      imageWidth = stage.width()
      imageHeight = Math.ceil(imageHeight * scaleW)
    }

    const imageObj = new Image()
    imageObj.onload = function () {
      const screenshot = new Konva.Image({
        id: screenshotImageId,
        image: imageObj,
        width: imageWidth,
        height: imageHeight,
      })
      screenshot.moveToBottom()
      screenshot.x((stage.width() - imageWidth) / 2)
      screenshot.y((stage.height() - imageHeight) / 2)
      layer.add(screenshot)
    }

    imageObj.src = data.url
  }
)

const setActiveShapeBtn = (type: ShapeTypes) => {
  if (activeShapeType == type) {
    return
  }

  activeShapeType = type

  shapeBtns.forEach((btn) => {
    const btnType = btn.dataset.shapeType
    btn.classList.toggle("hover", btnType == type)
  })
}

const showArrowCircles = (arrowId: string) => {
  arrowCircleEnd.moveToTop()
  arrowCircleStart.moveToTop()
  arrowCircleStart.id(`${arrowCircleStart.id()}${arrowIdSeparator}${arrowId}`)
  arrowCircleEnd.id(`${arrowCircleEnd.id()}${arrowIdSeparator}${arrowId}`)
  arrowCircleStart.show()
  arrowCircleEnd.show()
}

const hideArrowCircles = () => {
  arrowCircleStart.id(arrowCircleStartId)
  arrowCircleEnd.id(arrowCircleEndId)
  arrowCircleStart.hide()
  arrowCircleEnd.hide()
}

const moveArrowCircles = (arrow: Arrow) => {
  const [startX, startY, endX, endY] = arrow.attrs.points
  const diff = arrow.position()
  arrowCircleStart.position({ x: startX + diff.x, y: startY + diff.y })
  arrowCircleEnd.position({ x: endX + diff.x, y: endY + diff.y })
}

const flipRectCoordinates = (startPos: Vector2d, endPos: Vector2d) => {
  let startX = startPos.x,
    startY = startPos.y,
    endX = endPos.x,
    endY = endPos.y,
    diff = 0

  if (startX > endX) {
    diff = Math.abs(startX - endX)
    startX = endX
    endX = startX + diff
  }
  if (startY > endY) {
    diff = Math.abs(startY - endY)
    startY = endY
    endY = startY + diff
  }

  return { startX, startY, endX, endY }
}

const moveArrow = (circle: Circle) => {
  const arrowId = circle.id().split(arrowIdSeparator)[1]
  const arrow = stage.findOne(`#${arrowId}`) as Arrow

  if (arrow) {
    const p = [
      arrowCircleStart.x() - arrow.x(),
      arrowCircleStart.y() - arrow.y(),
      arrowCircleEnd.x() - arrow.x(),
      arrowCircleEnd.y() - arrow.y(),
    ]
    arrow.points(p)
  }
}

const focusTextarea = (textShape: Text) => {
  activeTextShape = textShape
  const textareaPosition = {
    x: stage.container().offsetLeft + textShape.absolutePosition().x,
    y: stage.container().offsetTop + textShape.absolutePosition().y,
  }
  textarea.removeAttribute("hidden")
  textarea.style.left = `${textareaPosition.x}px`
  textarea.style.top = `${textareaPosition.y}px`
  textarea.style.width = `${textShape.width()}px`
  textarea.style.height = `${textShape.height()}px`
  textarea.style.fontSize = `${textShape.fontSize()}px`
  textarea.style.fontWeight = `${textShape.fontStyle()}`
  textarea.style.lineHeight = `${textShape.lineHeight()}`
  textarea.style.fontFamily = `${textShape.fontFamily()}`
  textarea.style.maxWidth = `${stage.width() - textareaPosition.x}px`
  textarea.value = textShape.text()

  isTextareaFocused = true

  setTimeout(() => {
    textarea.focus()
  })
}

const createShape = (type: ShapeTypes) => {
  const shapeId = `${type}_${shapes.length}`
  shapes.push(shapeId)

  if (type == "arrow") {
    activeShape = new Konva.Arrow({
      id: shapeId,
      name: type,
      points: [startPos.x, startPos.y],
      stroke: activeColor,
      fill: activeColor,
      strokeWidth: activeShapeWidth,
      draggable: true,
      hitStrokeWidth: 2,
    })

    layer.add(activeShape)
  }

  if (type == "curved_line") {
    activeShape = new CurvedLine({
      id: shapeId,
      name: type,
      points: [startPos.x, startPos.y],
      stroke: activeColor,
      strokeWidth: activeShapeWidth,
      draggable: true,
      hitStrokeWidth: 2,
    }) as CurvedLine

    layer.add(activeShape)
  }

  if (type == "line") {
    activeShape = new Konva.Line({
      id: shapeId,
      name: type,
      points: [startPos.x, startPos.y],
      stroke: activeColor,
      strokeWidth: activeShapeWidth,
      draggable: true,
      hitStrokeWidth: 2,
    })

    layer.add(activeShape)
  }

  if (type == "rect") {
    activeShape = new Konva.Rect({
      id: shapeId,
      name: type,
      x: startPos.x,
      y: startPos.y,
      stroke: activeColor,
      strokeWidth: activeShapeWidth,
      draggable: true,
      hitStrokeWidth: 2,
      strokeScaleEnabled: false,
      scaleX: 1,
      scaleY: 1,
    })

    layer.add(activeShape)
  }

  if (type == "ellipse") {
    activeShape = new Konva.Ellipse({
      id: shapeId,
      name: type,
      draggable: true,
      x: startPos.x,
      y: startPos.y,
      radiusX: 0,
      radiusY: 0,
      scaleX: 1,
      scaleY: 1,
      stroke: activeColor,
      strokeWidth: activeShapeWidth,
      strokeScaleEnabled: false,
    })

    layer.add(activeShape)
  }

  if (type == "text") {
    activeShape = new Konva.Text({
      id: shapeId,
      name: type,
      x: startPos.x,
      y: startPos.y,
      text: "",
      fontSize: getFontSize(activeShapeWidth),
      fontFamily: "Arial",
      fontStyle: "600",
      lineHeight: 1.2,
      fill: activeColor,
      draggable: true,
      strokeWidth: 2,
      stroke: "white",
      fillAfterStrokeEnabled: true,
      shadowColor: "black",
      shadowOffset: { x: 0, y: 1 },
      shadowOpacity: 0.3,
    })

    layer.add(activeShape)
    focusTextarea(activeShape as Text)
  }

  layer.batchDraw()
  isShapeCreated = true
}

stage.on("mouseover", (event) => {
  if (event.target.attrs.draggable) {
    stage.container().style.cursor = "move"
  } else {
    stage.container().style.cursor = "default"
  }
})

stage.on("mousedown", (event) => {
  const id = event.target.attrs.id
  clickedShapeId = [screenshotImageId].includes(id) ? undefined : id
  const clickedShape = stage.findOne(`#${clickedShapeId}`)

  if (event.target.attrs.name?.indexOf("_anchor") >= 0) {
    return
  }

  // Update Active Color and Stroke Width
  if (clickedShape) {
    if (clickedShape instanceof Text) {
      const color = getActiveColorNameByHex(clickedShape.fill() as string)
      const width = getShapeWidthByFontSize(clickedShape.fontSize())
      setActiveShapeWidth(width)
      setActiveColor(color)
    } else {
      setActiveShapeWidth((clickedShape as Arrow).strokeWidth())
      setActiveColor(
        getActiveColorNameByHex((clickedShape as Arrow).stroke() as string)
      )
    }
  }

  // Add Transform Rectangle
  if (clickedShape instanceof Text || clickedShape instanceof CurvedLine) {
    tr.nodes([clickedShape])
    tr.setAttrs(trDefaultConfig)
    tr.moveToTop()
    layer.batchDraw()
  } else if (clickedShape instanceof Ellipse || clickedShape instanceof Rect) {
    tr.nodes([clickedShape])
    tr.setAttrs({ resizeEnabled: true })
    tr.moveToTop()
    layer.batchDraw()
  } else {
    if (tr.nodes().length) {
      tr.nodes([])
      tr.setAttrs(trDefaultConfig)
      layer.batchDraw()
    }
  }

  if ([arrowCircleStart.id(), arrowCircleEnd.id()].includes(clickedShapeId)) {
    return
  } else {
    hideArrowCircles()
  }

  if (shapes.includes(clickedShapeId)) {
    if (
      clickedShape instanceof Arrow ||
      (clickedShape instanceof Line && !(clickedShape instanceof CurvedLine))
    ) {
      const clickableArrow = stage.findOne(`#${clickedShapeId}`)

      if (clickableArrow) {
        moveArrowCircles(clickableArrow as Arrow)
        showArrowCircles(clickedShapeId)

        clickableArrow.on("dragmove", (event) => {
          moveArrowCircles(clickableArrow as Arrow)
        })
      }
    }
  } else {
    startPos = stage.getPointerPosition()!

    if (mouseMoveTypes.includes(activeShapeType)) {
      isMouseDown = true
    } else {
      createShape(activeShapeType)
    }
  }
})

stage.on("mousemove", (event) => {
  if (isMouseDown) {
    if (!isShapeCreated) {
      createShape(activeShapeType)
    }

    if (activeShape instanceof CurvedLine) {
      const pos = stage.getPointerPosition()!
      const newPoints = activeShape.points().concat([pos.x, pos.y])
      activeShape.points(newPoints)

      layer.batchDraw()
    }

    if (
      activeShape instanceof Arrow ||
      (activeShape instanceof Line && !(activeShape instanceof CurvedLine))
    ) {
      const pos = stage.getPointerPosition()!

      if (pos.x == startPos.x && pos.y == startPos.y) {
        return
      }

      const points = [
        activeShape.points()[0],
        activeShape.points()[1],
        pos.x,
        pos.y,
      ] as number[]
      activeShape.points(points)
      layer.batchDraw()
    }

    if (activeShape instanceof Ellipse) {
      const pos = stage.getPointerPosition()!

      if (pos.x == startPos.x && pos.y == startPos.y) {
        return
      }

      const posRect = flipRectCoordinates(startPos, pos)

      activeShape.x(posRect.startX)
      activeShape.y(posRect.startY)
      activeShape.radiusX(posRect.endX - posRect.startX)
      activeShape.radiusY(posRect.endY - posRect.startY)
      layer.batchDraw()
    }

    if (activeShape instanceof Rect) {
      const pos = stage.getPointerPosition()!

      if (pos.x == startPos.x && pos.y == startPos.y) {
        return
      }

      const posRect = flipRectCoordinates(startPos, pos)

      activeShape.x(posRect.startX)
      activeShape.y(posRect.startY)
      activeShape.width(posRect.endX - posRect.startX)
      activeShape.height(posRect.endY - posRect.startY)
      layer.batchDraw()
    }
  }
})

stage.on("mouseup", () => {
  activeShape = undefined
  isMouseDown = false
  isShapeCreated = false
})

stage.on("dblclick", (event) => {
  const dblclickedShapeId = event.target.attrs.id
  const dblclickedShape = stage.findOne(`#${dblclickedShapeId}`)

  if (dblclickedShape instanceof Text) {
    focusTextarea(dblclickedShape as Text)
  }
})

const clickOnShapeBtn = (type: ShapeTypes) => {
  if (isTextareaFocused) {
    return
  }

  const textBtn = document.querySelector(
    `[data-shape-type="${type}"]`
  ) as HTMLButtonElement
  if (textBtn) {
    textBtn.click()
  }
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key == "Delete" || e.key == "Backspace") {
    if (shapes.includes(clickedShapeId)) {
      const shape = stage.findOne(`#${clickedShapeId}`)

      if (shape && !isTextareaFocused) {
        shape.destroy()
        shapes = shapes.filter((s) => s != clickedShapeId)
        stage.container().style.cursor = "default"

        if (
          shape instanceof Arrow ||
          (shape instanceof Line && !(shape instanceof CurvedLine))
        ) {
          hideArrowCircles()
        }

        if (tr.nodes().length) {
          tr.nodes([])
        }
      }
    }
  }

  if (e.keyCode == 67 && (e.metaKey || e.ctrlKey)) {
    window.electronAPI.ipcRenderer.send("screenshot:copy", copyTrimStage())
  }

  switch (e.keyCode) {
    case 84:
      clickOnShapeBtn("text")
      break
    case 65:
      clickOnShapeBtn("arrow")
      break
    case 76:
      clickOnShapeBtn("line")
      break
    case 79:
      clickOnShapeBtn("ellipse")
      break
    case 82:
      clickOnShapeBtn("rect")
      break
    case 80:
      clickOnShapeBtn("curved_line")
      break
  }
})

textarea.addEventListener(
  "blur",
  () => {
    textarea.setAttribute("hidden", "")
    isTextareaFocused = false
  },
  false
)

textarea.addEventListener(
  "input",
  () => {
    if (activeTextShape) {
      activeTextShape.text(textarea.value)
      textarea.style.width = `${activeTextShape.width()}px`
      textarea.style.height = `${activeTextShape.height()}px`
    }
  },
  false
)
activeWidthSlider.addEventListener(
  "input",
  (event) => {
    const width = Number(activeWidthSlider.value)

    if (!width) {
      return
    }

    setActiveShapeWidth(width)

    if (clickedShapeId) {
      const activeShape = stage.findOne(`#${clickedShapeId}`)
      if (activeShape) {
        if (activeShape instanceof Text) {
          activeShape.fontSize(getFontSize(activeShapeWidth))
        } else {
          ;(activeShape as Arrow).strokeWidth(activeShapeWidth)
        }
      }
    }
  },
  false
)

const copyTrimStage = (): string => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  const imageWidth = Math.ceil(lastData!.width / lastData!.scale)
  const scale = imageWidth / stage.width() < 1 ? 1 : imageWidth / stage.width()

  stage.children.forEach((layer) => {
    layer.children.forEach((node) => {
      if (node.isVisible()) {
        const rect = node.getClientRect()
        if (rect.height && rect.width) {
          minX = Math.min(minX, rect.x)
          minY = Math.min(minY, rect.y)
          maxX = Math.max(maxX, rect.x + rect.width)
          maxY = Math.max(maxY, rect.y + rect.height)
        }
      }
    })
  })

  const width = maxX - minX
  const height = maxY - minY

  const tempStage = new Konva.Stage({
    container: document.createElement("div"),
    width: scale * width,
    height: scale * height,
  })

  const tempLayer = new Konva.Layer()
  tempStage.add(tempLayer)

  stage.children.forEach((layer) => {
    layer.children.forEach((node) => {
      if (node.isVisible()) {
        const clone = node.clone()
        clone.x(scale * (clone.x() - minX))
        clone.y(scale * (clone.y() - minY))
        clone.scale({ x: scale, y: scale })
        tempLayer.add(clone)
      }
    })
  })

  tempLayer.batchDraw()

  const dataURL = tempStage.toDataURL({
    pixelRatio: lastData ? lastData.scale : window.devicePixelRatio,
  })

  tempStage.destroy()

  return dataURL
}

copyBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send("screenshot:copy", copyTrimStage())
  },
  false
)
saveBtn.addEventListener(
  "click",
  () => {
    const dataURL = copyTrimStage()
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
    const dataURL = copyTrimStage()
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

activeColorBtns.forEach((btn) => {
  btn.addEventListener(
    "click",
    (event) => {
      const activeBtn = event.target as HTMLButtonElement
      const colorName = activeBtn.dataset.color
      setActiveColor(colorName!)
      colorPopover.toggleAttribute("hidden")

      if (clickedShapeId) {
        const activeShape = stage.findOne(`#${clickedShapeId}`)
        if (activeShape) {
          if (activeShape instanceof Text) {
            activeShape.fill(activeColor)
          } else {
            ;(activeShape as Arrow).stroke(activeColor)
          }
        }
      }
    },
    false
  )
})

activeColorBtn.addEventListener(
  "click",
  (event) => {
    colorPopover.toggleAttribute("hidden")
  },
  false
)

shapeBtns.forEach((btn) => {
  btn.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLButtonElement
      const type = target.dataset.shapeType as ShapeTypes
      setActiveShapeBtn(type)
    },
    false
  )
})

window.addEventListener(
  "resize",
  () => {
    stage.width(pageContainer.clientWidth)
    stage.height(pageContainer.clientHeight)
    let diffX = 0
    let diffY = 0
    let scale = 1

    const image = stage.findOne(`#${screenshotImageId}`) as Konva.Image
    if (image) {
      const originalWidth = Math.ceil(lastData!.width / lastData!.scale)
      const originalHeight = Math.ceil(lastData!.height / lastData!.scale)
      const imageRatio = originalWidth / originalHeight
      const stageWidth = stage.width()
      const stageHeight = stage.height()
      const stageRatio = stageWidth / stageHeight

      let imageWidth = image.width()
      let imageHeight = image.height()

      if (
        imageHeight >= stageHeight ||
        (originalHeight > stageHeight && imageHeight < stageHeight) ||
        imageWidth >= stageWidth ||
        (originalWidth > stageWidth && imageWidth < stageWidth)
      ) {
        if (imageRatio > stageRatio) {
          // Image is wider
          imageWidth = stageWidth
          imageHeight = stageWidth / imageRatio
        } else {
          // Image is taller
          imageWidth = stageHeight * imageRatio
          imageHeight = stageHeight
        }
      }

      scale = imageWidth / stage.width()

      image.width(imageWidth)
      image.height(imageHeight)

      const prevX = image.x()
      const prevY = image.y()
      image.x((stageWidth - imageWidth) / 2)
      image.y((stageHeight - imageHeight) / 2)

      diffX = image.x() - prevX
      diffY = image.y() - prevY

      // stage.children.forEach((layer) => {
      //   layer.children.forEach((node) => {
      //     if (node.isVisible() && node.attrs.id != screenshotImageId) {
      //       const rect = node.getClientRect()
      //       if (rect.height && rect.width) {
      //         node.x(scale * rect.x + diffX)
      //         node.y(scale * rect.y + diffY)
      //         // node.width( scaleX * node.width())
      //         // node.height( scaleY * node.height())
      //         node.scale({ x: scale, y: scale })
      //       }
      //     }
      //   })
      // })
    }
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
