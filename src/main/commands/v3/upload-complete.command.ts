import axios from "axios"

export function uploadCompleteCommandV3(
  token: string,
  orgId: number,
  uploadUuid: string
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads/${uploadUuid}/complete_upload`
  // return new Promise((res) => res({ data: { uuid: "123" } }))
  return axios.post<{
    uuid: string
  }>(url, null, { headers: { Authorization: `Bearer ${token}` } })
}
