export class ZoomPageDisabled {
  constructor() {
    const keyCodes = [61, 107, 109, 173, 187, 189]
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && keyCodes.includes(e.keyCode)) {
        e.preventDefault()
      }
    })

    document.addEventListener(
      "wheel",
      (e) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
        }
      },
      { passive: false }
    )
  }
}
