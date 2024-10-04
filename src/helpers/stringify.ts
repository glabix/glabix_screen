export const stringify = (obj) => {
  function removeCircularReferences(obj, seen = new WeakSet()) {
    if (obj && typeof obj === "object") {
      if (seen.has(obj)) {
        return
      }
      seen.add(obj)
      for (const key in obj) {
        if (obj.hasOwn(key)) {
          obj[key] = removeCircularReferences(obj[key], seen)
        }
      }
    }
    return obj
  }

  const cleanObject = removeCircularReferences(obj)
  return JSON.stringify(cleanObject)
}
