import os from "os"

export const getOsLog = () => {
  const cpus = os.cpus()
  return {
    osType: os.type(), // Тип ОС (например, Windows_NT, Linux, Darwin)
    platform: os.platform(), // Платформа (win32, linux, darwin и т.д.)
    architecture: os.arch(), // Архитектура процессора (x64, arm и т.д.)
    release: os.release(), // Версия ОС
    hostname: os.hostname(), // Имя хоста
    uptime: os.uptime(), // Время работы системы в секундах
    totalMemory: (os.totalmem() / 1024 / 1024).toFixed(2) + " MB", // Общая память
    freeMemory: (os.freemem() / 1024 / 1024).toFixed(2) + " MB", // Свободная память
    cpuInfo: {
      model: cpus[0].model, // Модель процессора
      speed: cpus[0].speed + " MHz", // Скорость в МГц
      cores: cpus.length, // Количество ядер
    },
    homeDir: os.homedir(), // Домашняя директория пользователя
    tempDir: os.tmpdir(), // Папка временных файлов
  }
}
