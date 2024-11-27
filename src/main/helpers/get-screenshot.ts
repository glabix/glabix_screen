import { desktopCapturer, Display, nativeImage, Rectangle } from "electron"

export async function getScreenshot(
  activeDisplay: Display,
  crop?: Rectangle
): Promise<string> {
  const scale = activeDisplay.scaleFactor
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: activeDisplay.bounds.width * scale,
      height: activeDisplay.bounds.height * scale,
    },
  })

  const screen =
    sources.find((s) => Number(s.display_id) == activeDisplay.id) || sources[0]
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

  return image.toDataURL()
}
