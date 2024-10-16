import "@renderer/styles/login-page.scss"
import { LoginEvents } from "@shared/events/login.events"

document.addEventListener("DOMContentLoaded", () => {
  const authLink = import.meta.env.VITE_AUTH_APP_URL + "recorder/auth"
  const registrationLink =
    import.meta.env.VITE_AUTH_APP_URL + "recorder/registration"
  const authBtn = document.getElementById("auth-btn")
  const registrationBtn = document.getElementById("registration-btn")
  const recorderLogo = document.getElementById("recorder-logo")
  authBtn.addEventListener("click", (event) => {
    event.preventDefault()
    window.api.openLinkInBrowser(authLink)
  })
  registrationBtn.addEventListener("click", (event) => {
    event.preventDefault()
    window.api.openLinkInBrowser(registrationLink)
  })
  if (import.meta.env.VITE_MODE === "dev") {
    recorderLogo.style.color = "#d91615"
  }
  if (import.meta.env.VITE_MODE === "review") {
    recorderLogo.style.color = "#01a0e3"
  }
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
