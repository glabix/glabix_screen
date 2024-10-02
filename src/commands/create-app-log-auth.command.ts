import axios from "axios"
export function CreateAppLogAuthCommand(
  token: string,
  orgId: number,
  app_version: string,
  title: string,
  body: string
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/organizations/${orgId}/app_logs`
  const params = {
    body,
    title,
    version: app_version,
  }
  axios
    .post(url, params, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then((response) => {})
}
