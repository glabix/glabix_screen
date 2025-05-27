import "@renderer/styles/dropdown-page.scss"
import {
  IDropdownItem,
  IDropdownPageData,
  IDropdownPageSelectData,
  ScreenAction,
} from "@shared/types/types"
import { LoggerEvents } from "@shared/events/logger.events"

const template = document.querySelector(
  "#dropdown_item_tpl"
) as HTMLTemplateElement
let currentData: IDropdownPageData
const container = document.querySelector("#dropdown_list")!

function renderItem(item: IDropdownItem): HTMLElement {
  const clone = template.content.cloneNode(true) as HTMLElement
  const btn = clone.querySelector("button")!
  const text = clone.querySelector("span")!
  const icon = clone.querySelector("i")!
  const selectedIcon = clone.querySelector(".js-is-selected")!
  const notAllowed = clone.querySelector(".js-not-allowed")!
  const smallText = clone.querySelector(".js-text-small")!

  btn.setAttribute("data-id", item.id)

  text.textContent =
    item.extraData.isDefault && !item.label.includes("Default")
      ? `Default - ${item.label}`
      : item.label

  if (item.isSelected) {
    btn.classList.add("hover")
    selectedIcon.removeAttribute("hidden")
  }

  if (item.extraData && item.extraData.icon) {
    if (["fullScreenVideo", "cropVideo"].includes(item.id)) {
      const i = document.createElement("div")
      i.classList.add("icon-dot", "i-br")
      icon.appendChild(i)
    }

    icon.classList.add(item.extraData.icon)
  }

  if (item.extraData.smallText) {
    smallText.removeAttribute("hidden")
    smallText.textContent = item.extraData.smallText
  }

  if (item.extraData.btnClass) {
    btn.classList.add(item.extraData.btnClass)
  }

  if (item.extraData.isAllowed === false) {
    notAllowed.removeAttribute("hidden")
    smallText.setAttribute("hidden", "")
    btn.classList.add("text-gray-600")
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

    container.innerHTML = ""
    currentData = data
    data.list.items.forEach((item) => {
      container.appendChild(renderItem(item))
    })
  }
)

document.addEventListener("click", (event) => {
  const btn = event.target as HTMLButtonElement
  const item = currentData.list.items.find((i) => i.id == btn.dataset.id)!

  if (item.extraData.isAllowed === false) {
    window.electronAPI.ipcRenderer.send(
      "redirect:app",
      "org/%orgId%/settings/payments"
    )

    return
  }

  if (btn.tagName.toLowerCase() == "button") {
    const id = btn.dataset.id as ScreenAction

    if (currentData.list.type == "screenActions") {
      const action = id
      const data: IDropdownPageSelectData = { action, item }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      container.innerHTML = ""
    }

    if (currentData.list.type == "videoDevices") {
      const data: IDropdownPageSelectData = { item, cameraDeviceId: id }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      container.innerHTML = ""
    }

    if (currentData.list.type == "audioDevices") {
      const data: IDropdownPageSelectData = { item, audioDeviceId: id }
      window.electronAPI.ipcRenderer.send("dropdown:select", data)
      container.innerHTML = ""
    }
  }
})

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `dropdown-page.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `dropdown-page.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
