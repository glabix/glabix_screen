import axios from "axios"
export function createAppLogNoAuthCommand(
  app_version: string,
  title: string,
  body: string
) {
  const url = `${import.meta.env.VITE_API_PATH}screen_recorder/app_logs`
  const params = {
    body,
    title,
    version: app_version,
  }
  axios.post(url, params, {}).then((response) => {})
}
