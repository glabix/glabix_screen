export const stringify = (obj) => {
  let res = ""
  try {
    res = JSON.stringify(obj)
  } catch (e) {
    res = e.toString()
  }
  return res
}
