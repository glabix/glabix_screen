import { HotkeysEvents } from "@shared/types/types"
import {
  IUserSettingsShortcut,
  UserSettingsEvents,
} from "@shared/types/user-settings.types"

const isWindows = navigator.userAgent.indexOf("Windows") != -1
// Special Keys
const _keyMap = {
  "8": "Backspace",
  backspace: 8,
  "⌫": 8,
  tab: 9,
  "9": "Tab",
  clear: 12,
  enter: 13,
  "↩": 13,
  return: 13,
  "13": "Enter",
  esc: 27,
  escape: 27,
  "27": "Esc",
  space: 32,
  "32": "Space",
  left: 37,
  "37": "Left",
  up: 38,
  "38": "Up",
  right: 39,
  "39": "Right",
  down: 40,
  "40": "Down",
  del: 46,
  delete: 46,
  "46": "Delete",
  ins: 45,
  insert: 45,
  "45": "Insert",
  home: 36,
  "36": "Home",
  end: 35,
  "35": "End",
  pageup: 33,
  "33": "PageUp",
  pagedown: 34,
  "34": "PageDown",
  scrolllock: 145,
  scroll_lock: 145,
  scroll: 145,
  "145": "Scrolllock",
  capslock: 20,
  "20": "Capslock",
  num_0: 96,
  num0: 96,
  "96": "num0",
  num1: 97,
  num_1: 97,
  "97": "num1",
  num2: 98,
  num_2: 98,
  "98": "num2",
  num3: 99,
  num_3: 99,
  "99": "num3",
  num4: 100,
  num_4: 100,
  "100": "num4",
  num5: 101,
  num_5: 101,
  "101": "num5",
  num6: 102,
  num_6: 102,
  "102": "num6",
  num7: 103,
  num_7: 103,
  "103": "num7",
  num8: 104,
  num_8: 104,
  "104": "num8",
  num9: 105,
  num_9: 105,
  "105": "num9",
  num_multiply: 106,
  nummult: 106,
  "106": "nummult",
  num_add: 107,
  numadd: 107,
  "107": "numadd",
  num_enter: 108,
  num_subtract: 109,
  numsub: 109,
  "109": "numsub",
  num_decimal: 110,
  numdec: 110,
  "110": "numdec",
  num_divide: 111,
  numdiv: 111,
  "111": "numdiv",

  F1: 112,
  f1: 112,
  "112": "F1",
  F2: 113,
  f2: 113,
  "113": "F2",
  F3: 114,
  f3: 114,
  "114": "F3",
  F4: 115,
  f4: 115,
  "115": "F4",
  F5: 116,
  f5: 116,
  "116": "F5",
  F6: 117,
  f6: 117,
  "117": "F6",
  F7: 118,
  f7: 118,
  "118": "F7",
  F8: 119,
  f8: 119,
  "119": "F8",
  F9: 120,
  f9: 120,
  "120": "F9",
  F10: 121,
  f10: 121,
  "121": "F10",
  F11: 122,
  f11: 122,
  "122": "F11",
  F12: 123,
  f12: 123,
  "123": "F12",
  "⇪": 20,
  ",": 188,
  "188": ",",
  ".": 190,
  "190": ".",
  "/": 191,
  "191": "/",
  "`": 192,
  "192": "`",
  "-": 189,
  "189": "-",
  "=": 187,
  "187": "=",
  ";": 186,
  "186": ";",
  "'": 222,
  "222": "'",
  "[": 219,
  "219": "[",
  "]": 221,
  "221": "]",
  "\\": 220,
  "220": "\\",
}

const _modifiers = {
  shift: 16,
  ctrl: 17,
  alt: 18,
  option: 18,
  cmd: 91,
  "16": "Shift",
  "17": "Ctrl",
  "18": isWindows ? "Alt" : "Option",
  "91": "Cmd",
}

export class ShortcutsUpdater {
  constructor() {}
  private _downKeyCodes: number[] = []
  private _currentSettings: IUserSettingsShortcut[] = []

  private validate(input: HTMLInputElement): void {
    const codes = this._downKeyCodes.slice()

    if (codes.length > 3) {
      input.blur()
    }

    if (codes.length == 1 && !this.isModifier(codes[0])) {
      input.blur()
    }

    if (codes.length == 2 && !this.isModifier(codes[1])) {
      this.updateSettings(input.dataset.shortcutName!)
      input.dataset.shortcutValue = this.getShortcut()
      input.value = this.getShortcut()
      input.blur()
    }

    if (codes.length == 3 && !this.isModifier(codes[2])) {
      this.updateSettings(input.dataset.shortcutName!)
      input.dataset.shortcutValue = this.getShortcut()
      input.value = this.getShortcut()
      input.blur()
    }
  }

  private updateSettings(shortcutName: string) {
    const newSettings = this._currentSettings.map((s) => {
      return s.name == shortcutName ? { ...s, keyCodes: this.getShortcut() } : s
    })

    const oldShortcut =
      this._currentSettings.find((s) => s.name == shortcutName)?.keyCodes || ""
    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.SHORTCUTS_UNREGISTER,
      oldShortcut
    )

    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.SHORTCUTS_SET,
      newSettings
    )
  }

  private getInput(e: KeyboardEvent | FocusEvent): HTMLInputElement {
    return e.target as HTMLInputElement
  }

  private isModifier(code: number | undefined): boolean {
    return Boolean(_modifiers[`${code}`])
  }

  private getShortcut(): string {
    return this._downKeyCodes.map((c) => this.getKey(c)).join("+")
  }

  private getKey(code: number): string | undefined {
    return (
      _modifiers[`${code}`] ||
      _keyMap[`${code}`] ||
      String.fromCharCode(code).toUpperCase()
    )
  }

  private setInputWidth(input: HTMLInputElement) {
    const w = (85 / 14) * input.value.length
    const width = w < 85 ? 85 : w
    input.style.width = `${width}px`
  }

  private handleShortcutKeydown(e: KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    const input = this.getInput(e)
    const code = e.keyCode || e.which
    const key = this.getKey(code)

    if (key) {
      this._downKeyCodes.push(code)
      this.setInputWidth(input)
    }

    this.validate(input)
  }

  private handleShortcutClick(e: MouseEvent) {
    const input = this.getInput(e)
    input.readOnly = false
    input.value = ""
    input.focus()
    window.electronAPI.ipcRenderer.send(HotkeysEvents.GLOBAL_PAUSE, {})
  }

  private handleShortcutKeyup(e: KeyboardEvent) {
    const input = this.getInput(e)
    input.blur()
  }

  private handleShortcutBlur(e: FocusEvent) {
    const input = this.getInput(e)
    input.readOnly = true
    input.value = input.dataset.shortcutValue!
    this._downKeyCodes.length = 0
    this.setInputWidth(input)
    window.electronAPI.ipcRenderer.send(HotkeysEvents.GLOBAL_RESUME, {})
  }

  private handleCheckboxChange(e: Event) {
    const checkbox = e.target as HTMLInputElement
    const shortcutName = checkbox.dataset.shortcutName
    const newSettings = this._currentSettings.map((s) => {
      return s.name == shortcutName
        ? { ...s, disabled: Boolean(!checkbox.checked) }
        : s
    })

    window.electronAPI.ipcRenderer.send(
      UserSettingsEvents.SHORTCUTS_SET,
      newSettings
    )
  }

  bindEvents(
    inputs: NodeListOf<HTMLInputElement>,
    checkboxes: NodeListOf<HTMLInputElement>,
    shortcutSettings: IUserSettingsShortcut[]
  ): void {
    this._downKeyCodes.length = 0
    this._currentSettings = shortcutSettings

    checkboxes.forEach((checkbox) => {
      checkbox.removeEventListener(
        "change",
        this.handleCheckboxChange.bind(this)
      )
      checkbox.addEventListener("change", this.handleCheckboxChange.bind(this))
    })

    inputs.forEach((input) => {
      this.setInputWidth(input)
      input.removeEventListener("click", this.handleShortcutClick.bind(this))
      input.addEventListener("click", this.handleShortcutClick.bind(this))

      input.removeEventListener(
        "keydown",
        this.handleShortcutKeydown.bind(this)
      )
      input.addEventListener("keydown", this.handleShortcutKeydown.bind(this))

      input.removeEventListener("keyup", this.handleShortcutKeyup.bind(this))
      input.addEventListener("keyup", this.handleShortcutKeyup.bind(this))

      input.removeEventListener("blur", this.handleShortcutBlur.bind(this))
      input.addEventListener("blur", this.handleShortcutBlur.bind(this))
    })
  }
}
