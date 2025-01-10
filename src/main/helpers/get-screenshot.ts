import { desktopCapturer, Display, nativeImage, Rectangle } from "electron"
import { LogSender } from "./log-sender"
const logSender = new LogSender()

export function getScreenshot(
  activeDisplay: Display,
  crop?: Rectangle
): Promise<string> {
  return new Promise((resolve, reject) => {
    const scale = activeDisplay.scaleFactor
    const width = Math.round(activeDisplay.bounds.width * scale)
    const height = Math.round(activeDisplay.bounds.height * scale)

    logSender.sendLog(
      `desktopCapturer.thumbnailSize: { width: ${width}, height: ${height}}, scaleFactor: ${scale}`
    )

    desktopCapturer
      .getSources({
        types: ["screen"],
        thumbnailSize: {
          width: width,
          height: height,
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
