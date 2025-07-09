export const stringify = (error, maxLength = 2000) => {
  let result = ""
  if (!error) result = ""
  else if (typeof error === "string") result = error
  else if (error instanceof Error)
    result = error.stack || error.message || String(error)
  else if (error?.error) result = stringify(error.error, maxLength)
  else if (error?.message) result = String(error.message)
  else if (typeof error === "object") return JSON.stringify(error)
  else result = String(error)
  return result.length > maxLength ? result.slice(0, maxLength) + "..." : result
}
