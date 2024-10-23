import "@renderer/styles/screenshot-page.scss"

const img = document.querySelector(".js-screenshot") as HTMLImageElement

window.electronAPI.ipcRenderer.on(
  "screenshot:getDataURL",
  (event, dataURL: string) => {
    img.src = dataURL
  }
)
