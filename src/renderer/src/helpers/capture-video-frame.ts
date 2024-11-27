export function captureVideoFrame(
  stream: MediaStream,
  videoSize: { height: number; width: number }
): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const scale = 1
    // const scale = window.devicePixelRatio || 1

    video.width = videoSize.width
    video.height = videoSize.height
    canvas.width = videoSize.width * scale
    canvas.height = videoSize.height * scale
    canvas.style.width = `${videoSize.width}px`
    canvas.style.height = `${videoSize.height}px`

    video.srcObject = stream
    video.play()

    video.onloadedmetadata = () => {
      setTimeout(() => {
        video.pause()
        ctx!.drawImage(video, 0, 0, videoSize.width, videoSize.height)
        resolve(canvas.toDataURL("image/png"))
      }, 50)
    }
  })
}
