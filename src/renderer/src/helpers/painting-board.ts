import { debounce } from "@shared/helpers/debounce"
import { IScreenshotImageData } from "@shared/types/types"
import { Rectangle } from "electron"
import Konva from "konva"
import { Group } from "konva/lib/Group"
import {
  KonvaEventListener,
  KonvaEventObject,
  Node,
  NodeConfig,
} from "konva/lib/Node"
import { Shape, ShapeConfig } from "konva/lib/Shape"
import { Arrow } from "konva/lib/shapes/Arrow"
import { Circle, CircleConfig } from "konva/lib/shapes/Circle"
import { Ellipse } from "konva/lib/shapes/Ellipse"
import { Line } from "konva/lib/shapes/Line"
import { Rect } from "konva/lib/shapes/Rect"
import { Text } from "konva/lib/shapes/Text"
import { TransformerConfig } from "konva/lib/shapes/Transformer"
import { Stage } from "konva/lib/Stage"
import { Vector2d } from "konva/lib/types"
import { Transform } from "konva/lib/Util"

type ShapeTypes =
  | "arrow"
  | "text"
  | "line"
  | "ellipse"
  | "rect"
  | "curved_line"
  | "pointer"
  | "image"
class CurvedLine extends Konva.Line {}
const isWindows = navigator.userAgent.indexOf("Windows") != -1
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

const BACKGROUND_MAP = [
  { name: "accent-0-light", hex: "#F9F9F9" },
  { name: "accent-0-dark", hex: "#1A1A1A" },
  { name: "accent-1-light", hex: "#DDE3E6" },
  { name: "accent-1-dark", hex: "#303A3E" },
  { name: "accent-2-light", hex: "#E1C3D3" },
  { name: "accent-2-dark", hex: "#4B1F53" },
  { name: "accent-3-light", hex: "#FFC5D0" },
  { name: "accent-3-dark", hex: "#66091B" },
  { name: "accent-4-light", hex: "#FFE2BF" },
  { name: "accent-4-dark", hex: "#663700" },
  { name: "accent-5-light", hex: "#D2EBD3" },
  { name: "accent-5-dark", hex: "#1E4620" },
  { name: "accent-6-light", hex: "#C0E9FC" },
  { name: "accent-6-dark", hex: "#014462" },
]

const TOOLTIP_TEXT = {
  "arrow:hotkey": "&nbsp;A&nbsp;",
  "text:hotkey": "&nbsp;T&nbsp;",
  "line:hotkey": "&nbsp;L&nbsp;",
  "ellipse:hotkey": "&nbsp;E&nbsp;",
  "rect:hotkey": "&nbsp;R&nbsp;",
  "curved_line:hotkey": "&nbsp;P&nbsp;",
  "pointer:hotkey": "&nbsp;V&nbsp;",
  "history_undo:hotkey": isWindows ? "Ctrl+Z" : "Cmd+Z",
  "history_redo:hotkey": isWindows ? "Ctrl+Shift+Z" : "Cmd+Shift+Z",
}

const SHAPE_WIDTH_DEFAULT = 4
const COLOR_NAME_DEFAULT = "accent-6"

export enum PaintingBoardEvents {
  UPDATE_SHAPE_COLOR = "update_shape_color",
  UPDATE_SHAPE_WIDTH = "update_shape_width",
  UPDATE_BOARD_BG = "update_board_bg",
}

export interface IPaintingBoardElements {
  activeBgBtn?: HTMLButtonElement
  activeBgBtns?: NodeListOf<HTMLButtonElement>
  activeColorBtn?: HTMLButtonElement
  bgPopover?: HTMLDivElement
  activeColorBtns?: NodeListOf<HTMLButtonElement>
  colorPopover?: HTMLDivElement
  historyBtns?: NodeListOf<HTMLButtonElement>
  activeWidthSlider?: HTMLInputElement
  pageContainer?: HTMLDivElement
  textarea?: HTMLTextAreaElement
  shapeBtns?: NodeListOf<HTMLButtonElement>
  tooltipText?: NodeListOf<HTMLElement>
}

const defaultElems: IPaintingBoardElements = {
  activeColorBtn: document.querySelector(
    ".js-toggle-color"
  ) as HTMLButtonElement,
  activeColorBtns: document.querySelectorAll(
    "[data-color]"
  )! as NodeListOf<HTMLButtonElement>,
  historyBtns: document.querySelectorAll(
    "[data-history]"
  )! as NodeListOf<HTMLButtonElement>,
  colorPopover: document.querySelector(
    ".js-active-color-popover"
  )! as HTMLDivElement,
  activeWidthSlider: document.querySelector(
    ".js-slider-width"
  ) as HTMLInputElement,
  pageContainer: document.querySelector("#page_container")! as HTMLDivElement,
  textarea: document.querySelector("#textarea_ghost")! as HTMLTextAreaElement,
  shapeBtns: document.querySelectorAll(
    "[data-shape-type]"
  )! as NodeListOf<HTMLButtonElement>,
  tooltipText: document.querySelectorAll(
    "[data-text]"
  )! as NodeListOf<HTMLElement>,
}

export class PaintingBoard extends EventTarget {
  emit(eventName: PaintingBoardEvents, data: any) {
    this.dispatchEvent(new CustomEvent(eventName, { detail: data }))
  }
  on(eventName: PaintingBoardEvents, callback: (event: CustomEvent) => void) {
    this.addEventListener(eventName, callback as EventListener)
  }

  private isShape(
    shape: Node<NodeConfig> | undefined,
    type: ShapeTypes
  ): boolean {
    if (!shape) {
      return false
    }

    return shape.attrs.name == type
  }

  constructor(_elems: IPaintingBoardElements) {
    super()

    this.inputWidthSliderDebounce = debounce(() => {
      this.historySave()
    }, 200)

    this.elems = { ...defaultElems, ..._elems }
    this.bindEvents()
    this.initStage()
    this.bindStageEvents()

    this.elems.tooltipText?.forEach((el) => {
      const text = el.dataset.text
      if (text) {
        if (TOOLTIP_TEXT[text]) {
          el.removeAttribute("hidden")
          el.innerHTML = TOOLTIP_TEXT[text]
        } else {
          el.setAttribute("hidden", "")
        }
      }
    })
  }

  private elems: IPaintingBoardElements = {}
  private isTextareaFocused = false
  private inputWidthSliderDebounce: Function

  private bgId = "background"
  private screenshotImageId = "screenshot_image"
  private arrowIdSeparator = ":"
  private arrowCircleStartId = "arrow_start_id"
  private arrowCircleEndId = "arrow_end_id"

  private shapes: any[] = []
  private clickedShapeId = ""
  private copiedShapes: (Group | Shape<ShapeConfig> | Node<NodeConfig>)[] = []
  private selectedShapes: (Group | Shape<ShapeConfig> | Node<NodeConfig>)[] = []
  private activeShape:
    | Arrow
    | Text
    | Line
    | CurvedLine
    | Ellipse
    | Rect
    | undefined = undefined
  private activeTextShape: Text | undefined = undefined

  private activeColor = COLOR_NAME_DEFAULT
  private activeShapeWidth = SHAPE_WIDTH_DEFAULT
  private fontSizeFactor = 6

  private isMouseDown = false
  private isShiftPress = false
  private isShapeCreated = false

  private activeShapeType: ShapeTypes = "arrow"
  private startPos: Vector2d = { x: 0, y: 0 }
  private mouseMoveTypes: ShapeTypes[] = [
    "arrow",
    "line",
    "ellipse",
    "rect",
    "curved_line",
    "pointer",
  ]
  private lastData: IScreenshotImageData | undefined = undefined

  // private emptyHistoryElementId = "empty_element"
  // Global Transformer
  private trId = "transformer"
  private trDefaultConfig: TransformerConfig = {
    id: this.trId,
    name: this.trId,
    resizeEnabled: false,
    rotateEnabled: false,
    padding: 1,
    ignoreStroke: true,
    anchorSize: 10,
    anchorCornerRadius: 10,
    anchorFill: "#f0f0f0",
    anchorStroke: "#f0f0f0",
    borderStroke: "#bbb",
    shouldOverdrawWholeArea: true, // add "back" element to transformer
    anchorStyleFunc: (anchor) => {
      anchor.setAttrs({
        shadowColor: "black",
        shadowBlur: 5,
        shadowOffset: { x: 0, y: 3 },
        shadowOpacity: 0.6,
      })
    },
    ignoreHistory: true,
  }

  // Init Arrows Transform Circles
  private transformCircleConfig: CircleConfig = {
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
    hitStrokeWidth: 20,
    visible: false,
    ignoreHistory: true,
  }

  private stage: Konva.Stage
  private layer: Konva.Layer
  private tr: Konva.Transformer
  private arrowCircleStart: Konva.Circle
  private arrowCircleEnd: Konva.Circle

  private history = new Map<number, any[]>()
  private currentHistoryIndex = 0

  private initStage() {
    this.stage = new Konva.Stage({
      container: this.elems.pageContainer,
      width: this.elems.pageContainer!.clientWidth,
      height: this.elems.pageContainer!.clientHeight,
    })

    this.layer = new Konva.Layer()
    this.stage.add(this.layer)
    this.tr = new Konva.Transformer(this.trDefaultConfig)

    this.arrowCircleStart = new Konva.Circle({
      id: this.arrowCircleStartId,
      ...this.transformCircleConfig,
    })

    this.arrowCircleEnd = new Konva.Circle({
      id: this.arrowCircleEndId,
      ...this.transformCircleConfig,
    })

    this.initTransform()
  }

  // History
  private getHistoryNodes(): (Group | Shape<ShapeConfig>)[] {
    return this.layer.children
      .filter((i) => !i.getAttr("ignoreHistory"))
      .filter((i) => !(i.attrs.name == "text" && !i.attrs.text))
  }

  private historyClear(): void {
    this.history.clear()
    this.currentHistoryIndex = this.history.size
  }

  private historyClearNodes(): void {
    this.getHistoryNodes().forEach((i) => i.destroy())
  }

  private historyInit(): void {
    this.historyClear()
    const emptyElement = new Konva.Circle({
      listening: false,
      ignoreSelection: true,
    })
    this.layer.add(emptyElement)
    this.historySave()
  }

  private historyCheck(): void {
    const all = this.getHistoryNodes()

    if (!all.length) {
      this.historyInit()
    }
  }
  private historySave(): void {
    const state = this.getHistoryNodes().map((i) => i.toObject())

    // console.log('historySave state:', state, this.currentHistoryIndex, this.history.size)

    // Replace Old History
    if (this.currentHistoryIndex < this.history.size) {
      const entries = [...this.history.entries()].slice(
        0,
        this.currentHistoryIndex
      )
      this.history.clear()
      entries.forEach((entry) => this.history.set(entry[0], entry[1]))
    }

    this.history.set(this.currentHistoryIndex, state)
    this.currentHistoryIndex = this.history.size
  }

  private historyUndo(step = 1): void {
    const index = this.currentHistoryIndex - step
    this.currentHistoryIndex = index < 0 ? 0 : index
    this.historyApply(this.currentHistoryIndex - 1)
  }

  private historyRedo(step = 1): void {
    const index = this.currentHistoryIndex + step
    this.currentHistoryIndex =
      index >= this.history.size ? this.history.size : index
    this.historyApply(this.currentHistoryIndex - 1)
  }

  private historyApply(index: number): void {
    const historyState = this.history.get(index)
    // console.log('historyApply state:', historyState, index)
    if (historyState) {
      this.hideArrowCircles()

      if (this.tr.nodes().length) {
        this.selectedShapes.length = 0
        this.tr.nodes([])
      }

      this.getHistoryNodes().forEach((node) => {
        node.destroy()
      })

      historyState.forEach((node) => {
        const shape = Konva.Node.create(node) as Group | Shape<ShapeConfig>
        if (shape.attrs.name == "image") {
          const url = shape.attrs.imageUrl
          this.loadImages([url], shape.position())
        } else {
          this.layer.add(shape)
        }
      })

      this.toggleSelectionMode()

      this.layer.batchDraw()
    }
  }

  private getActiveColorByName(colorName: string): string {
    return COLORS_MAP.find((c) => c.name == colorName)!.hex
  }
  private getActiveColorNameByHex(hex: string): string {
    return COLORS_MAP.find((c) => c.hex == hex)!.name
  }
  private getActiveBgByName(colorName: string): string {
    return BACKGROUND_MAP.find((c) => c.name == colorName)!.hex
  }
  private getActiveBgNameByHex(hex: string): string {
    return BACKGROUND_MAP.find((c) => c.hex == hex)!.name
  }

  private getFontSize(strokeWidth: number): number {
    const width = strokeWidth < 2 ? 2 : strokeWidth
    return this.fontSizeFactor * width
  }
  private getShapeWidthByFontSize(fontSize: number): number {
    return Math.ceil(fontSize / this.fontSizeFactor)
  }

  setBgColor(colorName: string): void {
    const bg = this.getActiveBgByName(colorName) || BACKGROUND_MAP[0]!.hex
    const bgShape = this.stage.findOne(`#${this.bgId}`)

    if (bgShape instanceof Rect) {
      bgShape.fill(this.getActiveBgByName(colorName!))
    }

    this.elems.activeBgBtns?.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.bg?.includes(colorName))
    })

    this.elems.activeBgBtn!.querySelector("span")!.style.background = bg

    this.emit(PaintingBoardEvents.UPDATE_BOARD_BG, colorName)
  }

  setActiveColor(colorName: string): void {
    this.activeColor = this.getActiveColorByName(colorName)

    this.elems.activeColorBtns!.forEach((btn) => {
      btn.classList.toggle("scale-140", btn.dataset.color?.includes(colorName))
    })
    this.elems.activeColorBtn!.querySelector("span")!.style.background =
      this.activeColor

    this.emit(PaintingBoardEvents.UPDATE_SHAPE_COLOR, colorName)
  }

  setActiveShapeWidth(width: number): void {
    this.activeShapeWidth = width
    this.elems.activeWidthSlider!.value = String(this.activeShapeWidth)
    this.emit(PaintingBoardEvents.UPDATE_SHAPE_WIDTH, width)
  }

  private selectAllNodes(): void {
    const allNodes = this.getHistoryNodes().filter(
      (n) => !n.getAttr("ignoreSelection")
    )
    this.selectedShapes = allNodes
  }

  private updateTransform(): void {
    const hasLineOrArrow = this.selectedShapes.some((node) =>
      ["line", "arrow"].includes(node.attrs.name)
    )
    const hasResizebleShape = this.selectedShapes.some((node) =>
      ["ellipse", "rect", "image"].includes(node.attrs.name)
    )
    const hasText = this.selectedShapes.some((node) =>
      ["text"].includes(node.attrs.name)
    )
    const attrs = {
      ...this.trDefaultConfig,
      shouldOverdrawWholeArea:
        Boolean(this.selectedShapes.length == 1) && hasText ? false : true,
      resizeEnabled:
        Boolean(this.selectedShapes.length == 1) && hasResizebleShape,
    }

    this.tr.nodes(this.selectedShapes)
    this.tr.setAttrs(attrs)
    this.tr.moveToTop()

    if (this.selectedShapes.length > 1) {
      this.hideArrowCircles()
    }

    if (this.selectedShapes.length == 1 && hasLineOrArrow) {
      const shape = this.selectedShapes[0] as Arrow
      this.moveArrowCircles(shape)
      this.showArrowCircles(shape.attrs.id)

      shape.off("dragmove")
      shape.on("dragmove", (event) => {
        this.moveArrowCircles(shape)
      })

      shape.off("dragend")
      shape.on("dragend", (event) => {
        this.historySave()
      })
    } else {
      this.hideArrowCircles()
      this.tr.off("dragend")
      this.tr.on("dragend", () => {
        this.historySave()
      })

      this.tr.off("transformend")
      this.tr.on("transformend", () => {
        this.historySave()
      })
    }

    this.layer.batchDraw()
  }

  private clearTransform(): void {
    this.tr.nodes([])
    this.selectedShapes.length = 0
    this.hideArrowCircles()
    this.stage.container().style.cursor = "default"

    this.layer.batchDraw()
  }

  private initTransform(): void {
    this.arrowCircleStart.destroy()
    this.arrowCircleEnd.destroy()

    this.tr = new Konva.Transformer(this.trDefaultConfig)
    this.layer.add(this.tr)

    this.arrowCircleStart = new Konva.Circle({
      id: this.arrowCircleStartId,
      ...this.transformCircleConfig,
    })

    this.arrowCircleEnd = new Konva.Circle({
      id: this.arrowCircleEndId,
      ...this.transformCircleConfig,
    })

    this.layer.add(this.arrowCircleStart)
    this.layer.add(this.arrowCircleEnd)
    this.layer.batchDraw()

    this.arrowCircleStart.on("dragmove", () => {
      this.moveArrow(this.arrowCircleStart)
    })
    this.arrowCircleStart.on("dragend", () => {
      this.historySave()
    })

    this.arrowCircleEnd.on("dragmove", () => {
      this.moveArrow(this.arrowCircleEnd)
    })

    this.arrowCircleEnd.on("dragend", () => {
      this.historySave()
    })

    this.historyInit()
  }

  copyTrimStage(): string {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    const imageWidth = Math.ceil(this.lastData!.width / this.lastData!.scale)
    const scale =
      imageWidth / this.stage.width() < 1 ? 1 : imageWidth / this.stage.width()

    this.stage.children.forEach((layer) => {
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

    this.stage.children.forEach((layer) => {
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
      pixelRatio: this.lastData ? this.lastData.scale : window.devicePixelRatio,
    })

    tempStage.destroy()

    return dataURL
  }

  copyStage(): string {
    return this.stage.toDataURL()
  }

  private clickOnShapeBtn(type: ShapeTypes): void {
    if (this.isTextareaFocused) {
      return
    }

    const textBtn = document.querySelector(
      `[data-shape-type="${type}"]`
    ) as HTMLButtonElement
    if (textBtn) {
      textBtn.click()
    }
  }

  private handleWindowKeyup(e: KeyboardEvent): void {
    this.isShiftPress = false
  }

  private handleDocumentPaste(e: ClipboardEvent): void {
    let images: DataTransferItem[] = []

    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i]
        if (item?.type.includes("image")) {
          images.push(item)
        }
      }
    }

    Promise.all(
      this.pasteImages(images, this.stage.getPointerPosition()!)
    ).then((value) => {
      this.historySave()
      this.clickOnShapeBtn("pointer")

      if (value.length == 1) {
        const image = value[0]!
        this.selectedShapes = [image]
        this.updateTransform()
      }
    })
  }

  private handleWindowKeydown(e: KeyboardEvent): void {
    this.isShiftPress = e.shiftKey
    const isCtrlPress = e.metaKey || e.ctrlKey

    if (e.key == "Delete" || e.key == "Backspace") {
      if (this.selectedShapes.length && !this.isTextareaFocused) {
        this.selectedShapes.forEach((node) => {
          node.destroy()
          this.shapes = this.shapes.filter((s) => s != node.attrs.id)
        })

        this.historySave()

        this.clearTransform()
        this.historyCheck()
      }
    }

    // 90 - Z
    if (e.keyCode == 90 && isCtrlPress) {
      if (e.shiftKey) {
        this.historyRedo()
      } else {
        this.historyUndo()
      }
    }

    // 67 - C
    if (e.keyCode == 67 && isCtrlPress) {
      this.copiedShapes = this.selectedShapes.map((s) => s.clone())
    }
    // 86 - V
    if (e.keyCode == 86 && isCtrlPress) {
      this.copiedShapes.forEach((shape) => {
        shape.x(shape.x() + 10)
        shape.y(shape.y() + 10)
        shape.id(shape.id() + "_copy")
        this.layer.add(shape as Shape)
      })

      this.historySave()
      this.layer.batchDraw()
      this.copiedShapes = this.copiedShapes.map((s) => s.clone())
    }

    // 65 - A
    if (e.keyCode == 65 && isCtrlPress) {
      if (this.activeShapeType == "pointer") {
        this.selectAllNodes()
        this.updateTransform()
      }
    }

    if (!isCtrlPress) {
      switch (e.keyCode) {
        case 86: // 86 - V
          this.clickOnShapeBtn("pointer")
          break
        case 84: // 84 - T
          this.clickOnShapeBtn("text")
          break
        case 65: // 65 - A
          this.clickOnShapeBtn("arrow")
          break
        case 76: // 76 - L
          this.clickOnShapeBtn("line")
          break
        case 79: // 79 - E
          this.clickOnShapeBtn("ellipse")
          break
        case 82: // 82 - R
          this.clickOnShapeBtn("rect")
          break
        case 80: // 80 - P
          this.clickOnShapeBtn("curved_line")
          break
      }
    }
  }

  private handleTextareaBlur(e: Event): void {
    this.elems.textarea!.setAttribute("hidden", "")
    this.isTextareaFocused = false
    this.historySave()

    const textShapes = this.getHistoryNodes()
      .filter((n) => n instanceof Text)
      .filter((n) => n.attrs.text == "")
    textShapes.forEach((t) => t.destroy)
  }

  private handleTextareaInput(e: Event): void {
    if (this.activeTextShape) {
      this.activeTextShape.text(this.elems.textarea!.value)
      this.elems.textarea!.style.width = `${this.activeTextShape.width()}px`
      this.elems.textarea!.style.height = `${this.activeTextShape.height()}px`
    }
  }

  private handleWidthSliderInput(e: Event): void {
    const width = Number(this.elems.activeWidthSlider!.value)
    if (!width) {
      return
    }

    this.setActiveShapeWidth(width)

    this.selectedShapes.forEach((shape) => {
      if (shape instanceof Text) {
        shape.fontSize(this.getFontSize(this.activeShapeWidth))
      } else {
        ;(shape as Arrow).strokeWidth(this.activeShapeWidth)
      }
    })

    this.inputWidthSliderDebounce()
  }

  private handleHistoryClick(e: Event): void {
    const activeBtn = e.target as HTMLButtonElement
    const actionName = activeBtn.dataset.history

    if (actionName == "undo") {
      this.historyUndo()
    }

    if (actionName == "redo") {
      this.historyRedo()
    }

    if (actionName == "clear") {
      this.historyClearNodes()
      this.clearTransform()
      this.historySave()
    }
  }

  private handleActiveBgBtnClick(e: Event): void {
    const activeBtn = e.target as HTMLButtonElement
    const colorName = activeBtn.dataset.bg

    this.elems.bgPopover?.toggleAttribute("hidden")
    this.setBgColor(colorName!)
  }
  private handleActiveColorBtnClick(e: Event): void {
    const activeBtn = e.target as HTMLButtonElement
    const colorName = activeBtn.dataset.color
    this.setActiveColor(colorName!)
    this.elems.colorPopover!.toggleAttribute("hidden")

    this.selectedShapes.forEach((shape) => {
      if (shape instanceof Text) {
        shape.fill(this.activeColor)
      } else {
        ;(shape as Arrow)?.fill(this.activeColor)
        ;(shape as Arrow).stroke(this.activeColor)
      }
    })

    this.historySave()
  }

  private handleShapeBtnClick(e: Event): void {
    const target = e.target as HTMLButtonElement
    const type = target.dataset.shapeType as ShapeTypes
    this.setActiveShapeBtn(type)
  }

  private handleWindowResize(e: Event): void {
    this.stage.width(this.elems.pageContainer!.clientWidth)
    this.stage.height(this.elems.pageContainer!.clientHeight)
    let diffX = 0
    let diffY = 0
    let scale = 1

    const bg = this.stage.findOne(`#${this.bgId}`)

    if (bg) {
      bg.width(this.elems.pageContainer!.clientWidth)
      bg.height(this.elems.pageContainer!.clientWidth)
    }

    const image = this.stage.findOne(
      `#${this.screenshotImageId}`
    ) as Konva.Image
    if (image) {
      const originalWidth = Math.ceil(
        this.lastData!.width / this.lastData!.scale
      )
      const originalHeight = Math.ceil(
        this.lastData!.height / this.lastData!.scale
      )
      const imageRatio = originalWidth / originalHeight
      const stageWidth = this.stage.width()
      const stageHeight = this.stage.height()
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

      scale = imageWidth / this.stage.width()

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
  }

  private handleStageMouseOver(e: KonvaEventObject<MouseEvent, Stage>): void {
    if (e.target.attrs.draggable) {
      this.stage.container().style.cursor = "move"
    } else {
      this.stage.container().style.cursor = "default"
    }
  }

  private handleStageMouseDown(e: KonvaEventObject<MouseEvent, Stage>): void {
    const isTransformClick = e.target.attrs.name == "back"

    if (isTransformClick) {
      return
    }

    const id = e.target.attrs.id
    this.clickedShapeId = [this.screenshotImageId].includes(id) ? undefined : id
    const clickedShape = this.stage.findOne(`#${this.clickedShapeId}`)

    // console.log('this.clickedShapeId', this.clickedShapeId)

    this.selectedShapes = this.tr.nodes()
    const selecredIds = this.selectedShapes.map((n) => n.attrs.id)

    if (selecredIds.includes(this.clickedShapeId)) {
      return
    }

    if (e.target.attrs.name?.indexOf("_anchor") >= 0) {
      return
    }

    // Update Active Color and Stroke Width
    if (clickedShape) {
      if (clickedShape instanceof Text) {
        const color = this.getActiveColorNameByHex(
          clickedShape.fill() as string
        )
        const width = this.getShapeWidthByFontSize(clickedShape.fontSize())
        this.setActiveShapeWidth(width)
        this.setActiveColor(color)
      } else {
        const strokeWidth = (clickedShape as Arrow).strokeWidth()
        const stroke = (clickedShape as Arrow).stroke() as string

        if (strokeWidth) {
          this.setActiveShapeWidth(strokeWidth)
        }

        if (stroke) {
          this.setActiveColor(this.getActiveColorNameByHex(stroke))
        }
      }
    }

    // Add Transform Rectangle
    if (clickedShape) {
      this.selectedShapes = this.isShiftPress
        ? [...this.selectedShapes, clickedShape!]
        : [clickedShape!]

      this.updateTransform()
    } else {
      this.clearTransform()
    }

    if (
      [this.arrowCircleStart.id(), this.arrowCircleEnd.id()].includes(
        this.clickedShapeId
      )
    ) {
      return
    } else {
    }

    if (this.shapes.includes(this.clickedShapeId)) {
      if (
        clickedShape instanceof Arrow ||
        (clickedShape instanceof Line &&
          !this.isShape(clickedShape, "curved_line"))
      ) {
      }
    } else {
      this.startPos = this.stage.getPointerPosition()!

      if (this.mouseMoveTypes.includes(this.activeShapeType)) {
        this.isMouseDown = true
      } else {
        this.createShape(this.activeShapeType)
      }
    }
  }

  private handleStageMouseMove(e: KonvaEventObject<MouseEvent, Stage>): void {
    if (this.isMouseDown) {
      if (!this.isShapeCreated) {
        this.createShape(this.activeShapeType)
      }

      if (this.isShape(this.activeShape, "curved_line")) {
        const pos = this.stage.getPointerPosition()!
        const newPoints = (this.activeShape as CurvedLine)
          .points()
          .concat([pos.x, pos.y])
        ;(this.activeShape as CurvedLine).points(newPoints)
        this.layer.batchDraw()
      }

      if (
        this.activeShape instanceof Arrow ||
        (this.activeShape instanceof Line &&
          !this.isShape(this.activeShape, "curved_line"))
      ) {
        const pos = this.stage.getPointerPosition()!

        if (pos.x == this.startPos.x && pos.y == this.startPos.y) {
          return
        }

        const startX = this.activeShape.points()[0]!
        const startY = this.activeShape.points()[1]!
        const endX = pos.x
        const endY = pos.y
        const isHorizontal = Math.abs(startX - endX) > Math.abs(startY - endY)

        const points = !this.isShiftPress
          ? [startX, startY, endX, endY]
          : isHorizontal
            ? [startX, startY, endX, startY]
            : [startX, startY, startX, endY]
        this.activeShape.points(points)
        this.layer.batchDraw()
      }

      if (this.activeShape instanceof Ellipse) {
        const pos = this.stage.getPointerPosition()!

        if (pos.x == this.startPos.x && pos.y == this.startPos.y) {
          return
        }

        const posRect = this.flipRectCoordinates(this.startPos, pos)
        const rX = posRect.endX - posRect.startX
        const rY = posRect.endY - posRect.startY
        const fixedRadius = Math.max(rX, rY)

        const radiusX = this.isShiftPress ? fixedRadius : rX
        const radiusY = this.isShiftPress ? fixedRadius : rY
        this.activeShape.x(posRect.startX + radiusX / 3.14)
        this.activeShape.y(posRect.startY + radiusY / 3.14)
        this.activeShape.radiusX(radiusX)
        this.activeShape.radiusY(radiusY)
        this.layer.batchDraw()
      }

      if (this.activeShape instanceof Rect) {
        const pos = this.stage.getPointerPosition()!

        if (pos.x == this.startPos.x && pos.y == this.startPos.y) {
          return
        }

        const posRect = this.flipRectCoordinates(this.startPos, pos)
        const w = posRect.endX - posRect.startX
        const h = posRect.endY - posRect.startY
        const fixedSize = Math.max(w, h)

        const width = this.isShiftPress ? fixedSize : w
        const height = this.isShiftPress ? fixedSize : h
        this.activeShape.x(posRect.startX)
        this.activeShape.y(posRect.startY)
        this.activeShape.width(width)
        this.activeShape.height(height)
        this.layer.batchDraw()
      }
    }
  }

  private handleStageMouseUp(e: KonvaEventObject<MouseEvent, Stage>): void {
    const isPointerActive = Boolean(this.activeShape?.attrs.name == "pointer")

    if (isPointerActive) {
      const pointerAreas = this.layer.children.filter(
        (node) => node.attrs.name == "pointer"
      )
      const allNodes = this.getHistoryNodes()

      pointerAreas.forEach((rect) => {
        const selectionRect = rect.getClientRect()
        const selectedNodes = allNodes.filter((node) => {
          const shapeRect = node.getClientRect()
          return (
            shapeRect.x <= selectionRect.x + selectionRect.width &&
            shapeRect.x + shapeRect.width >= selectionRect.x &&
            shapeRect.y <= selectionRect.y + selectionRect.height &&
            shapeRect.y + shapeRect.height >= selectionRect.y
          )
        })

        this.selectedShapes = selectedNodes
        this.updateTransform()
        rect.destroy()
      })

      this.layer.batchDraw()
    }

    if (this.isShapeCreated && !isPointerActive) {
      this.historySave()
    }

    this.activeShape = undefined
    this.isMouseDown = false
    this.isShapeCreated = false
  }

  private handleStageDblclick(e: KonvaEventObject<MouseEvent, Stage>): void {
    const dblclickedShapeId = e.target.attrs.id
    const dblclickedShape = this.stage.findOne(`#${dblclickedShapeId}`)

    if (dblclickedShape instanceof Text) {
      this.focusTextarea(dblclickedShape as Text)
    } else {
      this.clickOnShapeBtn("pointer")
    }
  }

  private handleStageDropOver(e: DragEvent): void {
    e.preventDefault()
    e.dataTransfer!.dropEffect = "copy"
    this.stage.container().style.cursor = "copy"
  }

  private handleStageDrop(e: DragEvent): void {
    e.preventDefault()

    const files = e.dataTransfer!.files

    if (!files.length) {
      return
    }

    let images: File[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file?.type.match("image.*")) {
        images.push(file)
      }
    }

    const urls = images.map((i) => URL.createObjectURL(i))
    const pos = this.stage.getPointerPosition()!

    Promise.all(this.loadImages(urls, pos)).then((value) => {
      this.historySave()
      this.clickOnShapeBtn("pointer")

      if (value.length == 1) {
        const image = value[0]!
        this.selectedShapes = [image]
        this.updateTransform()
      }
    })
  }

  private pasteImages(
    items: DataTransferItem[],
    pos: Vector2d
  ): Promise<Shape>[] {
    let promises: Promise<Shape>[] = []
    items.forEach((item) => {
      const load = new Promise<Shape>((resolve, reject) => {
        const blob = item.getAsFile()

        if (blob) {
          const reader = new FileReader()
          const _this = this

          reader.onload = function (event) {
            const url = event.target!.result as string
            Promise.all(_this.loadImages([url], pos)).then((value) => {
              resolve(value[0]!)
            })
          }

          reader.readAsDataURL(blob!)
        } else {
          reject()
        }
      })

      promises.push(load)
    })
    return promises
  }

  private loadImages(urls: string[], pos: Vector2d): Promise<Shape>[] {
    let promises: Promise<Shape>[] = []

    urls.forEach((url, index) => {
      const load = new Promise<Shape>((resolve, reject) => {
        const imageObj = new Image()
        const _this = this

        imageObj.onload = function () {
          const rect = _this.adjustImage({
            width: imageObj.width,
            height: imageObj.height,
            x: pos.x,
            y: pos.y,
          })

          const img = new Konva.Image({
            id: "image_" + Date.now(),
            name: "image",
            imageUrl: url,
            image: imageObj,
            width: rect.width,
            height: rect.height,
          })

          img.x(rect.x + index * 20)
          img.y(rect.y + index * 20)

          _this.layer.add(img)
          resolve(img)
        }

        imageObj.src = url
      })

      promises.push(load)
    })

    return promises
  }

  private bindStageEvents(): void {
    this.stage.on("mouseover", this.handleStageMouseOver.bind(this))
    this.stage.on("mousedown", this.handleStageMouseDown.bind(this))
    this.stage.on("mousemove", this.handleStageMouseMove.bind(this))
    this.stage.on("mouseup", this.handleStageMouseUp.bind(this))
    this.stage.on("dblclick", this.handleStageDblclick.bind(this))

    this.stage.content.addEventListener(
      "drop",
      this.handleStageDrop.bind(this),
      false
    )
    this.stage.content.addEventListener(
      "dragover",
      this.handleStageDropOver.bind(this),
      false
    )
  }

  private bindEvents(): void {
    document.addEventListener(
      "paste",
      this.handleDocumentPaste.bind(this),
      false
    )
    window.addEventListener(
      "keydown",
      this.handleWindowKeydown.bind(this),
      false
    )
    window.addEventListener("keyup", this.handleWindowKeyup.bind(this), false)
    this.elems.textarea!.addEventListener(
      "blur",
      this.handleTextareaBlur.bind(this),
      false
    )
    this.elems.textarea!.addEventListener(
      "input",
      this.handleTextareaInput.bind(this),
      false
    )
    this.elems.activeWidthSlider!.addEventListener(
      "input",
      this.handleWidthSliderInput.bind(this),
      false
    )
    this.elems.historyBtns!.forEach((btn) => {
      btn.addEventListener("click", this.handleHistoryClick.bind(this), false)
    })
    this.elems.activeColorBtns!.forEach((btn) => {
      btn.addEventListener(
        "click",
        this.handleActiveColorBtnClick.bind(this),
        false
      )
    })
    this.elems.activeColorBtn!.addEventListener(
      "click",
      () => {
        this.elems.colorPopover!.toggleAttribute("hidden")
        this.elems.bgPopover?.setAttribute("hidden", "")
      },
      false
    )
    this.elems.shapeBtns!.forEach((btn) => {
      btn.addEventListener("click", this.handleShapeBtnClick.bind(this), false)
    })
    window.addEventListener("resize", this.handleWindowResize.bind(this), false)

    this.elems.activeBgBtn?.addEventListener(
      "click",
      () => {
        this.elems.bgPopover?.toggleAttribute("hidden")
        this.elems.colorPopover!.setAttribute("hidden", "")
      },
      false
    )

    this.elems.activeBgBtns?.forEach((btn) => {
      btn.addEventListener(
        "click",
        this.handleActiveBgBtnClick.bind(this),
        false
      )
    })
  }

  private setActiveShapeBtn(type: ShapeTypes): void {
    if (this.activeShapeType == type) {
      return
    }

    this.activeShapeType = type

    this.elems.shapeBtns!.forEach((btn) => {
      const btnType = btn.dataset.shapeType
      btn.classList.toggle("hover", btnType == type)
    })

    this.toggleSelectionMode()
    this.clearTransform()
  }

  private toggleSelectionMode(): void {
    if (this.activeShapeType == "pointer") {
      this.getHistoryNodes().forEach((node) => node.listening(true))
    } else {
      this.getHistoryNodes().forEach((node) => node.listening(false))
    }
  }

  private showArrowCircles(arrowId: string): void {
    this.arrowCircleEnd.moveToTop()
    this.arrowCircleStart.moveToTop()
    this.arrowCircleStart.id(
      `${this.arrowCircleStart.id()}${this.arrowIdSeparator}${arrowId}`
    )
    this.arrowCircleEnd.id(
      `${this.arrowCircleEnd.id()}${this.arrowIdSeparator}${arrowId}`
    )
    this.arrowCircleStart.show()
    this.arrowCircleEnd.show()
  }

  private hideArrowCircles(): void {
    this.arrowCircleStart.id(this.arrowCircleStartId)
    this.arrowCircleEnd.id(this.arrowCircleEndId)
    this.arrowCircleStart.hide()
    this.arrowCircleEnd.hide()
  }

  private moveArrowCircles(arrow: Arrow): void {
    const [startX, startY, endX, endY] = arrow.attrs.points
    const diff = arrow.position()
    this.arrowCircleStart.position({ x: startX + diff.x, y: startY + diff.y })
    this.arrowCircleEnd.position({ x: endX + diff.x, y: endY + diff.y })
  }

  private flipRectCoordinates(
    startPos: Vector2d,
    endPos: Vector2d
  ): { startX: number; startY: number; endX: number; endY: number } {
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

  private moveArrow(circle: Circle): void {
    const ids = circle.id().split(this.arrowIdSeparator)
    const arrowId = ids[ids.length - 1]
    const arrow = this.stage.findOne(`#${arrowId}`) as Arrow

    if (!arrow) {
      return
    }

    const startX = this.arrowCircleStart.x() - arrow.x()
    const startY = this.arrowCircleStart.y() - arrow.y()
    const endX = this.arrowCircleEnd.x() - arrow.x()
    const endY = this.arrowCircleEnd.y() - arrow.y()

    const isHorizontal = Math.abs(startX - endX) > Math.abs(startY - endY)
    const p = !this.isShiftPress
      ? [startX, startY, endX, endY]
      : isHorizontal
        ? [startX, startY, endX, startY]
        : [startX, startY, startX, endY]

    arrow.points(p)

    this.moveArrowCircles(arrow)
  }

  private focusTextarea(textShape: Text): void {
    this.activeTextShape = textShape
    const textareaPosition = {
      x: this.stage.container().offsetLeft + textShape.absolutePosition().x,
      y: this.stage.container().offsetTop + textShape.absolutePosition().y,
    }
    this.elems.textarea!.removeAttribute("hidden")
    this.elems.textarea!.style.left = `${textareaPosition.x}px`
    this.elems.textarea!.style.top = `${textareaPosition.y}px`
    this.elems.textarea!.style.width = `${textShape.width()}px`
    this.elems.textarea!.style.height = `${textShape.height()}px`
    this.elems.textarea!.style.fontSize = `${textShape.fontSize()}px`
    this.elems.textarea!.style.fontWeight = `${textShape.fontStyle()}`
    this.elems.textarea!.style.lineHeight = `${textShape.lineHeight()}`
    this.elems.textarea!.style.fontFamily = `${textShape.fontFamily()}`
    this.elems.textarea!.style.maxWidth = `${this.stage.width() - textareaPosition.x}px`
    this.elems.textarea!.value = textShape.text()

    this.isTextareaFocused = true

    setTimeout(() => {
      this.elems.textarea!.focus()
    })
  }

  private createShape(type: ShapeTypes): void {
    if (type == "pointer") {
      this.activeShape = new Konva.Rect({
        name: type,
        x: this.startPos.x,
        y: this.startPos.y,
        stroke: "#bbb",
        strokeWidth: 1,
        fillEnabled: false,
        strokeScaleEnabled: false,
        ignoreHistory: true,
        scaleX: 1,
        scaleY: 1,
      })

      this.layer.add(this.activeShape)
    }

    if (this.clickedShapeId) {
      return
    }

    const shapeId = `${type}_${this.shapes.length}`
    this.shapes.push(shapeId)

    if (type == "arrow") {
      this.activeShape = new Konva.Arrow({
        id: shapeId,
        name: type,
        points: [this.startPos.x, this.startPos.y],
        stroke: this.activeColor,
        fill: this.activeColor,
        strokeWidth: this.activeShapeWidth,
        draggable: true,
        listening: false,
        hitStrokeWidth: 20,
      })

      this.layer.add(this.activeShape)
    }

    if (type == "curved_line") {
      this.activeShape = new CurvedLine({
        id: shapeId,
        name: type,
        points: [this.startPos.x, this.startPos.y],
        stroke: this.activeColor,
        strokeWidth: this.activeShapeWidth,
        draggable: true,
        listening: false,
        hitStrokeWidth: 10,
      }) as CurvedLine

      this.layer.add(this.activeShape)
    }

    if (type == "line") {
      this.activeShape = new Konva.Line({
        id: shapeId,
        name: type,
        points: [this.startPos.x, this.startPos.y],
        stroke: this.activeColor,
        strokeWidth: this.activeShapeWidth,
        draggable: true,
        listening: false,
        hitStrokeWidth: 20,
      })

      this.layer.add(this.activeShape)
    }

    if (type == "rect") {
      this.activeShape = new Konva.Rect({
        id: shapeId,
        name: type,
        x: this.startPos.x,
        y: this.startPos.y,
        stroke: this.activeColor,
        strokeWidth: this.activeShapeWidth,
        draggable: true,
        hitStrokeWidth: 20,
        fillEnabled: false,
        strokeScaleEnabled: false,
        listening: false,
        scaleX: 1,
        scaleY: 1,
      })

      this.layer.add(this.activeShape)
    }

    if (type == "ellipse") {
      this.activeShape = new Konva.Ellipse({
        id: shapeId,
        name: type,
        draggable: true,
        x: this.startPos.x,
        y: this.startPos.y,
        radiusX: 0,
        radiusY: 0,
        scaleX: 1,
        scaleY: 1,
        stroke: this.activeColor,
        strokeWidth: this.activeShapeWidth,
        strokeScaleEnabled: false,
        fillEnabled: false,
        listening: false,
        hitStrokeWidth: 20,
      })

      this.layer.add(this.activeShape)
    }

    if (type == "text") {
      this.activeShape = new Konva.Text({
        id: shapeId,
        name: type,
        x: this.startPos.x,
        y: this.startPos.y,
        text: "",
        fontSize: this.getFontSize(this.activeShapeWidth),
        fontFamily: "Arial",
        fontStyle: "600",
        lineHeight: 1.2,
        fill: this.activeColor,
        draggable: true,
        strokeWidth: 2,
        stroke: "white",
        fillAfterStrokeEnabled: true,
        shadowColor: "black",
        shadowOffset: { x: 0, y: 1 },
        shadowOpacity: 0.3,
      })

      this.layer.add(this.activeShape)
      this.focusTextarea(this.activeShape as Text)
    }

    this.layer.batchDraw()
    this.isShapeCreated = true
  }

  renderBackground(colorName: string): void {
    const defaultColor = BACKGROUND_MAP[0]!.hex
    const color = colorName ? this.getActiveBgByName(colorName) : defaultColor

    const background = new Konva.Rect({
      id: this.bgId,
      x: 0,
      y: 0,
      width: this.stage.width(),
      height: this.stage.height(),
      fill: color,
      ignoreHistory: true,
      listening: false,
    })

    this.layer.add(background)
  }

  private adjustImage(_data: Rectangle): Rectangle {
    let data = { ..._data }
    const stageWidth = this.stage.width()
    const stageHeight = this.stage.height()

    if (data.width + data.x > stageWidth) {
      data = { ...data, x: 0 }
    }

    if (data.height + data.y > stageHeight) {
      data = { ...data, y: 0 }
    }

    if (data.height > stageHeight) {
      const scaleH = stageHeight / data.height
      const imgHeight = stageHeight
      const imgWidth = Math.ceil(data.width * scaleH)
      data = {
        x: (stageWidth - imgWidth) / 2,
        y: (stageHeight - imgHeight) / 2,
        height: imgHeight,
        width: imgWidth,
      }
    }

    if (data.width > stageWidth) {
      const scaleW = stageWidth / data.width
      const imgWidth = stageWidth
      const imgHeight = Math.ceil(data.height * scaleW)
      data = {
        x: (stageWidth - imgWidth) / 2,
        y: (stageHeight - imgHeight) / 2,
        height: imgHeight,
        width: imgWidth,
      }
    }

    return data
  }

  renderScreenshot(data: IScreenshotImageData): void {
    this.layer.destroyChildren()
    this.initTransform()
    this.lastData = data

    let imageWidth = Math.ceil(this.lastData.width / this.lastData.scale)
    let imageHeight = Math.ceil(this.lastData.height / this.lastData.scale)

    if (imageHeight > this.stage.height()) {
      const scaleH = this.stage.height() / imageHeight
      imageHeight = this.stage.height()
      imageWidth = Math.ceil(imageWidth * scaleH)
    }

    if (imageWidth > this.stage.width()) {
      const scaleW = this.stage.width() / imageWidth
      imageWidth = this.stage.width()
      imageHeight = Math.ceil(imageHeight * scaleW)
    }

    const imageObj = new Image()
    const _this = this
    imageObj.onload = function () {
      const screenshot = new Konva.Image({
        id: _this.screenshotImageId,
        image: imageObj,
        width: imageWidth,
        height: imageHeight,
        ignoreHistory: true,
      })
      screenshot.moveToBottom()
      screenshot.x((_this.stage.width() - imageWidth) / 2)
      screenshot.y((_this.stage.height() - imageHeight) / 2)
      _this.layer.add(screenshot)
    }

    imageObj.src = data.url
  }
}
