import axios, { AxiosRequestConfig } from "axios"

export function submitUploadPartCommandV3(
  token: string,
  orgId: number,
  uploadUuid: string,
  chunk: Buffer,
  config?: AxiosRequestConfig
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads/${uploadUuid}/upload_part`
  const chunkFormData = new FormData()
  const file = new File([chunk], "chunk")
  chunkFormData.append("file_part", file)
  return axios.post(url, chunkFormData, {
    ...config,
    headers: { Authorization: `Bearer ${token}` },
  })
}
