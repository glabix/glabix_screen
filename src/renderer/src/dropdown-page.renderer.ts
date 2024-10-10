import "../styles/dropdown-page.scss"
import {
  IDropdownItem,
  IDropdownPageData,
  IDropdownPageSelectData,
  ScreenAction,
} from "../../main/helpers/types"
import { LoggerEvents } from "../../shared/events/logger.events"

const template = document.querySelector(
  "#dropdown_item_tpl"
) as HTMLTemplateElement
let currentData: IDropdownPageData
const container = document.querySelector("#dropdown_list")

function renderItem(item: IDropdownItem): HTMLElement {
  const clone = template.content.cloneNode(true) as HTMLElement
  const btn = clone.querySelector("button")
  const text = clone.querySelector("span")
  const icon = clone.querySelector("i")
  const selectedIcon = clone.querySelector(".js-is-selected")

  btn.setAttribute("data-id", item.id)

  text.textContent = item.label

  if (item.isSelected) {
    btn.classList.add("hover")
    selectedIcon.removeAttribute("hidden")
  }

  if (item.extraData && item.extraData.icon) {
    if (["i-display", "i-expand-wide"].includes(item.extraData.icon)) {
      const i = document.createElement("div")
      i.classList.add("icon-dot", "i-br")
      icon.appendChild(i)
    }

    icon.classList.add(item.extraData.icon)
  }

  return clone
}

window.electronAPI.ipcRenderer.on(
  "dropdown:open",
  (event, data: IDropdownPageData) => {
    switch (data.list.type) {
      case "videoDevices":
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "webcam.settings.clicked",
          body: { state: "opened" },
        })
        break
      case "audioDevices":
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "microphone.settings.clicked",
          body: { state: "opened" },
        })
        break
      case "screenActions":
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "screen.settings.clicked",
          body: { state: "opened" },
        })
        break
    }

    container.innerHTML = null
    switch (currentData?.list?.type) {
      case "videoDevices":
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "webcam.settings.close",
        })
        break
      case "audioDevices":
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "microphone.settings.close",
        })
        break
      case "screenActions":
        window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
          title: "screen.settings.close",
        })
        break
    }
    currentData = data
    data.list.items.forEach((item) => {
      container.appendChild(renderItem(item))
    })
  }
)

document.addEventListener("click", (event) => {
  const btn = event.target as HTMLButtonElement

  if (btn.tagName.toLowerCase() == "button") {
    const id = btn.dataset.id as ScreenAction
    const item = currentData.list.items.find((i) => i.id == id)

    if (currentData.list.type == "screenActions") {
      const action = id
      const data: IDropdownPageSelectData = { action, item }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      container.innerHTML = null
    }

    if (currentData.list.type == "videoDevices") {
      const data: IDropdownPageSelectData = { item, cameraDeviceId: id }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      container.innerHTML = null
    }

    if (currentData.list.type == "audioDevices") {
      const data: IDropdownPageSelectData = { item, audioDeviceId: id }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      container.innerHTML = null
    }
  }
})
