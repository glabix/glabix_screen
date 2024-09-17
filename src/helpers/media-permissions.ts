export const getMediaPermission = async (
  permissionName: "screen" | "camera" | "microphone"
): Promise<boolean> => {
  let result = false
  // Проверка записи экрана
  try {
    console.log("permissionName", permissionName)
    if (permissionName == "screen") {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      })
      stream.getTracks().forEach((track) => track.stop())
      result = true
    }

    if (permissionName == "camera") {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((track) => track.stop())
      result = true
    }

    if (permissionName == "microphone") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      result = true
    }
  } catch (e) {
    result = false
  }

  return result
}
