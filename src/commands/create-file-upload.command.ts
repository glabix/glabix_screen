import axios from "axios"

export function createFileUploadCommand(
  token: string,
  orgId: number,
  filename: string,
  chunks_count: number,
  title: string,
  file_size: number,
  version: string,
  callback: (err: null | Error, uuid: string | null) => void
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads`
  const params = {
    chunks_count,
    filename,
    title,
    version,
    file_size,
  }
  axios
    .post<{
      uuid: string
    }>(url, { ...params }, { headers: { Authorization: `Bearer ${token}` } })
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
