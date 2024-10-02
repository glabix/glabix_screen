import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  MediaAccessPermissionRequest,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  session,
  systemPreferences,
  Tray,
  dialog,
  Notification,
} from "electron"
import path from "path"
import os from "os"
import { getCurrentUser } from "./commands/current-user.command"
import { LoginEvents } from "./events/login.events"
import { FileUploadEvents } from "./events/file-upload.events"
import { uploadFileChunkCommand } from "./commands/upload-file-chunk.command"
import { createFileUploadCommand } from "./commands/create-file-upload.command"
import { ChunkSlicer } from "./file-uploader/chunk-slicer"
import { TokenStorage } from "./storages/token-storage"
import {
  IAuthData,
  IDropdownPageData,
  IDropdownPageSelectData,
  IMediaDevicesAccess,
  ISimpleStoreData,
  IUser,
  MediaDeviceType,
  SimpleStoreEvents,
} from "./helpers/types"
import { AppState } from "./storages/app-state"
import { SimpleStore } from "./storages/simple-store"
import log from "electron-log/main"
import { ChunkStorageService } from "./file-uploader/chunk-storage.service"
import { Chunk } from "./file-uploader/chunk"
import { autoUpdater } from "electron-updater"
import { getTitle } from "./helpers/get-title"
import { LogLevel, setLog } from "./helpers/set-log"

import { exec } from "child_process"
import positioner from "electron-traywindow-positioner"
import { openExternalLink } from "./helpers/open-external-link"
import { errorsInterceptor } from "./initializators/interceptor"
import { loggerInit } from "./initializators/logger.init"
import { UnprocessedFilesService } from "./unprocessed-file-resolver/unprocessed-files.service"
import { version } from "vite"
import { getVersion } from "./helpers/get-version"

const APP_ID = "com.glabix.screen"

let dropdownWindow: BrowserWindow
let dropdownWindowOffsetY = 0
let mainWindow: BrowserWindow
let modalWindow: BrowserWindow
let loginWindow: BrowserWindow
let contextMenu: Menu
let tray: Tray
let isAppQuitting = false
let deviceAccessInterval: NodeJS.Timeout
let checkForUpdatesInterval: NodeJS.Timeout
let checkUnloadedChunksInterval: NodeJS.Timeout
let checkUnprocessedFilesInterval: NodeJS.Timeout
let lastDeviceAccessData: IMediaDevicesAccess = {
  camera: false,
  microphone: false,
  screen: false,
}

const tokenStorage = new TokenStorage()
const appState = new AppState()
const store = new SimpleStore()
let unprocessedFilesService: UnprocessedFilesService
let chunkStorage: ChunkStorageService

app.setAppUserModelId(APP_ID)
app.removeAsDefaultProtocolClient("glabix-video-recorder")
app.commandLine.appendSwitch("force-compositing-mode")
app.commandLine.appendSwitch("enable-transparent-visuals")

loggerInit() // init logger
errorsInterceptor() // init req errors interceptor

const gotTheLock = app.requestSingleInstanceLock()
let lastCreatedFileName: string | null = null

function clearAllIntervals() {
  if (deviceAccessInterval) {
    clearInterval(deviceAccessInterval)
    deviceAccessInterval = undefined
  }

  if (checkForUpdatesInterval) {
    clearInterval(checkForUpdatesInterval)
    checkForUpdatesInterval = undefined
  }

  if (checkUnloadedChunksInterval) {
    clearInterval(checkUnloadedChunksInterval)
    checkUnloadedChunksInterval = undefined
  }

  if (checkUnprocessedFilesInterval) {
    clearInterval(checkUnprocessedFilesInterval)
    checkUnprocessedFilesInterval = undefined
  }
}

function init(url: string) {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    showWindows()
  }
  // const url = commandLine.pop()
  try {
    const u = new URL(url)
    const access_token = u.searchParams.get("access_token")
    const refresh_token = u.searchParams.get("refresh_token")
    let expires_at = u.searchParams.get("expires_at")
    const organization_id = u.searchParams.get("organization_id")
    if ((access_token, refresh_token, expires_at, organization_id)) {
      if (expires_at.includes("00:00") && !expires_at.includes("T00:00")) {
        //небольшой хак, чтобы дата распарсилась корректно
        expires_at = expires_at.replace("00:00", "+00:00") // Заменяем на корректный формат ISO
        expires_at = expires_at.replace(" ", "") // Заменяем на корректный формат ISO
      }
      const authData: IAuthData = {
        token: {
          access_token,
          refresh_token,
          expires_at,
        },
        organization_id: +organization_id,
      }
      loginWindow.show()
      ipcMain.emit(LoginEvents.TOKEN_CONFIRMED, authData)
    }
  } catch (e) {
    setLog(LogLevel.ERROR, `init`, e)
  }
}

function appReload() {
  if (app && app.isPackaged) {
    clearAllIntervals()

    app.relaunch()
    app.exit(0)
  }
}

function checkForUpdates() {
  const downloadNotification = {
    title: "Новое обновление готово к установке",
    body: "Версия {version} загружена и будет автоматически установлена при выходе из приложения",
  }
  autoUpdater.checkForUpdatesAndNotify(downloadNotification)
}

if (!gotTheLock) {
  app.quit()
} else {
  if (os.platform() == "darwin") {
    app.on("open-url", (event, url) => {
      init(url)
    })
  }
  if (os.platform() == "win32") {
    app.on("second-instance", (event, commandLine, workingDirectory) => {
      const url = commandLine.pop()
      init(url)
    })
  }

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.

  app.whenReady().then(() => {
    chunkStorage = new ChunkStorageService()
    unprocessedFilesService = new UnprocessedFilesService()
    lastDeviceAccessData = getMediaDevicesAccess()
    deviceAccessInterval = setInterval(watchMediaDevicesAccessChange, 2000)

    checkForUpdates()
    checkForUpdatesInterval = setInterval(checkForUpdates, 1000 * 60 * 60)

    setLog(LogLevel.INFO, "ENVS", JSON.stringify(import.meta.env))
    // ipcMain.handle(
    //   "get-screen-resolution",
    //   () => screen.getPrimaryDisplay().workAreaSize
    // )
    try {
      tokenStorage.readAuthData()
      createMenu()
    } catch (e) {
      setLog(LogLevel.ERROR, "tokenStorage.readAuthData:", e)
    }
    createWindow()

    chunkStorage.initStorages()
    checkUnprocessedChunks()
    checkUnprocessedFiles()
    checkUnprocessedFilesInterval = setInterval(() => {
      checkUnprocessedChunks()
    }, 1000 * 30)
    checkUnprocessedFilesInterval = setInterval(() => {
      checkUnprocessedFiles()
    }, 1000 * 60)

    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            // Grant access to the first screen found.
            callback({ video: sources[0], audio: "loopback" })
          })
          .catch((error) => {
            if (os.platform() == "darwin") {
              mainWindow.webContents
                .executeJavaScript(
                  'localStorage.getItem("_has_full_device_access_");',
                  true
                )
                .then((result) => {
                  if (result) {
                    exec(
                      'open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"'
                    )
                  }
                })
            }
            if (os.platform() == "win32") {
              exec("start ms-settings:privacy-broadfilesystem")
            }
            throw error
          })
      }
    )

    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        if (os.platform() == "darwin") {
          if (permission === "media") {
            const d = details as MediaAccessPermissionRequest
            const permissions = getMediaDevicesAccess()
            if (d.mediaTypes && d.mediaTypes.includes("video")) {
              if (permissions.camera) {
                callback(true)
              } else {
                callback(false)
                mainWindow.setAlwaysOnTop(true, "modal-panel")
                modalWindow.setAlwaysOnTop(true, "modal-panel")
                systemPreferences
                  .askForMediaAccess("camera")
                  .then((value) => {
                    if (value) {
                      appReload()
                    } else {
                      exec(
                        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"'
                      )
                      mainWindow.setAlwaysOnTop(true, "screen-saver")
                      modalWindow.setAlwaysOnTop(true, "screen-saver")
                    }
                  })
                  .catch((e) => {})
              }
            } else if (d.mediaTypes && d.mediaTypes.includes("audio")) {
              if (permissions.microphone) {
                callback(true)
              } else {
                callback(false)
                mainWindow.setAlwaysOnTop(true, "modal-panel")
                modalWindow.setAlwaysOnTop(true, "modal-panel")
                systemPreferences
                  .askForMediaAccess("microphone")
                  .then((value) => {
                    if (value) {
                      appReload()
                    } else {
                      exec(
                        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"'
                      )
                      mainWindow.setAlwaysOnTop(true, "screen-saver")
                      modalWindow.setAlwaysOnTop(true, "screen-saver")
                    }
                  })
                  .catch((e) => {})
              }
            } else {
              callback(true)
            }
          } else {
            callback(true)
          }
        } else {
          callback(true)
        }
      }
    )

    // session.defaultSession.setPermissionCheckHandler((webContents, permission, origin, details) => {
    //   // console.log('setPermissionCheckHandler>>>>>>>>>>', 'permission', permission, 'details', details, 'origin', origin)
    //   if (permission === 'media') {
    //     return false
    //   }

    //   return true
    // })
  })
}

function registerShortCuts() {
  globalShortcut.register("Command+H", () => {
    hideWindows()
  })
}

function unregisterShortCuts() {
  globalShortcut.unregisterAll()
}

function watchMediaDevicesAccessChange() {
  const currentMediaDeviceAccess = getMediaDevicesAccess()
  if (modalWindow) {
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      currentMediaDeviceAccess
    )
  }

  if (
    lastDeviceAccessData.camera !== currentMediaDeviceAccess.camera ||
    lastDeviceAccessData.microphone !== currentMediaDeviceAccess.microphone ||
    lastDeviceAccessData.screen !== currentMediaDeviceAccess.screen
  ) {
    lastDeviceAccessData = currentMediaDeviceAccess

    if (modalWindow) {
      modalWindow.webContents.send(
        "mediaDevicesAccess:get",
        currentMediaDeviceAccess
      )
    }
  }

  if (
    currentMediaDeviceAccess.camera &&
    currentMediaDeviceAccess.microphone &&
    currentMediaDeviceAccess.screen
  ) {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'localStorage.setItem("_has_full_device_access_", "true");'
      )
    }
    clearInterval(deviceAccessInterval)
    deviceAccessInterval = undefined
  }
}

function getMediaDevicesAccess(): IMediaDevicesAccess {
  const cameraAccess =
    systemPreferences.getMediaAccessStatus("camera") == "granted"
  const microphoneAccess =
    systemPreferences.getMediaAccessStatus("microphone") == "granted"
  const screenAccess =
    systemPreferences.getMediaAccessStatus("screen") == "granted"

  return {
    camera: cameraAccess,
    screen: screenAccess,
    microphone: microphoneAccess,
  }
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("glabix-video-recorder", process.execPath, [
      path.resolve(process.argv[1]),
    ])
  }
} else {
  app.setAsDefaultProtocolClient("glabix-video-recorder")
}

function checkUnprocessedFiles() {
  //todo
  setLog(LogLevel.SILLY, `check unprocessed files`)
  if (unprocessedFilesService.isProcessedNowFileName) {
    setLog(LogLevel.SILLY, `File is processed now!`)
    return
  }
  unprocessedFilesService
    .getFirstFileName()
    .then((firstUnprocessedFileName) => {
      if (firstUnprocessedFileName) {
        setLog(LogLevel.SILLY, `unprocessed file is`, firstUnprocessedFileName)
        ipcMain.emit(FileUploadEvents.TRY_CREATE_FILE_ON_SERVER, {
          rawFileName: firstUnprocessedFileName,
        })
      }
    })
}

function checkUnprocessedChunks() {
  setLog(LogLevel.SILLY, `check Unprocessed Chunks`)

  const chunkCurrentlyLoading = chunkStorage.chunkCurrentlyLoading
  if (chunkCurrentlyLoading) {
    setLog(
      LogLevel.SILLY,
      `chunkCurrentlyLoading ${chunkCurrentlyLoading.fileUuid} #${chunkCurrentlyLoading.index}`
    )
    return
  }
  if (chunkStorage.hasUnloadedFiles()) {
    setLog(LogLevel.SILLY, `chunkStorage has Unloaded Files`)
    const nextChunk = chunkStorage.getNextChunk()
    if (nextChunk) {
      setLog(
        LogLevel.SILLY,
        `Next chunk №${nextChunk.index} by file ${nextChunk.fileUuid}`
      )
      ipcMain.emit(FileUploadEvents.LOAD_FILE_CHUNK, {
        chunk: nextChunk,
      })
    } else {
      setLog(LogLevel.SILLY, `No next chunk`)
    }
  } else {
    setLog(LogLevel.SILLY, `No unprocessed chunks!`)
  }
}

function createWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds
  // Create the browser window.
  mainWindow = new BrowserWindow({
    transparent: true,
    frame: false,
    thickFrame: false,
    resizable: false,
    minimizable: false,
    roundedCorners: false, // macOS, not working on Windows
    show: false,
    alwaysOnTop: true,
    x,
    y,
    width,
    height,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      nodeIntegration: true, // Enable Node.js integration
      // contextIsolation: false, // Disable context isolation (not recommended for production)
    },
  })
  mainWindow.setBounds(screen.getPrimaryDisplay().bounds)

  if (os.platform() == "darwin") {
    mainWindow.setWindowButtonVisibility(false)
  }

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // mainWindow.setAlwaysOnTop(true, "screen-saver")
  mainWindow.setAlwaysOnTop(true, "screen-saver")

  // mainWindow.setFullScreenable(false)
  // mainWindow.setIgnoreMouseEvents(true, { forward: true })

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/index.html`)
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    )
  }
  mainWindow.webContents.setFrameRate(60)
  mainWindow.on("close", () => {
    app.quit()
  })
  createModal(mainWindow)
  createLoginWindow()
}

function createModal(parentWindow) {
  modalWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    width: 300,
    height: 395,
    show: false,
    alwaysOnTop: true,
    parent: parentWindow,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      nodeIntegration: true, // Enable Node.js integration
      // contextIsolation: false, // Disable context isolation (not recommended for production)
    },
  })
  // modalWindow.webContents.openDevTools()
  modalWindow.setAlwaysOnTop(true, "screen-saver")
  modalWindow.on("hide", () => {
    mainWindow.webContents.send("app:hide")
    modalWindow.webContents.send("modal-window:hide")
    dropdownWindow.hide()
  })
  modalWindow.on("ready-to-show", () => {
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      getMediaDevicesAccess()
    )
    modalWindow.webContents.send("app:version", app.getVersion())
  })
  modalWindow.on("show", () => {
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      getMediaDevicesAccess()
    )
    mainWindow.webContents.send("app:show")
  })
  modalWindow.on("blur", () => {
    // if (modalWindow.isAlwaysOnTop()) {
    //   if (modalWindow.isAlwaysOnTop()) {
    //     // mainWindow.focus()
    //   }
    // }
  })

  modalWindow.on("focus", () => {})

  modalWindow.on("close", (event) => {
    if (!isAppQuitting) {
      event.preventDefault()
      hideWindows()
    }
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    modalWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/modal.html`)
  } else {
    modalWindow
      .loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/modal.html`)
      )
      .then(() => {
        modalWindow.webContents.send("app:version", app.getVersion())
      })
  }

  createDropdownWindow(modalWindow)
}

function createDropdownWindow(parentWindow) {
  dropdownWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    fullscreen: false,
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    width: 300,
    height: 300,
    autoHideMenuBar: true,
    show: false,
    alwaysOnTop: true,
    parent: parentWindow,
    minimizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      nodeIntegration: true, // Enable Node.js integration
      // contextIsolation: false, // Disable context isolation (not recommended for production)
    },
  })
  // dropdownWindow.webContents.openDevTools()
  dropdownWindow.setAlwaysOnTop(true, "screen-saver")
  if (os.platform() == "darwin") {
    dropdownWindow.setWindowButtonVisibility(false)
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    dropdownWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/dropdown.html`)
  } else {
    dropdownWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/dropdown.html`)
    )
  }

  modalWindow.on("move", () => {
    const gap = 20
    const screenBounds = screen.getDisplayNearestPoint(
      modalWindow.getBounds()
    ).bounds
    const [modalX, modalY] = modalWindow.getPosition()
    const modalBounds = modalWindow.getBounds()
    const dropdownBounds = dropdownWindow.getBounds()
    const dropdownWindowWidth = 300

    const positionRight =
      modalBounds.x + modalBounds.width + dropdownBounds.width + gap
    const diffX = screenBounds.width - positionRight

    const x =
      diffX < 0
        ? modalX - dropdownWindowWidth - gap
        : modalX + modalBounds.width + gap
    const y = modalY + dropdownWindowOffsetY

    dropdownWindow.setBounds({ width: dropdownWindowWidth })
    dropdownWindow.setPosition(x, y)
    mainWindow.setBounds(screenBounds)
  })
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 390,
    height: 265,
    show: false,
    resizable: false,
    maximizable: false,
    frame: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    loginWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/login.html`)
  } else {
    loginWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/login.html`)
    )
  }

  loginWindow.once("ready-to-show", () => {
    showWindows()
  })

  loginWindow.on("close", (event) => {
    app.quit()
  })
}

function showWindows() {
  registerShortCuts()
  if (tokenStorage.dataIsActual()) {
    if (mainWindow) {
      mainWindow.show()
    }
    if (modalWindow) {
      modalWindow.show()
    }
  } else {
    if (loginWindow) loginWindow.show()
  }
}

function hideWindows() {
  unregisterShortCuts()
  if (tokenStorage.dataIsActual()) {
    if (mainWindow) mainWindow.hide()
    if (modalWindow) modalWindow.hide()
  } else {
    if (loginWindow) loginWindow.hide()
  }
}

function toggleWindows() {
  if (tokenStorage.dataIsActual()) {
    if (modalWindow.isVisible() && mainWindow.isVisible()) {
      hideWindows()
    } else {
      showWindows()
    }
  } else {
    if (loginWindow.isVisible()) {
      hideWindows()
    } else {
      showWindows()
    }
  }
}

function createTrayIcon(): Electron.NativeImage {
  let imagePath = "tray-win.png"

  if (os.platform() == "darwin") {
    imagePath = nativeTheme.shouldUseDarkColors
      ? "tray-macos-light.png"
      : "tray-macos-dark.png"
  }

  const icon = nativeImage
    .createFromPath(path.join(__dirname, imagePath))
    .resize({ width: 20, height: 20 })

  if (os.platform() == "darwin") {
    icon.setTemplateImage(true)
  }

  return icon
}

function createMenu() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip("Glabix Экран")

  nativeTheme.on("updated", () => {
    tray.setImage(createTrayIcon())
  })

  tray.on("click", (e) => {
    const state = store.get()

    if (["recording", "paused"].includes(state["recordingState"])) {
      return
    }

    if (modalWindow) {
      const modalTrayPosition = positioner.calculate(
        modalWindow.getBounds(),
        tray.getBounds(),
        { x: "right", y: "up" }
      )

      modalWindow.setPosition(modalTrayPosition.x, modalTrayPosition.y)
    }

    toggleWindows()
  })

  tray.on("right-click", (e) => {
    tray.popUpContextMenu(contextMenu)
  })

  contextMenu = Menu.buildFromTemplate([
    {
      id: "menuLogOutItem",
      label: "Выйти из аккаунта",
      visible: tokenStorage.dataIsActual(),
      click: () => {
        tokenStorage.reset()
        mainWindow.hide()
        modalWindow.hide()
        loginWindow.show()
      },
    },
    {
      label: "Закрыть приложение",
      click: () => {
        app.quit()
      },
    },
  ])
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on("before-quit", () => {
  clearAllIntervals()
  unregisterShortCuts()
  isAppQuitting = true
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ipcMain.on("mediaDevicesAccess:check", (event) => {
//   watchMediaDevicesAccessChange()
// })
ipcMain.on("set-ignore-mouse-events", (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win.setIgnoreMouseEvents(ignore, options)
})

ipcMain.on("modal-window:render", (event, data) => {
  if (modalWindow) {
    modalWindow.webContents.send("modal-window:render", data)
  }
})

ipcMain.on(
  "modal-window:resize",
  (event, data: { width: number; height: number; alwaysOnTop: boolean }) => {
    if (modalWindow) {
      modalWindow.setBounds({ width: data.width, height: data.height })

      if (!data.alwaysOnTop && !deviceAccessInterval) {
        deviceAccessInterval = setInterval(watchMediaDevicesAccessChange, 2000)
      }

      if (os.platform() == "darwin") {
        if (data.alwaysOnTop) {
          mainWindow.setAlwaysOnTop(true, "screen-saver")
          modalWindow.setAlwaysOnTop(true, "screen-saver")
        } else {
          mainWindow.setAlwaysOnTop(true, "modal-panel")
          modalWindow.setAlwaysOnTop(true, "modal-panel")
        }
      }
    }
  }
)

ipcMain.on("system-settings:open", (event, device: MediaDeviceType) => {
  // if (os.platform() == "darwin") {
  //   if (device == "microphone") {
  //     exec(
  //       'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"'
  //     )
  //   }

  //   if (device == "camera") {
  //     exec(
  //       'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"'
  //     )
  //   }
  // }
  if (os.platform() == "win32") {
    if (device == "microphone") {
      exec("start ms-settings:privacy-microphone")
    }

    if (device == "camera") {
      exec("start ms-settings:privacy-webcam")
    }

    if (device == "screen") {
      exec("start ms-settings:privacy-broadfilesystem")
    }
  }
})
ipcMain.on("record-settings-change", (event, data) => {
  mainWindow.webContents.send("record-settings-change", data)
})

ipcMain.on("dropdown:close", (event, data) => {
  dropdownWindow.hide()
})
ipcMain.on("dropdown:select", (event, data: IDropdownPageSelectData) => {
  modalWindow.webContents.send("dropdown:select", data)
  dropdownWindow.hide()
})

ipcMain.on("dropdown:open", (event, data: IDropdownPageData) => {
  const dropdownWindowBounds = dropdownWindow.getBounds()
  const modalWindowBounds = modalWindow.getBounds()
  const screenBounds = screen.getPrimaryDisplay().bounds
  const gap = 20
  const itemHeight = 48
  const height = data.list.items.length * itemHeight
  const positionRight =
    modalWindowBounds.x +
    modalWindowBounds.width +
    dropdownWindowBounds.width +
    gap
  const positionY = modalWindowBounds.y + data.offsetY
  const diffX = screenBounds.width - positionRight
  dropdownWindowOffsetY = data.offsetY

  if (diffX < 0) {
    dropdownWindow.setPosition(
      modalWindowBounds.x - dropdownWindowBounds.width - gap,
      positionY
    )
  } else {
    dropdownWindow.setPosition(
      modalWindowBounds.x + modalWindowBounds.width + gap,
      positionY
    )
  }

  if (height) {
    dropdownWindow.setBounds({ height })
  }

  dropdownWindow.show()
  dropdownWindow.webContents.send("dropdown:open", data)
})

ipcMain.on("start-recording", (event, data) => {
  mainWindow.webContents.send("start-recording", data)
  modalWindow.hide()
})
ipcMain.on("stop-recording", (event, data) => {
  mainWindow.webContents.send("stop-recording")
  modalWindow.show()
})
ipcMain.on("windows:minimize", (event, data) => {
  modalWindow.close()
})
ipcMain.on("windows:close", (event, data) => {
  modalWindow.close()
})

ipcMain.on(SimpleStoreEvents.UPDATE, (event, data: ISimpleStoreData) => {
  const { key, value } = data
  store.set(key, value)
  mainWindow.webContents.send(SimpleStoreEvents.CHANGED, store.get())
  modalWindow.webContents.send(SimpleStoreEvents.CHANGED, store.get())
})

ipcMain.on("main-window-focus", (event, data) => {
  if (modalWindow && modalWindow.isAlwaysOnTop()) {
    mainWindow.focus()
  }
})

ipcMain.on("invalidate-shadow", (event, data) => {
  if (os.platform() == "darwin") {
    mainWindow.invalidateShadow()
  }
})

ipcMain.on(LoginEvents.LOGIN_SUCCESS, (event) => {
  setLog(LogLevel.SILLY, `LOGIN_SUCCESS`)
  contextMenu.getMenuItemById("menuLogOutItem").visible = true
  loginWindow.hide()
  mainWindow.show()
  modalWindow.show()
})

ipcMain.on(LoginEvents.TOKEN_CONFIRMED, (event) => {
  setLog(LogLevel.SILLY, `TOKEN_CONFIRMED`)
  const { token, organization_id } = event as IAuthData
  tokenStorage.encryptAuthData({ token, organization_id })
  getCurrentUser(tokenStorage.token.access_token)
})

ipcMain.on(LoginEvents.USER_VERIFIED, (event) => {
  setLog(LogLevel.SILLY, `USER_VERIFIED`)
  const user = event as IUser
  appState.set({ ...appState.state, user })
  ipcMain.emit(LoginEvents.LOGIN_SUCCESS)
})

ipcMain.on(FileUploadEvents.RECORD_CREATED, (event, file) => {
  const blob = new Blob([file], { type: "video/mp4" })
  unprocessedFilesService
    .saveFileWithStreams(blob, Date.now() + "")
    .then((rawFileName) => {
      lastCreatedFileName = rawFileName
      ipcMain.emit(FileUploadEvents.TRY_CREATE_FILE_ON_SERVER, { rawFileName })
    })
})

ipcMain.on(FileUploadEvents.TRY_CREATE_FILE_ON_SERVER, (event) => {
  setLog(LogLevel.SILLY, `Try to create multipart upload on server`)
  const { rawFileName: timestampRawFileName } = event

  console.log("event", event)
  unprocessedFilesService.isProcessedNowFileName = timestampRawFileName
  unprocessedFilesService.getFile(timestampRawFileName).then((file) => {
    if (file) {
      const appVersion = getVersion()
      const fileSize = file.length
      const size = 10 * 1024 * 1024
      const chunksSlicer = new ChunkSlicer(file, size)
      const chunks = [...chunksSlicer.allChunks]
      const title = getTitle(timestampRawFileName)
      const fileName = title + ".mp4"
      const callback = (err, uuid: string) => {
        if (!err) {
          const params = { uuid, chunks, rawFileName: timestampRawFileName }
          console.log(params)
          setLog(LogLevel.SILLY, `Create multipart file upload SUCCESS`, uuid)
          ipcMain.emit(FileUploadEvents.FILE_CREATED_ON_SERVER, params)
        } else {
          setLog(
            LogLevel.ERROR,
            "FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR callback error:",
            err
          )
          const params = { filename: fileName, fileChunks: [...chunks] }
          ipcMain.emit(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, params)
        }
      }
      createFileUploadCommand(
        tokenStorage.token.access_token,
        tokenStorage.organizationId,
        fileName,
        chunks.length,
        title,
        fileSize,
        appVersion,
        callback
      )
    }
  })
})

ipcMain.on(FileUploadEvents.FILE_CREATED_ON_SERVER, (event) => {
  const { uuid, chunks, rawFileName } = event
  setLog(
    LogLevel.SILLY,
    `File-${uuid} created on server, chunks length ${chunks?.length}`
  )
  chunkStorage.addStorage(chunks, uuid).then(() => {
    unprocessedFilesService.deleteFile(rawFileName).then(() => {
      unprocessedFilesService.isProcessedNowFileName = null
      checkUnprocessedFiles()
      checkUnprocessedChunks()
      // todo
    })
  })
  const shared =
    import.meta.env.VITE_AUTH_APP_URL +
    "recorder/org/" +
    tokenStorage.organizationId +
    "/" +
    "library/" +
    uuid
  if (lastCreatedFileName === rawFileName) {
    openExternalLink(shared)
  } else {
    if (Notification.isSupported()) {
      const notification = new Notification({
        body: `Запись экрана ${getTitle(rawFileName)} загружается на на сервер, и будет доступна для просмотра после обработки. Нажмите на уведомление, чтобы открыть в браузере`,
      })
      notification.show()
      notification.on("click", () => {
        // Открываем ссылку в браузере
        openExternalLink(shared)
      })
      setTimeout(() => {
        notification.close() // Закрытие уведомления через 5 секунд
      }, 5000) // 5000 миллисекунд = 5 секунд
    }
  }
  lastCreatedFileName = null
})

ipcMain.on(FileUploadEvents.LOAD_FILE_CHUNK, (event) => {
  const { chunk } = event
  const typedChunk = chunk as Chunk
  const uuid = typedChunk.fileUuid
  const chunkNumber = typedChunk.index + 1
  setLog(LogLevel.SILLY, `Chunk ${chunkNumber} by file-${uuid} start upload`)
  const callback = (err, data) => {
    typedChunk.cancelProcess()
    if (!err) {
      chunkStorage
        .removeChunk(typedChunk)
        .then(() => {
          setLog(
            LogLevel.SILLY,
            `Chunk ${chunkNumber} by file-${uuid} was uploaded`
          )
          ipcMain.emit(FileUploadEvents.FILE_CHUNK_UPLOADED, {
            uuid,
            chunkNumber,
          })
        })
        .catch((e) => {
          setLog(
            LogLevel.ERROR,
            `FileUploadEvents.LOAD_FILE_CHUNK chunkStorage.removeChunk catch((e)`,
            e
          )
        })
    } else {
      setLog(
        LogLevel.ERROR,
        "FileUploadEvents.LOAD_FILE_CHUNK callback error:",
        err
      )
    }
  }
  typedChunk.getData().then((data) => {
    typedChunk.startProcess()
    uploadFileChunkCommand(
      tokenStorage.token.access_token,
      tokenStorage.organizationId,
      uuid,
      data,
      chunkNumber,
      callback
    )
  })
})

ipcMain.on(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, (event) => {
  const { filename, fileChunks } = event
  if (lastCreatedFileName === rawFileName) {
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Ошибка. Не удалось загрузить файл на сервер",
      message:
        "Загрузка файла будет повторяться в фоновом процессе, пока он не будет отправлен на сервер. Как только файл будет загружен, вы увидите его в своей библиотеке.",
    })
  }

  unprocessedFilesService.isProcessedNowFileName = null
})

ipcMain.on(FileUploadEvents.FILE_CHUNK_UPLOADED, (event) => {
  const { uuid, chunkNumber } = event
  setLog(
    LogLevel.SILLY,
    `FileUploadEvents.FILE_CHUNK_UPLOADED: ${chunkNumber} by file ${uuid} uploaded`
  )
  checkUnprocessedChunks()
})

ipcMain.on(LoginEvents.LOGOUT, (event) => {
  contextMenu.getMenuItemById("menuLogOutItem").visible = false
})

ipcMain.on("log", (evt, data) => {
  setLog(LogLevel.DEBUG, data)
})
