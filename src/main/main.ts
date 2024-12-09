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
  Rectangle,
  clipboard,
} from "electron"
import path, { join } from "path"
import os from "os"
import { getCurrentUser } from "./commands/current-user.command"
import { LoginEvents } from "@shared/events/login.events"
import { FileUploadEvents } from "@shared/events/file-upload.events"
import { uploadFileChunkCommand } from "./commands/upload-file-chunk.command"
import { createFileUploadCommand } from "./commands/create-file-upload.command"
import { ChunkSlicer } from "./file-uploader/chunk-slicer"
import { TokenStorage } from "./storages/token-storage"
import {
  IAuthData,
  IDropdownPageData,
  IDropdownPageSelectData,
  IOrganizationLimits,
  IMediaDevicesAccess,
  ISimpleStoreData,
  IUser,
  MediaDeviceType,
  SimpleStoreEvents,
  ModalWindowHeight,
  IScreenshotImageData,
} from "@shared/types/types"
import { AppState } from "./storages/app-state"
import { SimpleStore } from "./storages/simple-store"
import { ChunkStorageService } from "./file-uploader/chunk-storage.service"
import { Chunk } from "./file-uploader/chunk"
import { getAutoUpdater } from "./helpers/auto-updater-factory"
import { getTitle } from "@shared/helpers/get-title"
import { LogLevel, setLog } from "./helpers/set-log"
import { getOrganizationLimits } from "./commands/organization-limits.query"
import { APIEvents } from "@shared/events/api.events"
import { exec } from "child_process"
import positioner from "electron-traywindow-positioner"
import { openExternalLink } from "@shared/helpers/open-external-link"
import { errorsInterceptor } from "./initializers/interceptor"
import { loggerInit } from "./initializers/logger.init"
import { UnprocessedFilesService } from "./unprocessed-file-resolver/unprocessed-files.service"
import { getVersion } from "./helpers/get-version"
import { LogSender } from "./helpers/log-sender"
import { LoggerEvents } from "@shared/events/logger.events"
import { stringify } from "./helpers/stringify"
import { optimizer, is } from "@electron-toolkit/utils"
import { getScreenshot } from "./helpers/get-screenshot"
import { dataURLToFile } from "./helpers/dataurl-to-file"
import { FULL_SCREENSHOT_DATA } from "@shared/helpers/mock"
import { RecordEvents } from "../shared/events/record.events"
import { getOsLog } from "./helpers/get-os-log"
import { showRecordErrorBox } from "./helpers/show-record-error-box"
import { uploadScreenshotCommand } from "./commands/upload-screenshot.command"

let activeDisplay: Electron.Display
let dropdownWindow: BrowserWindow
let screenshotWindow: BrowserWindow
let mainWindow: BrowserWindow
let modalWindow: BrowserWindow
let loginWindow: BrowserWindow
let contextMenu: Menu
let tray: Tray
let isAppQuitting = false
let deviceAccessInterval: NodeJS.Timeout | undefined
let checkForUpdatesInterval: NodeJS.Timeout | undefined
let checkUnloadedChunksInterval: NodeJS.Timeout | undefined
let checkUnprocessedFilesInterval: NodeJS.Timeout | undefined
let lastDeviceAccessData: IMediaDevicesAccess = {
  camera: false,
  microphone: false,
  screen: false,
}

const tokenStorage = new TokenStorage()
const logSender = new LogSender(tokenStorage)
const chunkSize = 10 * 1024 * 1024

const appState = new AppState()
const store = new SimpleStore()
let unprocessedFilesService: UnprocessedFilesService
let chunkStorage: ChunkStorageService

app.setAppUserModelId(import.meta.env.VITE_APP_ID)
app.removeAsDefaultProtocolClient(import.meta.env.VITE_PROTOCOL_SCHEME)
app.commandLine.appendSwitch("enable-transparent-visuals")
app.commandLine.appendSwitch("disable-software-rasterizer")
// app.commandLine.appendSwitch("disable-gpu-compositing")

getAutoUpdater().on("update-downloaded", (info) => {
  logSender.sendLog(
    "app_update.download_complete",
    JSON.stringify({ old_version: getVersion(), new_version: info.version })
  )
})
getAutoUpdater().on("download-progress", (info) => {
  if (info.percent === 0) {
    logSender.sendLog(
      "app_update.download_started",
      JSON.stringify({
        old_version: getVersion(),
        new_version: (info as any).version,
      })
    )
  }
})

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
  if (!url.startsWith(import.meta.env.VITE_PROTOCOL_SCHEME)) {
    return
  }

  if (mainWindow) {
    // Someone tried to run a second instance, we should focus our window.
    checkOrganizationLimits().then(() => {
      showWindows()
    })
  }
  // const url = commandLine.pop()
  try {
    const u = new URL(url)
    const access_token = u.searchParams.get("access_token")
    const refresh_token = u.searchParams.get("refresh_token")
    let expires_at = u.searchParams.get("expires_at")
    const organization_id = u.searchParams.get("organization_id")
    if (organization_id) {
      if (expires_at!.includes("00:00") && !expires_at!.includes("T00:00")) {
        //небольшой хак, чтобы дата распарсилась корректно
        expires_at = expires_at!.replace("00:00", "+00:00") // Заменяем на корректный формат ISO
        expires_at = expires_at.replace(" ", "") // Заменяем на корректный формат ISO
      }
      const authData: IAuthData = {
        token: {
          access_token: access_token!,
          refresh_token: refresh_token!,
          expires_at: expires_at!,
        },
        organization_id: +organization_id,
      }
      showWindows()
      ipcMain.emit(LoginEvents.TOKEN_CONFIRMED, authData)
    }
  } catch (e) {
    logSender.sendLog("init_function.error", stringify({ url, e }), true)
  }
}

function appReload() {
  if (app && app.isPackaged) {
    clearAllIntervals()

    app.relaunch()
    app.exit(0)
  }
}

function checkOrganizationLimits(): Promise<any> {
  return new Promise((resolve) => {
    if (tokenStorage && tokenStorage.dataIsActual()) {
      getOrganizationLimits(
        tokenStorage.token!.access_token,
        tokenStorage.organizationId!
      )
        .then(() => {
          resolve(true)
        })
        .catch((e) => {
          resolve(true)
        })
    } else {
      resolve(true)
    }
  })
}

function checkForUpdates() {
  const downloadNotification = {
    title: "Новое обновление готово к установке",
    body: "Версия {version} загружена и будет автоматически установлена при выходе из приложения",
  }
  getAutoUpdater().checkForUpdatesAndNotify(downloadNotification)
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
      init(url!)
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

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    setLog(LogLevel.INFO, "ENVS", JSON.stringify(import.meta.env))
    setLog(LogLevel.INFO, "OS", JSON.stringify(getOsLog()))
    // ipcMain.handle(
    //   "get-screen-resolution",
    //   () => screen.getPrimaryDisplay().workAreaSize
    // )
    try {
      logSender.sendLog("user.read_auth_data")
      tokenStorage.readAuthData()
      logSender.sendLog("app.started")
      createMenu()

      setTimeout(() => {
        showWindows()
      })
    } catch (e) {
      logSender.sendLog("user.read_auth_data.error", stringify({ e }), true)
    }

    createWindow()

    chunkStorage.initStorages().then(() => {
      checkUnprocessedChunks(true)
    })
    checkUnprocessedFiles(true)

    checkUnloadedChunksInterval = setInterval(() => {
      checkUnprocessedChunks(true)
    }, 1000 * 30)
    checkUnprocessedFilesInterval = setInterval(() => {
      checkUnprocessedFiles(true)
    }, 1000 * 60)

    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            // Grant access to the first screen found.
            let screen = sources[0]

            if (activeDisplay) {
              screen =
                sources.find((s) => Number(s.display_id) == activeDisplay.id) ||
                sources[0]
            }

            callback({ video: screen, audio: "loopback" })
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

    registerShortCuts()
  })
}

function registerShortCuts() {
  globalShortcut.register("CommandOrControl+Shift+6", () => {
    createScreenshot()
  })

  globalShortcut.register("CommandOrControl+Shift+5", () => {
    if (tokenStorage && tokenStorage.dataIsActual()) {
      modalWindow.webContents.send("dropdown:select", {
        action: "cropScreenshot",
      })
      dropdownWindow.hide()
      modalWindow.hide()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}
function registerShortCutsOnShow() {
  globalShortcut.register("Command+H", () => {
    hideWindows()
  })
}

function unregisterShortCutsOnHide() {
  globalShortcut.unregister("Command+H")
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
    app.setAsDefaultProtocolClient(
      import.meta.env.VITE_PROTOCOL_SCHEME,
      process.execPath,
      [path.resolve(process.argv[1]!)]
    )
  }
} else {
  app.setAsDefaultProtocolClient(import.meta.env.VITE_PROTOCOL_SCHEME)
}

function checkUnprocessedFiles(byTimer = false) {
  //todo
  if (lastCreatedFileName) {
    setLog(LogLevel.SILLY, `File is recorded now!`)
    return
  }
  if (unprocessedFilesService.isProcessedNowFileName) {
    setLog(LogLevel.SILLY, `File is processed now!`)
    return
  }
  unprocessedFilesService
    .getFirstFileName()
    .then((firstUnprocessedFileName) => {
      if (firstUnprocessedFileName) {
        if (byTimer) {
          logSender.sendLog(
            "raw_file.autoloader.fire",
            JSON.stringify({ file: firstUnprocessedFileName })
          )
        }
        ipcMain.emit(FileUploadEvents.TRY_CREATE_FILE_ON_SERVER, {
          rawFileName: firstUnprocessedFileName,
        })
      }
    })
}

function checkUnprocessedChunks(timer = false) {
  const chunkCurrentlyLoading = chunkStorage.chunkCurrentlyLoading
  if (!chunkStorage._storagesInit) {
    setLog(LogLevel.SILLY, `Chunk Storage not ready now!`)
    return
  }
  if (chunkCurrentlyLoading) {
    setLog(
      LogLevel.SILLY,
      `chunkCurrentlyLoading ${chunkCurrentlyLoading.fileUuid} #${chunkCurrentlyLoading.index}`
    )
    return
  }
  if (chunkStorage.hasUnloadedFiles()) {
    if (timer) {
      logSender.sendLog("chunks.autoloader.fire")
    }
    setLog(LogLevel.SILLY, `chunkStorage has Unloaded Files`)
    const nextChunk = chunkStorage.getNextChunk()
    if (nextChunk) {
      ipcMain.emit(FileUploadEvents.LOAD_FILE_CHUNK, {
        chunk: nextChunk,
      })
    } else {
      setLog(LogLevel.SILLY, `No next chunk`)
    }
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
      preload: join(import.meta.dirname, "../preload/preload.mjs"),
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      nodeIntegration: true, // Enable Node.js integration
      // contextIsolation: false, // Disable context isolation (not recommended for production)
    },
  })
  mainWindow.setBounds(screen.getPrimaryDisplay().bounds)
  activeDisplay = screen.getDisplayNearestPoint(mainWindow.getBounds())

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

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    mainWindow.loadFile(join(import.meta.dirname, "../renderer/index.html"))
  }

  mainWindow.webContents.setFrameRate(60)
  mainWindow.on("close", () => {
    app.quit()
  })

  mainWindow.on("blur", () => {})
  createModal(mainWindow)
  createLoginWindow()

  // SCREENSHOT
  // createScreenshotWindow(FULL_SCREENSHOT_DATA.url)
}

function createModal(parentWindow) {
  modalWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    width: 300,
    height:
      os.platform() == "win32" ? ModalWindowHeight.WIN : ModalWindowHeight.MAC,
    show: false,
    alwaysOnTop: true,
    parent: parentWindow,
    minimizable: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"),
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
    checkOrganizationLimits()
  })
  modalWindow.on("ready-to-show", () => {
    checkOrganizationLimits()
    modalWindow.webContents.send("app:version", app.getVersion())
  })

  modalWindow.on("show", () => {
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      getMediaDevicesAccess()
    )
    mainWindow.webContents.send("app:show")
    modalWindow.webContents.send("app:version", app.getVersion())
    checkOrganizationLimits()
  })

  modalWindow.on("blur", () => {})

  modalWindow.on("focus", () => {})

  modalWindow.on("close", (event) => {
    if (!isAppQuitting) {
      event.preventDefault()
      hideWindows()
    }
  })

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    modalWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/modal.html`)
  } else {
    modalWindow
      .loadFile(join(import.meta.dirname, "../renderer/modal.html"))
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
      preload: join(import.meta.dirname, "../preload/preload.mjs"),
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

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    dropdownWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/dropdown.html`
    )
  } else {
    dropdownWindow
      .loadFile(join(import.meta.dirname, "../renderer/dropdown.html"))
      .then(() => {
        dropdownWindow.webContents.send("app:version", app.getVersion())
      })
  }

  dropdownWindow.on("hide", () => {
    modalWindow.webContents.send("dropdown:hide", {})
  })

  modalWindow.on("move", () => {
    const currentScreen = screen.getDisplayNearestPoint(modalWindow.getBounds())

    if (activeDisplay && activeDisplay.id != currentScreen.id) {
      mainWindow.webContents.send("screen:change", currentScreen)
    }

    activeDisplay = currentScreen
    const screenBounds = activeDisplay.bounds
    dropdownWindow.hide()
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
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  })

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    loginWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/login.html`)
  } else {
    loginWindow
      .loadFile(join(import.meta.dirname, "../renderer/login.html"))
      .then(() => {
        loginWindow.webContents.send("app:version", app.getVersion())
      })
  }
}

function createScreenshotWindow(dataURL: string) {
  if (screenshotWindow) {
    screenshotWindow.destroy()
  }

  const currentScreen = screen.getDisplayNearestPoint(mainWindow.getBounds())
  const screenBounds = currentScreen.bounds
  const screenScaleFactor = currentScreen.scaleFactor

  const imageSize = nativeImage
    .createFromDataURL(dataURL)
    .getSize(screenScaleFactor)
  const minWidth = 750
  const minHeight = 400
  const maxWidth = 0.8 * screenBounds.width
  const maxHeight = 0.8 * screenBounds.height
  const imageWidth = imageSize.width
  const imageHeight = imageSize.height
  const imageScaleWidth = Math.ceil(imageWidth / screenScaleFactor)
  const imageScaleHeight = Math.ceil(imageHeight / screenScaleFactor)
  const imageData: IScreenshotImageData = {
    scale: screenScaleFactor,
    width: imageWidth,
    height: imageHeight,
    url: dataURL,
  }

  let width = minWidth
  let height = minHeight

  if (imageScaleWidth > maxWidth) {
    width = maxWidth
  }

  if (imageScaleWidth < maxWidth && imageScaleWidth > minWidth) {
    width = imageScaleWidth
  }

  if (imageScaleHeight > maxHeight) {
    height = maxHeight
  }

  if (imageScaleHeight < maxHeight && imageScaleHeight > minHeight) {
    height = imageScaleHeight
  }

  const mainWindowBounds = screenBounds
  const x = mainWindowBounds.x + (mainWindowBounds.width - width) / 2
  const y = mainWindowBounds.y + (mainWindowBounds.height - height - 64) / 2
  const bounds: Electron.Rectangle = { x, y, width, height: height + 64 }

  hideWindows()

  screenshotWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    fullscreenable: false,
    maximizable: false,
    // resizable: false,
    minimizable: false,
    width: bounds.width,
    height: bounds.height,
    minWidth: minWidth,
    minHeight: minHeight,
    x: bounds.x,
    y: bounds.y,
    show: false,
    // frame: false,
    roundedCorners: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  })

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    screenshotWindow
      .loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/screenshot.html`)
      .then(() => {
        screenshotWindow.webContents.send("screenshot:getImage", imageData)
        screenshotWindow.show()
        screenshotWindow.moveTop()
        logSender.sendLog(
          "screenshotWindow.show - getBounds():",
          JSON.stringify(screenshotWindow.getBounds())
        )
      })
  } else {
    screenshotWindow
      .loadFile(join(import.meta.dirname, "../renderer/screenshot.html"))
      .then(() => {
        screenshotWindow.webContents.send("screenshot:getImage", imageData)
        screenshotWindow.show()
        screenshotWindow.moveTop()
        logSender.sendLog(
          "screenshotWindow.show - getBounds():",
          JSON.stringify(screenshotWindow.getBounds())
        )
      })
  }
}

function showWindows() {
  logSender.sendLog("app.activated")
  registerShortCutsOnShow()
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
  logSender.sendLog("app.disactivated")
  unregisterShortCutsOnHide()
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
  let iconName = ""

  if (os.platform() == "win32") {
    switch (import.meta.env.VITE_MODE) {
      case "dev":
        iconName = "tray-win-dev.png"
        break
      case "review":
        iconName = "tray-win-review.png"
        break
      case "production":
      default:
        iconName = "tray-win.png"
        break
    }
  }

  if (os.platform() == "darwin") {
    switch (import.meta.env.VITE_MODE) {
      case "dev":
        iconName = "tray-macos-dev.png"
        break
      case "review":
        iconName = "tray-macos-review.png"
        break
      case "production":
      default:
        iconName = nativeTheme.shouldUseDarkColors
          ? "tray-macos-light.png"
          : "tray-macos-dark.png"
        break
    }
  }

  const icon = nativeImage
    .createFromPath(
      path.join(import.meta.dirname, "../../resources/icons", iconName)
    )
    .resize({ width: 20, height: 20 })

  if (os.platform() == "darwin" && import.meta.env.VITE_MODE == "production") {
    icon.setTemplateImage(true)
  }

  return icon
}

function createMenu() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip(import.meta.env.VITE_PRODUCT_NAME)

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
        logOut()
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

function logOut() {
  tokenStorage.reset()
  mainWindow.hide()
  modalWindow.hide()
  loginWindow.show()
}
function createScreenshot(crop?: Rectangle) {
  getScreenshot(activeDisplay, crop)
    .then((dataUrl) => {
      createScreenshotWindow(dataUrl)
    })
    .catch((e) => {})
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
    logSender.sendLog("app.activated")
    createWindow()
  }
})

app.on("before-quit", () => {
  logSender.sendLog("app.exited")
  clearAllIntervals()
  globalShortcut.unregisterAll()
  isAppQuitting = true
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ipcMain.on("mediaDevicesAccess:check", (event) => {
//   watchMediaDevicesAccessChange()
// })

ipcMain.on("ignore-mouse-events:set", (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.setIgnoreMouseEvents(ignore, options)
})

ipcMain.on("modal-window:render", (event, data) => {
  if (modalWindow) {
    modalWindow.webContents.send("modal-window:render", data)
  }
})
ipcMain.on("modal-window:open", (event, data) => {
  if (modalWindow) {
    modalWindow.show()
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
  dropdownWindow.hide()

  // Screenshot actions
  if (data.action == "cropScreenshot") {
    modalWindow.hide()
    mainWindow.focus()
    mainWindow.webContents.send("dropdown:select.screenshot", data)
    modalWindow.webContents.send("dropdown:select.screenshot", data)
  } else if (data.action == "fullScreenshot") {
    hideWindows()
    createScreenshot()
    mainWindow.webContents.send("dropdown:select.screenshot", data)
    modalWindow.webContents.send("dropdown:select.screenshot", data)
  } else {
    modalWindow.webContents.send("dropdown:select.video", data)
  }
})

ipcMain.on("dropdown:open", (event, data: IDropdownPageData) => {
  const dropdownWindowBounds = dropdownWindow.getBounds()
  const modalWindowBounds = modalWindow.getBounds()
  const screenBounds = screen.getDisplayNearestPoint(
    modalWindow.getBounds()
  ).bounds
  const gap = 20
  const itemHeight = 48
  const height = data.list.items.length * itemHeight
  const positionRight =
    modalWindowBounds.x +
    modalWindowBounds.width +
    dropdownWindowBounds.width +
    gap -
    screenBounds.x
  const positionY = modalWindowBounds.y + data.offsetY
  const diffX = screenBounds.width - positionRight

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

  if (dropdownWindow) {
    dropdownWindow.webContents.send("dropdown:open", data)
  }
})

ipcMain.on("screenshot:copy", (event, imgDataUrl: string) => {
  const image = nativeImage.createFromDataURL(imgDataUrl)
  clipboard.writeImage(image)
})
ipcMain.on("screenshot:create", (event, crop: Rectangle | undefined) => {
  createScreenshot(crop)
})
ipcMain.on(APIEvents.UPLOAD_SCREENSHOT, (event, data) => {
  const file = dataURLToFile(data.dataURL, data.fileName)
  uploadScreenshotCommand(
    tokenStorage.token!.access_token,
    tokenStorage.organizationId!,
    data.fileName,
    data.fileSize,
    getVersion(),
    data.title,
    file
  ).then((uuid) => {
    if (uuid) {
      const publicPage = `${import.meta.env.VITE_AUTH_APP_URL}recorder/screenshot/${uuid}`
      logSender.sendLog("openExternalLink", publicPage)
      openExternalLink(publicPage)

      if (screenshotWindow) {
        screenshotWindow.destroy()
      }
    }
  })
})

ipcMain.on(RecordEvents.START, (event, data) => {
  if (mainWindow) {
    lastCreatedFileName = Date.now() + ""
    mainWindow.webContents.send(RecordEvents.START, data)
  }
  modalWindow.hide()
})

ipcMain.on(RecordEvents.SEND_DATA, (event, res) => {
  const { data, isLast } = res
  const blob = new Blob([data], { type: "video/webm;codecs=h264" })
  unprocessedFilesService
    .saveFileWithStreams(blob, lastCreatedFileName!, isLast)
    .then((rawFileName) => {
      logSender.sendLog("record.raw_file_chunk.save.success")
    })
    .catch((e) => {
      logSender.sendLog(
        "record.raw_file.save.error",
        stringify({ err: e }),
        true
      )
      showRecordErrorBox("Ошибка записи")
    })
})

ipcMain.on("stop-recording", (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send("stop-recording")
  }
  modalWindow.show()
})
ipcMain.on("windows:minimize", (event, data) => {
  modalWindow.close()
  if (screenshotWindow) {
    screenshotWindow.hide()
  }
})
ipcMain.on("windows:close", (event, data) => {
  modalWindow.close()
  if (screenshotWindow) {
    screenshotWindow.hide()
  }
})

ipcMain.on(SimpleStoreEvents.UPDATE, (event, data: ISimpleStoreData) => {
  const { key, value } = data
  store.set(key, value)
  if (mainWindow) {
    mainWindow.webContents.send(SimpleStoreEvents.CHANGED, store.get())
  }

  if (modalWindow) {
    modalWindow.webContents.send(SimpleStoreEvents.CHANGED, store.get())
  }
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
ipcMain.on("redirect:app", (event, route) => {
  const url = route.replace("%orgId%", tokenStorage.organizationId)
  const link = `${import.meta.env.VITE_AUTH_APP_URL}${url}`
  openExternalLink(link)
  hideWindows()
})

ipcMain.on("app:logout", (event) => {
  logOut()
})

ipcMain.on(LoginEvents.LOGIN_SUCCESS, (event) => {
  logSender.sendLog("user.login.success")

  checkOrganizationLimits().then(() => {
    contextMenu.getMenuItemById("menuLogOutItem")!.visible = true
    loginWindow.hide()
    mainWindow.show()
    modalWindow.show()
  })
})

ipcMain.on(LoginEvents.TOKEN_CONFIRMED, (event: unknown) => {
  logSender.sendLog("sessions.created")
  const { token, organization_id } = event as IAuthData
  tokenStorage.encryptAuthData({ token, organization_id })
  getCurrentUser(tokenStorage.token!.access_token)
})

ipcMain.on(LoginEvents.USER_VERIFIED, (event: unknown) => {
  logSender.sendLog("user.verified")
  const user = event as IUser
  appState.set({ ...appState.state, user })
  ipcMain.emit(LoginEvents.LOGIN_SUCCESS)
})

ipcMain.on(RecordEvents.ERROR, (event, file) => {
  showRecordErrorBox()
})

ipcMain.on(FileUploadEvents.RECORD_CREATED, (event, file) => {
  unprocessedFilesService
    .awaitWriteFile(lastCreatedFileName!)
    .then((rawFileName) => {
      logSender.sendLog("record.raw_file.full.save.success")
      ipcMain.emit(FileUploadEvents.TRY_CREATE_FILE_ON_SERVER, { rawFileName })
    })
    .catch((e) => {
      logSender.sendLog(
        "record.raw_file.save.error",
        stringify({ err: e }),
        true
      )
    })
})

ipcMain.on(FileUploadEvents.TRY_CREATE_FILE_ON_SERVER, (event: unknown) => {
  const { rawFileName: timestampRawFileName } = event as { rawFileName: any }
  logSender.sendLog(
    "api.uploads.multipart_upload.try_to_create",
    JSON.stringify({ rawFileName: timestampRawFileName })
  )

  unprocessedFilesService.isProcessedNowFileName = timestampRawFileName
  unprocessedFilesService
    .getTotalChunks(timestampRawFileName, chunkSize)
    .then((data) => {
      if (data) {
        const { totalSize, totalChunks } = data
        const appVersion = getVersion()
        logSender.sendLog("recording.uploads.chunks.stored.prepared")
        const title = getTitle(timestampRawFileName)
        const fileName = title + ".mp4"
        const callback = (err: null | Error, uuid: string | null) => {
          if (!err) {
            const params = { uuid, rawFileName: timestampRawFileName }
            ipcMain.emit(FileUploadEvents.FILE_CREATED_ON_SERVER, params)
          } else {
            logSender.sendLog(
              "api.uploads.multipart_upload.create.error",
              stringify({ err }),
              true
            )
            const params = {
              filename: timestampRawFileName,
            }
            ipcMain.emit(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, params)
          }
        }
        const lastVideoPreview = store.get()["lastVideoPreview"]
        const preview = lastVideoPreview
          ? dataURLToFile(lastVideoPreview, fileName)
          : undefined
        createFileUploadCommand(
          tokenStorage.token!.access_token,
          tokenStorage.organizationId!,
          fileName,
          totalChunks,
          title,
          totalSize,
          appVersion,
          preview,
          callback
        )
      }
    })
})

ipcMain.on(FileUploadEvents.FILE_CREATED_ON_SERVER, async (event: unknown) => {
  const { uuid, chunks, rawFileName } = event as {
    uuid: string
    chunks: any[]
    rawFileName: any
  }
  logSender.sendLog(
    "api.uploads.multipart_upload.create.success",
    JSON.stringify({ uuid })
  )
  const shared =
    import.meta.env.VITE_AUTH_APP_URL +
    "recorder/org/" +
    tokenStorage.organizationId +
    "/" +
    "library/" +
    uuid
  if (lastCreatedFileName === rawFileName) {
    openExternalLink(shared)
    logSender.sendLog("utils.open_library_page", JSON.stringify({ uuid }))
  } else {
    const t = getTitle(rawFileName)
    if (Notification.isSupported()) {
      const notification = new Notification({
        body: `Запись экрана ${t} загружается на сервер, и будет доступна для просмотра после обработки. Нажмите на уведомление, чтобы открыть в браузере`,
      })
      logSender.sendLog("utils.notification.upload", JSON.stringify({ uuid }))
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

  const fileIterator =
    unprocessedFilesService.restoreFileToBufferIterator(rawFileName)
  let isSaveError = false
  try {
    logSender.sendLog(
      "recording.uploads.chunks.stored.start",
      stringify({ uuid })
    )
    let i = 0
    for await (const buffer of fileIterator) {
      await chunkStorage.addStorage([buffer], uuid)
      i++
      // chunkStorage.addStorage([buffer], uuid).then()
    }
    chunkStorage.markChunkAsTransferEnd(uuid)
    logSender.sendLog(
      "recording.uploads.chunks.stored.end",
      stringify({ uuid: uuid, buffer_count: i })
    )
  } catch (e) {
    isSaveError = true
    logSender.sendLog(
      "recording.uploads.chunks.stored.error",
      stringify({ uuid, e }),
      true
    )
    showRecordErrorBox(
      `Нет места на диске для записи файла`,
      "Освободите место и перезапустите приложение"
    )
  }

  if (!isSaveError) {
    unprocessedFilesService
      .deleteFile(rawFileName)
      .then(() => {
        logSender.sendLog(
          "record.raw_file.delete.success",
          JSON.stringify({
            fileName: unprocessedFilesService.isProcessedNowFileName,
          })
        )
        unprocessedFilesService.isProcessedNowFileName = null
        checkUnprocessedFiles()
        checkUnprocessedChunks()
        checkOrganizationLimits()
      })
      .catch((e) => {
        logSender.sendLog(
          "record.raw_file.delete.error",
          stringify({ e }),
          true
        )
      })
  }

  lastCreatedFileName = null
})

ipcMain.on(FileUploadEvents.LOAD_FILE_CHUNK, (event: unknown) => {
  const { chunk } = event as { chunk: Chunk }
  const typedChunk = chunk as Chunk
  const uuid = typedChunk.fileUuid
  const chunkNumber = typedChunk.index + 1
  logSender.sendLog(
    "api.uploads.chunks.upload_started",
    JSON.stringify({
      chunk_number: chunkNumber,
      chunk_size: typedChunk.size,
      file_uuid: typedChunk.fileUuid,
    })
  )
  const callback = (err, data) => {
    typedChunk.cancelProcess()
    if (err?.error?.code === "conflict_request") {
      logSender.sendLog(
        "api.uploads.chunks.upload_conflict_request",
        stringify({
          chunk_number: chunkNumber,
          chunk_size: typedChunk?.size,
          file_uuid: typedChunk?.fileUuid,
          e: err,
        }),
        false
      )
      chunkStorage
        .removeChunk(typedChunk)
        .then(() => {
          logSender.sendLog(
            "chunks.storage.delete.success",
            JSON.stringify({
              chunk_number: chunkNumber,
              chunk_size: typedChunk.size,
              file_uuid: typedChunk.fileUuid,
            })
          )
          ipcMain.emit(FileUploadEvents.FILE_CHUNK_UPLOADED, {
            uuid,
            chunkNumber,
          })
        })
        .catch((e) => {
          logSender.sendLog(
            "chunks.storage.delete.error",
            stringify({
              chunk_number: chunkNumber,
              chunk_size: typedChunk.size,
              file_uuid: typedChunk.fileUuid,
              e,
            }),
            true
          )
        })
    } else if (!err) {
      logSender.sendLog(
        "api.uploads.chunks.upload_completed",
        JSON.stringify({
          chunk_number: chunkNumber,
          chunk_size: typedChunk.size,
          file_uuid: typedChunk.fileUuid,
        })
      )
      chunkStorage
        .removeChunk(typedChunk)
        .then(() => {
          logSender.sendLog(
            "chunks.storage.delete.success",
            JSON.stringify({
              chunk_number: chunkNumber,
              chunk_size: typedChunk.size,
              file_uuid: typedChunk.fileUuid,
            })
          )
          ipcMain.emit(FileUploadEvents.FILE_CHUNK_UPLOADED, {
            uuid,
            chunkNumber,
          })
        })
        .catch((e) => {
          logSender.sendLog(
            "chunks.storage.delete.error",
            stringify({
              chunk_number: chunkNumber,
              chunk_size: typedChunk.size,
              file_uuid: typedChunk.fileUuid,
              e,
            }),
            true
          )
        })
    } else {
      logSender.sendLog(
        "api.uploads.chunks.upload_error",
        stringify({
          chunk_number: chunkNumber,
          chunk_size: typedChunk.size,
          file_uuid: typedChunk.fileUuid,
          e: err,
        }),
        true
      )
    }
  }
  typedChunk
    .getData()
    .then((data) => {
      typedChunk.startProcess()
      uploadFileChunkCommand(
        tokenStorage.token!.access_token,
        tokenStorage.organizationId!,
        uuid,
        data,
        chunkNumber,
        callback
      )
    })
    .catch((e) => {
      typedChunk.cancelProcess()
      logSender.sendLog(
        "chunks.storage.getData.error",
        stringify({
          chunk_number: chunkNumber,
          chunk_size: typedChunk.size,
          file_uuid: typedChunk.fileUuid,
          e,
        }),
        true
      )
    })
})

ipcMain.on(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, (event: unknown) => {
  const { filename } = event as { filename: any }
  if (lastCreatedFileName === filename) {
    lastCreatedFileName = null
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Ошибка. Не удалось загрузить файл на сервер",
      message:
        "Загрузка файла будет повторяться в фоновом процессе, пока он не будет отправлен на сервер. Как только файл будет загружен, вы увидите его в своей библиотеке.",
    })
  }

  unprocessedFilesService.isProcessedNowFileName = null
})

ipcMain.on(FileUploadEvents.FILE_CHUNK_UPLOADED, (event: unknown) => {
  const { uuid, chunkNumber } = event as { uuid: any; chunkNumber: any }
  setLog(
    LogLevel.SILLY,
    `FileUploadEvents.FILE_CHUNK_UPLOADED: ${chunkNumber} by file ${uuid} uploaded`
  )
  checkUnprocessedChunks()
})

ipcMain.on(LoginEvents.LOGOUT, (event) => {
  logSender.sendLog("sessions.deleted")
  contextMenu.getMenuItemById("menuLogOutItem")!.visible = false
})

ipcMain.on(APIEvents.GET_ORGANIZATION_LIMITS, (data: unknown) => {
  const limits = data as IOrganizationLimits
  logSender.sendLog("api.limits.get", stringify(data))
  if (mainWindow) {
    mainWindow.webContents.send(APIEvents.GET_ORGANIZATION_LIMITS, limits)
  }

  if (modalWindow) {
    modalWindow.webContents.send(APIEvents.GET_ORGANIZATION_LIMITS, limits)
  }
})

ipcMain.on("log", (evt, data) => {
  setLog(LogLevel.DEBUG, data)
})

ipcMain.on(LoggerEvents.SEND_LOG, (evt, data) => {
  const { title, body, error } = data
  const isError = !!error
  logSender.sendLog(title, stringify(body), isError)
})

ipcMain.on(RecordEvents.ERROR, (evt, data) => {
  const { title, body } = data
  logSender.sendLog(title, stringify(body))
  showRecordErrorBox("Ошибка во время захвата экрана", "Обратитесь в поддержку")
})
