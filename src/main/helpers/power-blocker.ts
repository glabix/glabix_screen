import { powerSaveBlocker } from "electron"

export class PowerSaveBlocker {
  private static id: number | null = null
  static start(
    type:
      | "prevent-app-suspension"
      | "prevent-display-sleep" = "prevent-display-sleep"
  ): void {
    if (this.id === null) {
      this.id = powerSaveBlocker.start(type)
    }
  }

  static stop(): void {
    if (this.id !== null) {
      if (powerSaveBlocker.isStarted(this.id)) {
        powerSaveBlocker.stop(this.id)
        this.id = null
      }
    }
  }
}
