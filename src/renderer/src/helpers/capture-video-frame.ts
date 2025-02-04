import { Rectangle } from "electron"

export function captureVideoFrame(
  stream: MediaStream,
  screenSize: { width: number; height: number; scale: number },
  _crop?: Rectangle
): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const crop = _crop ? _crop : { ...screenSize, x: 0, y: 0 }

    video.width = screenSize.width
    video.height = screenSize.height
    canvas.width = crop.width
    canvas.height = crop.height
    canvas.style.width = `${crop.width}px`
    canvas.style.height = `${crop.height}px`

    video.srcObject = stream
    video.play()

    video.onloadedmetadata = () => {
      setTimeout(() => {
        video.pause()
        ctx!.drawImage(
          video,
          crop.x * screenSize.scale,
          crop.y * screenSize.scale,
          crop.width * screenSize.scale,
          crop.height * screenSize.scale,
          0,
          0,
          crop.width,
          crop.height
        )
        resolve(canvas.toDataURL("image/png"))
      }, 50)
    }
  })
}
