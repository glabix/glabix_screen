import { IDrawLaserDelaySettings } from "@shared/types/types"
import { UserSettingsEvents } from "@shared/types/user-settings.types"

const MIN_DELAY_SEC = 0
const MAX_DELAY_SEC = 30

export class BindLaserDelayInput {
  private input: HTMLInputElement
  private checkbox: HTMLInputElement
  private value: IDrawLaserDelaySettings

  constructor(
    _input: HTMLInputElement,
    _checkbox: HTMLInputElement,
    _value: IDrawLaserDelaySettings
  ) {
    this.input = _input
    this.checkbox = _checkbox
    this.value = _value

    this.bind()
    this.updateState()
  }

  setValue(_value: IDrawLaserDelaySettings) {
    this.value = _value
    this.updateState()
  }

  private updateState() {
    this.checkbox.checked = !this.value.disabled
    this.input.value = this.getInputValue()
    this.input
      .closest(".settings-section")
      ?.classList.toggle("is-disabled", this.value.disabled)
  }

  private bind() {
    this.input.addEventListener(
      "focus",
      this.handleInputFocus.bind(this),
      false
    )
    this.input.addEventListener("blur", this.handleInputBlur.bind(this), false)
    this.input.addEventListener(
      "input",
      this.handleInputChange.bind(this),
      false
    )
    this.input.addEventListener(
      "keydown",
      this.handleInputKeydown.bind(this),
      false
    )
    this.checkbox.addEventListener(
      "change",
      this.handleCheckbox.bind(this),
      false
    )
  }

  private handleInputFocus(e: Event) {
    this.input.value = ""
  }

  private handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement
    this.input
      .closest(".settings-shortcut-input-wrapper")
      ?.classList.toggle("has-error", !this.isInputValueValid(input.value))
  }

  private handleInputBlur(e: Event) {
    const input = e.target as HTMLInputElement
    let value = input.value

    if (this.isInputValueValid(input.value) && value.length) {
      const newValue = Number(value)
      const sec =
        newValue < MIN_DELAY_SEC
          ? MIN_DELAY_SEC
          : newValue > MAX_DELAY_SEC
            ? MAX_DELAY_SEC
            : newValue
      const settings = { ...this.value, delay: sec * 1000 }
      this.setValue(settings)
      window.electronAPI.ipcRenderer.send(
        UserSettingsEvents.DRAW_LASER_DELAY_SETTINGS_SET,
        settings
      )
    } else {
      this.updateState()
    }

    this.input
      .closest(".settings-shortcut-input-wrapper")
      ?.classList.remove("has-error")
  }

  private handleInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      this.input.blur()
    }
  }

  private handleCheckbox(e: Event) {
    const checkbox = e.target as HTMLInputElement
    const settings = { ...this.value, disabled: !checkbox.checked }
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.DRAW_LASER_DELAY_SETTINGS_SET,
      settings
    )
  }

  private isInputValueValid(_value: string): boolean {
    if (!_value.length) {
      return true
    }

    const value = Number(_value)
    return Number.isInteger(value)
  }
  private getInputValue(): string {
    return Math.round(this.value.delay / 1000) + " сек."
  }
}
