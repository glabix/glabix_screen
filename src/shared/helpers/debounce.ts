export function debounce<Params extends any[]>(
  func: (...args: Params) => any,
  timeout = 300
): (...args: Params) => any {
  let timer: NodeJS.Timeout
  return (...args: Params) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      func(...args)
    }, timeout)
  }
}
