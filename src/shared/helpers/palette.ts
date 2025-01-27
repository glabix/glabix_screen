export class Palette {
  static getColor(cssVarName: string): string {
    return getComputedStyle(document.body).getPropertyValue(cssVarName).trim()
  }

  static get common(): string[] {
    return [...Array(20).keys()]
      .map((i) => Palette.getColor(`--accent-${i}`))
      .filter((c) => c)
  }
}
