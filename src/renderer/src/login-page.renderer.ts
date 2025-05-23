import "@renderer/styles/login-page.scss"
import { LoginEvents } from "@shared/events/login.events"
import { LoggerEvents } from "../../shared/events/logger.events"

document.addEventListener("DOMContentLoaded", () => {
  const authLink = `${import.meta.env.VITE_AUTH_APP_URL}recorder/auth?protocol_scheme=${import.meta.env.VITE_PROTOCOL_SCHEME}`
  const registrationLink = `${import.meta.env.VITE_AUTH_APP_URL}recorder/registration?protocol_scheme=${import.meta.env.VITE_PROTOCOL_SCHEME}`
  const authBtn = document.getElementById("auth-btn")!
  const registrationBtn = document.getElementById("registration-btn")!
  const recorderLogo = document.getElementById("recorder-logo")!
  recorderLogo.classList.add(import.meta.env.VITE_MODE)
  authBtn.addEventListener("click", (event) => {
    event.preventDefault()
    window.electronAPI.ipcRenderer.send("openLinkInBrowser", authLink)
  })
  registrationBtn.addEventListener("click", (event) => {
    event.preventDefault()
    window.electronAPI.ipcRenderer.send("openLinkInBrowser", registrationLink)
  })
})

// document.getElementById('loginForm').addEventListener('submit', (event) => {
//   event.preventDefault();
//
//   const username = document.getElementById('username').value;
//   const password = document.getElementById('password').value;
//   console.log(username)
//   // Отправляем данные логина на основной процесс
//   window.electronAPI.ipcRenderer.send('login-attempt', { username, password });
// });

window.electronAPI.ipcRenderer.on(LoginEvents.LOGIN_SUCCESS, () => {
  // alert('Login successful!');
  // Можно закрыть окно логина и открыть основное окно
})

window.electronAPI.ipcRenderer.on(LoginEvents.LOGIN_FAILED, () => {
  alert("Login failed. Try again.")
})

window.electronAPI.ipcRenderer.on(LoginEvents.TOKEN_CONFIRMED, (token) => {
  alert(token)
})

window.addEventListener("error", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `login-page.renderer Error`,
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack || "No stack trace",
    }),
    error: true,
  })
})

window.addEventListener("unhandledrejection", (event) => {
  window.electronAPI.ipcRenderer.send(LoggerEvents.SEND_LOG, {
    title: `login-page.renderer Unhandled Rejection`,
    body: JSON.stringify({
      message: event.reason.message || "Unknown rejection",
      stack: event.reason.stack || "No stack trace",
    }),
    error: true,
  })
})
