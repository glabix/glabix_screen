import axios from "axios"

export function uploadFileChunkCommand(
  token: string,
  orgId: number,
  uuid: string,
  chunk: Buffer,
  chunkNumber: number,
  callback: (err: null | Error, data: null) => void
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads/${uuid}`
  const chunkFormData = new FormData()
  const file = new File([chunk], "chunk" + "_" + chunkNumber)
  chunkFormData.append("number", chunkNumber)
  chunkFormData.append("file_part", file)
  axios
    .post(url, chunkFormData, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((response) => {
      if (response.status === 200 || response.status === 201) {
        callback(null, null)
      } else {
        callback(new Error("Failed to upload chunk ${chunkNumber}"), null)
      }
    })
    .catch((e) => {
      console.log(e)
      callback(e, null)
    })
}