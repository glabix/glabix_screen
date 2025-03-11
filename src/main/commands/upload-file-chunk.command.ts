import axios, { AxiosRequestConfig } from "axios"

export function uploadFileChunkCommand(
  token: string,
  orgId: number,
  uuid: string,
  chunk: Buffer,
  chunkNumber: number,
  config?: AxiosRequestConfig
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads/${uuid}`
  const chunkFormData = new FormData()
  const file = new File([chunk], "chunk" + "_" + chunkNumber)
  chunkFormData.append("number", chunkNumber.toString())
  chunkFormData.append("file_part", file)
  return axios.post(url, chunkFormData, {
    ...config,
    headers: { Authorization: `Bearer ${token}` },
  })
}
