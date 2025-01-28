import "@renderer/styles/dialog.scss"
import { DialogWindowEvents, IDialogWindowData } from "@shared/types/types"
const windowsToolbar = document.querySelector(".windows-toolbar")!
const windowsCloseBtn = document.querySelector("#windows_close")!

const isWindows = navigator.userAgent.indexOf("Windows") != -1

if (isWindows) {
  windowsToolbar.removeAttribute("hidden")
}

windowsCloseBtn.addEventListener(
  "click",
  () => {
    if (isWindows) {
      window.electronAPI.ipcRenderer.send("windows:close", {})
    }
  },
  false
)

const title = document.querySelector("#dialog_title")!
const text = document.querySelector("#dialog_text")!
const buttons = document.querySelector("#dialog_footer")!
const btnTpl = document.querySelector(
  "#dialog_button_tpl"
)! as HTMLTemplateElement

window.electronAPI.ipcRenderer.on(
  DialogWindowEvents.RENDER,
  (event, data: IDialogWindowData) => {
    if (data.title) {
      title.innerHTML = data.title
      title.removeAttribute("hidden")
    }

    if (data.text) {
      text.innerHTML = data.text
      text.removeAttribute("hidden")
    }

    buttons.innerHTML = ""
    data.buttons.forEach((btn) => {
      const clone = btnTpl.content.cloneNode(true) as HTMLElement
      const button = clone.querySelector("button")!

      button.innerText = btn.text
      button.classList.add(`btn--${btn.type}`)
      button.setAttribute("data-action", btn.action)
      buttons.appendChild(clone)
    })
  }
)

document.addEventListener("click", (event) => {
  const btn = event.target as HTMLButtonElement

  if (btn.tagName.toLowerCase() == "button") {
    const action = btn.dataset.action
    window.electronAPI.ipcRenderer.send(DialogWindowEvents.CALLBACK, { action })
  }
})
