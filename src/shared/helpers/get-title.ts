export function getTitle(ts = Date.now(), isScreenshot = false) {
  const date = new Date(+ts)
  const type = isScreenshot ? "Скриншот" : "Экран"
  // Массивы для месяцев и дней
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ]

  const options: Intl.DateTimeFormatOptions = isScreenshot
    ? {}
    : { hour: "2-digit", minute: "2-digit", hour12: false }
  const dateString = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
  const timeString = date.toLocaleTimeString("ru-RU", options)
  return `${type} — ${dateString}, ${timeString}`
}
