import axios from "axios"

export function createFileUploadCommand(
  token: string,
  orgId: number,
  filename: string,
  chunks_count: number,
  title: string,
  file_size: number,
  version: string,
  preview: File | undefined
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads`
  const formData = new FormData()
  formData.append("title", title)
  formData.append("filename", filename)
  formData.append("chunks_count", chunks_count.toString())
  formData.append("file_size", file_size.toString())
  formData.append("version", version)

  if (preview) {
    formData.append("preview", preview)
  }

  return axios.post<{
    uuid: string
  }>(url, formData, { headers: { Authorization: `Bearer ${token}` } })
}
