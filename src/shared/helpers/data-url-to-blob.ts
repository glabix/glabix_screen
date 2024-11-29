export function dataURLtoBlob(dataURL: string, type = "image/png"): Blob {
  const binary = atob(dataURL.split(",")[1]!)
  let array: number[] = []

  for (var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i))
  }

  return new Blob([new Uint8Array(array)], { type })
}
