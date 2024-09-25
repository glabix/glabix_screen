import { ISimpleStoreData, SimpleStoreEvents } from "./types"

export class Timer {
  constructor(container: Element, limitSeconds: number) {
    this.el = container
    this.seconds = limitSeconds
    this.limitSeconds = limitSeconds
    this.minutes = Math.floor(this.limitSeconds / 60)

    this.setStartTime()
  }

  private el: Element
  private limitSeconds: number
  private seconds = 0
  private minutes = 0
  private timerInterval: NodeJS.Timeout
  private time = "00:00"

  start(stopVideo?: boolean) {
    if (this.limitSeconds > 0) {
      this.timerInterval = setInterval(() => {
        this.seconds--
        this.setStartTime()
        console.log("minutes", this.minutes, stopVideo, this.seconds)
        if (this.seconds == 0) {
          this.stop()
          if (stopVideo) {
            const data: ISimpleStoreData = {
              key: "recordingState",
              value: "stopped",
            }

            window.electronAPI.ipcRenderer.send(SimpleStoreEvents.UPDATE, data)

            console.log("window.electronAPI.ipcRenderer.send", data)
          }
        }
      }, 1000)
    } else {
      this.timerInterval = setInterval(() => {
        this.seconds++
        this.setStartTime()
      }, 1000)
    }
  }

  private update() {
    this.el.textContent = this.time
  }

  private setStartTime() {
    const minutes = Math.floor(this.seconds / 60)
    const seconds = this.seconds - minutes * 60
    this.time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    this.update()
  }

  pause() {
    clearInterval(this.timerInterval)
  }

  stop() {
    clearInterval(this.timerInterval)
    this.seconds = this.limitSeconds
    this.minutes = Math.floor(this.limitSeconds / 60)
    this.setStartTime()
  }
}
