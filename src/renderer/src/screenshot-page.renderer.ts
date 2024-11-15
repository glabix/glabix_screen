import "@renderer/styles/screenshot-page.scss"
import { LoggerEvents } from "@shared/events/logger.events"
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

type ShapeTypes = "arrow" | "text" | "line" | "ellipse" | "rect"
const arrowIdSeparator = ":"
const arrowCircleStartId = "arrow_start_id"
const arrowCircleEndId = "arrow_end_id"

const img = document.querySelector(".js-screenshot") as HTMLImageElement
const pageContainer = document.querySelector(
  "#page_container"
)! as HTMLDivElement
const copyBtn = document.querySelector(".js-copy-image")! as HTMLButtonElement
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
const tr = new Konva.Transformer(trDefaultConfig)
layer.add(tr)

// Init Arrows Transform Circles
const transformCircleConfig: CircleConfig = {
  x: 0,
  y: 0,
  radius: 5,
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

const init = () => {
  arrowCircleStart.destroy()
  arrowCircleEnd.destroy()

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
    // img.src = data.url
    // img.width = Math.ceil(data.width / data.scale)
    layer.destroyChildren()
    init()
    lastData = data

    const imageRation = data.height / data.width

    window.electronAPI?.ipcRenderer?.send(LoggerEvents.SEND_LOG, {
      title: `======pageContainer===== data.height: ${data.height} data.width: ${data.width}`,
      body: JSON.stringify({ imageRation }),
    })

    const imageObj = new Image()
    imageObj.onload = function () {
      const screenshot = new Konva.Image({
        image: imageObj,
        width: pageContainer.clientWidth,
        height: pageContainer.clientWidth * imageRation,
      })
      layer.add(screenshot)
      screenshot.moveToBottom()
    }

    imageObj.src = data.url
  }
)

let shapes: any[] = []
let clickedShapeId = ""
let activeShape: Arrow | Text | Line | Ellipse | Rect | undefined = undefined
let activeTextShape: Text | undefined = undefined
let activeColor = "#ff24bd"
let isMouseDown = false
let isShapeCreated = false
let activeShapeType: ShapeTypes = "arrow"
let startPos: Vector2d = { x: 0, y: 0 }
const mouseMoveTypes: ShapeTypes[] = ["arrow", "line", "ellipse", "rect"]

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
      points: [startPos.x, startPos.y],
      stroke: activeColor,
      strokeWidth: 4,
      fill: activeColor,
      draggable: true,
      hitStrokeWidth: 2,
    })

    layer.add(activeShape)
  }

  if (type == "line") {
    activeShape = new Konva.Line({
      id: shapeId,
      points: [startPos.x, startPos.y],
      stroke: activeColor,
      strokeWidth: 4,
      fill: activeColor,
      draggable: true,
      hitStrokeWidth: 2,
    })

    layer.add(activeShape)
  }

  if (type == "rect") {
    activeShape = new Konva.Rect({
      id: shapeId,
      x: startPos.x,
      y: startPos.y,
      stroke: activeColor,
      strokeWidth: 4,
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
      draggable: true,
      x: startPos.x,
      y: startPos.y,
      radiusX: 0,
      radiusY: 0,
      scaleX: 1,
      scaleY: 1,
      stroke: activeColor,
      strokeWidth: 4,
      strokeScaleEnabled: false,
    })

    layer.add(activeShape)
  }

  if (type == "text") {
    activeShape = new Konva.Text({
      id: shapeId,
      x: startPos.x,
      y: startPos.y,
      text: "",
      fontSize: 30,
      fontFamily: "Arial",
      fontStyle: "700",
      lineHeight: 1.2,
      fill: activeColor,
      draggable: true,
      strokeWidth: 0.75,
      stroke: "white",
      shadowColor: "white",
      shadowBlur: 2,
      shadowOffset: { x: -1, y: -1 },
      shadowOpacity: 0.5,
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
  clickedShapeId = event.target.attrs.id
  const clickedShape = stage.findOne(`#${clickedShapeId}`)
  // console.log('event', event)
  // console.log('clickedShape', clickedShape)

  // console.log('event.target.attrs.name', event.target.attrs.name?.indexOf('_anchor'))
  if (event.target.attrs.name?.indexOf("_anchor") >= 0) {
    return
  }

  if (clickedShape instanceof Text) {
    tr.nodes([clickedShape])
    tr.setAttrs(trDefaultConfig)
    layer.batchDraw()
  } else if (clickedShape instanceof Ellipse || clickedShape instanceof Rect) {
    tr.nodes([clickedShape])
    tr.moveToTop()
    tr.setAttrs({ resizeEnabled: true })
    layer.batchDraw()
  } else {
    tr.nodes([])
    tr.setAttrs(trDefaultConfig)
    layer.batchDraw()
  }

  if ([arrowCircleStart.id(), arrowCircleEnd.id()].includes(clickedShapeId)) {
    return
  } else {
    hideArrowCircles()
  }

  if (shapes.includes(clickedShapeId)) {
    if (clickedShapeId.includes("arrow") || clickedShapeId.includes("line")) {
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

    if (activeShape instanceof Arrow || activeShape instanceof Line) {
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

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key == "Delete" || e.key == "Backspace") {
    if (shapes.includes(clickedShapeId)) {
      const shape = stage.findOne(`#${clickedShapeId}`)

      if (shape) {
        shape.destroy()
        shapes = shapes.filter((s) => s != clickedShapeId)
        stage.container().style.cursor = "default"

        if (shape instanceof Arrow || shape instanceof Line) {
          hideArrowCircles()
        }

        if (tr.nodes().length) {
          tr.nodes([])
        }
      }
    }
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

copyBtn.addEventListener(
  "click",
  () => {
    window.electronAPI.ipcRenderer.send(
      "screenshot:copy",
      stage
        .toDataURL
        // {pixelRatio: lastData ? lastData.scale : window.devicePixelRatio}
        ()
    )
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
      // window.electronAPI.ipcRenderer.send('screenshot:copy', stage.toDataURL(
      // {pixelRatio: lastData ? lastData.scale : window.devicePixelRatio}
      // ))
    },
    false
  )
})
