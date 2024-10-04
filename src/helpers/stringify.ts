export const stringify = (obj) => {
  let res = ""
  try {
    res = JSON.stringify(obj).slice(0, 300)
  } catch (e) {
    res = e.toString().slice(0, 300)
  }
  return res
}
