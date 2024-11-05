import axios from "axios"

export function createFileUploadCommand(
  token: string,
  orgId: number,
  filename: string,
  chunks_count: number,
  title: string,
  file_size: number,
  version: string,
  preview: File | undefined,
  callback: (err: null | Error, uuid: string | null) => void
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

  axios
    .post<{
      uuid: string
    }>(url, formData, { headers: { Authorization: `Bearer ${token}` } })
    .then((response) => {
      if (response.status === 200 || response.status === 201) {
        const uuid = response.data.uuid
        callback(null, uuid)
      } else {
        callback(
          new Error(
            `Failed to create multipart file upload, code ${response.status}`
          ),
          null
        )
      }
    })
    .catch((e) => {
      callback(e, null)
      return e
    })
}
