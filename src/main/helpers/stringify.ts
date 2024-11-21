export const stringify = (obj) => {
  if (!obj) return obj
  let res = ""
  try {
    res = JSON.stringify(obj).slice(0, 2000)
  } catch (e) {
    res = obj.toString().slice(0, 2000)
  }
  return res
}
