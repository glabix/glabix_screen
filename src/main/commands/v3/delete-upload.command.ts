import axios, { AxiosRequestConfig } from "axios"

export function deleteUploadCommand(
  token: string,
  orgId: number,
  uploadUuid: string,
  config?: AxiosRequestConfig
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads/${uploadUuid}`
  return axios.delete(url, {
    ...config,
    headers: { Authorization: `Bearer ${token}` },
  })
}
