export function getTitle(ts = Date.now()) {
  const date = new Date(+ts)

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

  const options = { hour: "2-digit", minute: "2-digit", hour12: false }
  const dateString = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
  const timeString = date.toLocaleTimeString("ru-RU", options)
  return `Экран — ${dateString}, ${timeString}`
}
