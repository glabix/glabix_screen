import axios from "axios"
import { ICropVideoData } from "@shared/types/types"

export function initUploadCommandV3(
  token: string,
  orgId: number,
  filename: string,
  title: string,
  version: string,
  crop?: ICropVideoData
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/uploads/init`
  const formData = new FormData()
  formData.append("title", title)
  formData.append("filename", filename)
  formData.append("version", version)

  if (crop) {
    formData.append("crop[out_w]", Math.round(crop.out_w).toString())
    formData.append("crop[out_h]", Math.round(crop.out_h).toString())
    formData.append("crop[x]", Math.round(crop.x).toString())
    formData.append("crop[y]", Math.round(crop.y).toString())
  }
  // if (preview) {
  //   formData.append("preview", preview)
  // }

  return axios.post<{
    uuid: string
  }>(url, formData, { headers: { Authorization: `Bearer ${token}` } })
}
