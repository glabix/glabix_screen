import { desktopCapturer, Display, nativeImage, Rectangle } from "electron"
import { LogSender } from "./log-sender"
const logSender = new LogSender()

export function getScreenshot(
  activeDisplay: Display,
  crop?: Rectangle
): Promise<string> {
  return new Promise((resolve, reject) => {
    const scale = activeDisplay.scaleFactor
    logSender.sendLog(
      `getScreenshot thumbnailSize: { width: ${activeDisplay.bounds.width * scale}, height: ${activeDisplay.bounds.height * scale}`
    )
    desktopCapturer
      .getSources({
        types: ["screen"],
        thumbnailSize: {
          width: activeDisplay.bounds.width * scale,
          height: activeDisplay.bounds.height * scale,
        },
      })
      .then((sources) => {
        const screen =
          sources.find((s) => Number(s.display_id) == activeDisplay.id) ||
          sources[0]
        const cropData: Rectangle | null = crop
          ? {
              x: crop.x * scale,
              y: crop.y * scale,
              width: crop.width * scale,
              height: crop.height * scale,
            }
          : null
        let image = cropData
          ? nativeImage
              .createFromDataURL(screen!.thumbnail.toDataURL())
              .crop(cropData)
          : nativeImage.createFromDataURL(screen!.thumbnail.toDataURL())

        resolve(image.toDataURL())
      })
      .catch((e) => {
        reject(e)
      })
  })
}
