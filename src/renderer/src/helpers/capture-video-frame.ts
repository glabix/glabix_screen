import { Rectangle } from "electron"

export function captureVideoFrame(
  stream: MediaStream,
  screenSize: { width: number; height: number },
  _crop?: Rectangle
): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const scale = 1
    const crop: Rectangle = _crop ? _crop : { ...screenSize, x: 0, y: 0 }

    video.width = screenSize.width
    video.height = screenSize.height
    canvas.width = crop.width * scale
    canvas.height = crop.height * scale
    canvas.style.width = `${crop.width * scale}px`
    canvas.style.height = `${crop.height * scale}px`

    video.srcObject = stream
    video.play()

    video.onloadedmetadata = () => {
      setTimeout(() => {
        video.pause()
        ctx!.drawImage(
          video,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          video.videoWidth,
          video.videoHeight
        )
        resolve(canvas.toDataURL("image/png"))
      }, 50)
    }
  })
}
