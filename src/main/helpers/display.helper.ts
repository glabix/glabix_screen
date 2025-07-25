import { BrowserWindow, Display, Rectangle, screen } from "electron"
import { LogSender } from "../../main/helpers/log-sender"
import { stringify } from "../../main/helpers/stringify"
const logSender = new LogSender()

export function getCorrectBounds(
  _bounds: Rectangle,
  scaleFactor: number
): Rectangle {
  let bounds = _bounds

  if (process.platform === "win32") {
    bounds = {
      x: bounds.x * scaleFactor,
      y: bounds.y * scaleFactor,
      width: bounds.width * scaleFactor,
      height: bounds.height * scaleFactor,
    }
  }

  return bounds
}

export function getCurrentDisplay(
  window: BrowserWindow,
  activeDisplay: Display
): Display {
  const winBounds = getCorrectBounds(
    window.getBounds(),
    activeDisplay.scaleFactor
  )
  const displays = screen.getAllDisplays()
  let currentDisplay = activeDisplay

  if (process.platform === "win32") {
    for (const display of displays) {
      const displayPhysicalBounds = getCorrectBounds(
        display.bounds,
        display.scaleFactor
      )

      if (
        winBounds.x >= displayPhysicalBounds.x &&
        winBounds.x < displayPhysicalBounds.x + displayPhysicalBounds.width &&
        winBounds.y >= displayPhysicalBounds.y &&
        winBounds.y < displayPhysicalBounds.y + displayPhysicalBounds.height
      ) {
        currentDisplay = display
      }
    }
  } else {
    currentDisplay = screen.getDisplayNearestPoint({
      x: winBounds.x,
      y: winBounds.y,
    })
  }

  return currentDisplay
}
