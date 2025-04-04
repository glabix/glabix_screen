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
  Rectangle,
  clipboard,
  powerMonitor,
} from "electron"
import path, { join } from "path"
import os from "os"
import { getCurrentUser } from "./commands/current-user.command"
import { LoginEvents } from "@shared/events/login.events"
import { FileUploadEvents } from "@shared/events/file-upload.events"
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
  ICropVideoData,
  IAccountData,
  IAvatarData,
  DialogWindowEvents,
  IDialogWindowData,
  IDialogWindowCallbackData,
  HotkeysEvents,
  ModalWindowEvents,
  IModalWindowTabData,
  ScreenshotWindowEvents,
  ScreenshotActionEvents,
  ModalWindowWidth,
  IRecordUploadProgressData,
} from "@shared/types/types"
import { AppState } from "./storages/app-state"
import { SimpleStore } from "./storages/simple-store"
import { getAutoUpdater } from "./helpers/auto-updater-factory"
import { LogLevel, setLog } from "./helpers/set-log"
import { APIEvents } from "@shared/events/api.events"
import { exec } from "child_process"
import positioner from "electron-traywindow-positioner"
import { openExternalLink } from "@shared/helpers/open-external-link"
import { errorsInterceptor } from "./initializers/interceptor"
import { loggerInit } from "./initializers/logger.init"
import { getVersion } from "./helpers/get-version"
import { LogSender } from "./helpers/log-sender"
import { LoggerEvents } from "@shared/events/logger.events"
import { stringify } from "./helpers/stringify"
import { optimizer, is } from "@electron-toolkit/utils"
import { getScreenshot } from "./helpers/get-screenshot"
import { dataURLToFile } from "./helpers/dataurl-to-file"
import {
  RecordEvents,
  RecordSettingsEvents,
} from "../shared/events/record.events"
import { getOsLog } from "./helpers/get-os-log"
import { showRecordErrorBox } from "./helpers/show-record-error-box"
import { uploadScreenshotCommand } from "./commands/upload-screenshot.command"
import { getAccountData } from "./commands/account-data.command"
import Chunk from "../database/models/Chunk"
import Record from "../database/models/Record"
import sequelize from "../database/index"
import StorageService from "../services/storage.service"
import { RecordManager } from "../services/record-manager"
import { PreviewManager } from "../services/preview-manager"
import {
  createDialogWindow,
  destroyDialogWindow,
} from "./helpers/create-dialog"
import { MigrateOldStorageUnprocessed } from "../services/migrate-old-storage-unprocessed"
import { MigrateOldStoragePrepared } from "../services/migrate-old-storage-prepared"
import { checkOrganizationLimits } from "../shared/helpers/check-organization-limits"
import { getUserShortcutsSettings } from "./helpers/hotkeys.map"
import eStore from "./helpers/electron-store.helper"
import {
  IUserSettingsShortcut,
  UserSettingsEvents,
  UserSettingsKeys,
} from "@shared/types/user-settings.types"
import { getLastStreamSettings } from "./helpers/get-last-stream-settings.helper"
import { AppEvents } from "@shared/events/app.events"
import { AppUpdaterEvents } from "@shared/events/app_updater.events"
import { PowerSaveBlocker } from "./helpers/power-blocker"
import AutoLaunch from "./helpers/auto-launch.helper"

let activeDisplay: Electron.Display
let dropdownWindow: BrowserWindow
let screenshotWindow: BrowserWindow
let screenshotWindowBounds: Rectangle | undefined = undefined
let isScreenshotAllowed = false
let isDialogWindowOpen = false
let isHotkeysLocked = false
let mainWindow: BrowserWindow
let modalWindow: BrowserWindow
let loginWindow: BrowserWindow
let contextMenu: Menu
let tray: Tray
let isAppQuitting = false
let isDrawActive = false
let deviceAccessInterval: NodeJS.Timeout | undefined
let checkForUpdatesInterval: NodeJS.Timeout | undefined
let lastDeviceAccessData: IMediaDevicesAccess = {
  camera: false,
  microphone: false,
  screen: false,
}

const logSender = new LogSender(TokenStorage)
const appState = new AppState()
const store = new SimpleStore()

AutoLaunch.setup(
  eStore.get(UserSettingsKeys.AUTO_LAUNCH) as boolean | undefined
)

app.setAppUserModelId(import.meta.env.VITE_APP_ID)
app.removeAsDefaultProtocolClient(import.meta.env.VITE_PROTOCOL_SCHEME)
app.commandLine.appendSwitch("enable-transparent-visuals")
app.commandLine.appendSwitch("disable-software-rasterizer")
// app.commandLine.appendSwitch("disable-gpu-compositing")

getAutoUpdater().on("error", (error) => {
  logSender.sendLog(AppUpdaterEvents.ERROR, JSON.stringify(error))
})

getAutoUpdater().on("update-downloaded", (info) => {
  logSender.sendLog(AppUpdaterEvents.DOWNLOAD_END, JSON.stringify(info))

  modalWindow?.webContents.send(AppUpdaterEvents.HAS_UPDATE, false)
  modalWindow?.webContents.send(AppUpdaterEvents.DOWNLOAD_PROGRESS, 100)
  getAutoUpdater().quitAndInstall()
  setTimeout(() => {
    modalWindow?.webContents.send(AppUpdaterEvents.DOWNLOAD_END)
  }, 100)
})

getAutoUpdater().on("download-progress", (info) => {
  logSender.sendLog(AppUpdaterEvents.DOWNLOAD_PROGRESS, JSON.stringify(info))
  modalWindow?.webContents.send(
    AppUpdaterEvents.DOWNLOAD_PROGRESS,
    Math.floor(info.percent)
  )
})

getAutoUpdater().on("update-available", (info) => {
  logSender.sendLog(AppUpdaterEvents.UPDATE_AVAILABLE, JSON.stringify(info))
  modalWindow?.webContents.send(AppUpdaterEvents.HAS_UPDATE, true)
})

getAutoUpdater().on("update-not-available", (info) => {
  logSender.sendLog(AppUpdaterEvents.UPDATE_NOT_AVAILABLE, JSON.stringify(info))
  modalWindow?.webContents.send(AppUpdaterEvents.HAS_UPDATE, false)
})

ipcMain.on(AppUpdaterEvents.DOWNLOAD_START, (event, data) => {
  logSender.sendLog(AppUpdaterEvents.DOWNLOAD_START)
  getAutoUpdater().downloadUpdate()
  modalWindow?.webContents.send(AppUpdaterEvents.DOWNLOAD_PROGRESS, 0)
})

loggerInit() // init logger
errorsInterceptor() // init req errors interceptor

const gotTheLock = app.requestSingleInstanceLock()

function clearAllIntervals() {
  if (deviceAccessInterval) {
    clearInterval(deviceAccessInterval)
    deviceAccessInterval = undefined
  }

  if (checkForUpdatesInterval) {
    clearInterval(checkForUpdatesInterval)
    checkForUpdatesInterval = undefined
  }
  RecordManager.clearIntervals()
}

// Инициализация базы данных
const initializeDatabase = async () => {
  try {
    logSender.sendLog("database.connection.start", "")
    await sequelize.authenticate() // Проверка подключения
    logSender.sendLog("database.authenticate.success", "")
    // Создание всех таблиц, если они не существуют
    const record = Record
    const chunk = Chunk

    const res = await sequelize.sync({ force: false }) // force: false — не пересоздавать таблицы, если они уже есть
    logSender.sendLog("database.sync.success", "")
  } catch (error) {
    logSender.sendLog("database.connection.error", stringify({ error }), true)
  }
}

function init(url: string) {
  if (mainWindow) {
    // Someone tried to run a second instance, we should focus our window.
    checkOrganizationLimits().then(() => {
      showWindows()
    })
  }

  if (!url.startsWith(import.meta.env.VITE_PROTOCOL_SCHEME)) {
    return
  }

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
      checkOrganizationLimits().then(() => {
        showWindows()
      })
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

function checkForUpdates() {
  const downloadNotification = {
    title: "Новое обновление готово к установке",
    body: "Версия {version} загружена и будет автоматически установлена при выходе из приложения",
  }
  // getAutoUpdater().checkForUpdatesAndNotify(downloadNotification)
  logSender.sendLog("getAutoUpdater().checkForUpdates()")
  getAutoUpdater().checkForUpdates()
}

if (!gotTheLock) {
  app.quit()
} else {
  if (os.platform() == "darwin") {
    app.on("open-url", (event, url) => {
      init(url)
    })
  }

  app.on("second-instance", (event, commandLine, workingDirectory) => {
    const url = commandLine.pop()
    init(url!)
  })

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.

  app.whenReady().then(() => {
    powerMonitor.on("resume", () => {
      logSender.sendLog("powerMonitor.resume")
      StorageService.wakeUp()
    })
    initializeDatabase().then(() => {
      RecordManager.setTimer()
      const a = new MigrateOldStorageUnprocessed()
      const b = new MigrateOldStoragePrepared()
      a.migrate()
      b.migrate()
    }) // Инициализация базы данных
    lastDeviceAccessData = getMediaDevicesAccess()
    deviceAccessInterval = setInterval(watchMediaDevicesAccessChange, 2000)
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
    createWindow()

    try {
      logSender.sendLog("user.read_auth_data")
      TokenStorage.readAuthData()
      logSender.sendLog("app.started")
      createMenu()

      loadAccountData()

      checkOrganizationLimits().then(() => {
        getLastStreamSettings(modalWindow).then((settings) => {
          modalWindow.webContents.send(RecordSettingsEvents.INIT, settings)
          mainWindow.webContents.send(RecordSettingsEvents.INIT, settings)
          showWindows()
        })
      })
    } catch (e) {
      logSender.sendLog("user.read_auth_data.error", stringify({ e }), true)
    }

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
                      mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
                      modalWindow.setAlwaysOnTop(true, "screen-saver", 999990)
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
                      mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
                      modalWindow.setAlwaysOnTop(true, "screen-saver", 999990)
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

    registerUserShortCuts()
  })
}

function unregisterUserShortCuts() {
  const userShortcuts = getUserShortcutsSettings(
    eStore.get(UserSettingsKeys.SHORT_CUTS)
  ).filter((s) => s.actionState == "app:run")
  userShortcuts.forEach((us) => {
    globalShortcut.unregister(us.keyCodes)
  })
}

function registerUserShortCuts() {
  const userShortcuts = getUserShortcutsSettings(
    eStore.get(UserSettingsKeys.SHORT_CUTS)
  ).filter((s) => s.actionState == "app:run")

  userShortcuts.forEach((us) => {
    if (!us.disabled) {
      // Fullscreen Screenshot
      if (us.name == HotkeysEvents.FULL_SCREENSHOT) {
        globalShortcut.register(us.keyCodes, () => {
          if (isHotkeysLocked) {
            return
          }

          if (isScreenshotAllowed) {
            const cursorPosition = screen.getCursorScreenPoint()
            activeDisplay = screen.getDisplayNearestPoint(cursorPosition)
            createScreenshot()
          }
        })
      }

      // Crop Screenshot
      if (us.name == HotkeysEvents.CROP_SCREENSHOT) {
        globalShortcut.register(us.keyCodes, () => {
          if (isHotkeysLocked) {
            return
          }

          const isRecording = (store.get() as any).recordingState == "recording"

          if (isScreenshotAllowed) {
            mainWindow.webContents.send(ScreenshotActionEvents.CROP, {})

            if (!isRecording) {
              const cursorPosition = screen.getCursorScreenPoint()
              activeDisplay = screen.getDisplayNearestPoint(cursorPosition)
              mainWindow.webContents.send("screen:change", activeDisplay)
              modalWindow.hide()
              mainWindow.setBounds(activeDisplay.bounds)

              if (!mainWindow.isVisible()) {
                mainWindow.show()
                mainWindow.focus()
                mainWindow.focusOnWebView()
              }
            }
          }
        })
      }
    }
  })
}

function unregisterUserShortCutsOnShow() {
  const userShortcuts = getUserShortcutsSettings(
    eStore.get(UserSettingsKeys.SHORT_CUTS)
  ).filter((s) => s.actionState == "app:visible")

  userShortcuts.forEach((us) => {
    globalShortcut.unregister(us.keyCodes)
  })
}

function registerUserShortCutsOnShow() {
  const userShortcuts = getUserShortcutsSettings(
    eStore.get(UserSettingsKeys.SHORT_CUTS)
  ).filter((s) => s.actionState == "app:visible")
  userShortcuts.forEach((us) => {
    if (!us.disabled) {
      // Stop/Start Recording
      if (us.name == HotkeysEvents.STOP_RECORDING) {
        globalShortcut.register(us.keyCodes, () => {
          if (isDialogWindowOpen || isHotkeysLocked) {
            return
          }

          const isRecording = (store.get() as any).recordingState == "recording"
          if (isRecording) {
            mainWindow?.webContents.send(HotkeysEvents.STOP_RECORDING)
          } else {
            // mainWindow?.webContents.send(HotkeysEvents.START_RECORDING)
          }
        })
      }

      // Pause/Resume Recording
      if (us.name == HotkeysEvents.PAUSE_RECORDING) {
        globalShortcut.register(us.keyCodes, () => {
          if (isDialogWindowOpen || isHotkeysLocked) {
            return
          }

          const state = (store.get() as any).recordingState
          if (state == "recording") {
            mainWindow?.webContents.send(HotkeysEvents.PAUSE_RECORDING)
          }
          if (state == "paused") {
            mainWindow?.webContents.send(HotkeysEvents.RESUME_RECORDING)
          }
        })
      }

      // Restart Recording
      if (us.name == HotkeysEvents.RESTART_RECORDING) {
        globalShortcut.register(us.keyCodes, () => {
          if (isDialogWindowOpen || isHotkeysLocked) {
            return
          }

          const state = (store.get() as any).recordingState
          if (["recording", "paused"].includes(state)) {
            mainWindow?.webContents.send(HotkeysEvents.RESTART_RECORDING)
          }
        })
      }

      // Delete Recording
      if (us.name == HotkeysEvents.DELETE_RECORDING) {
        globalShortcut.register(us.keyCodes, () => {
          if (isDialogWindowOpen || isHotkeysLocked) {
            return
          }

          const state = (store.get() as any).recordingState
          if (["recording", "paused"].includes(state)) {
            mainWindow?.webContents.send(HotkeysEvents.DELETE_RECORDING)
          }
        })
      }

      // Toggle Draw
      if (us.name == HotkeysEvents.DRAW) {
        globalShortcut.register(us.keyCodes, () => {
          if (isDialogWindowOpen || isHotkeysLocked) {
            return
          }

          mainWindow?.webContents.send(HotkeysEvents.DRAW)

          if (isDrawActive && os.platform() == "win32") {
            mainWindow?.blur()
          }
        })
      }
    }
  })
}

function registerShortCutsOnShow() {
  globalShortcut.register("Cmd+H", () => {
    hideWindows()
  })
}

function unregisterShortCutsOnHide() {
  globalShortcut.unregister("Cmd+H")
}

function loadAccountData() {
  if (!TokenStorage.token || !TokenStorage.organizationId) {
    return
  }

  if (TokenStorage.entityId) {
    getAccountData(TokenStorage.token!.access_token, TokenStorage.entityId)
  } else {
    getCurrentUser(TokenStorage.token!.access_token).then((res: IUser) => {
      getAccountData(TokenStorage.token!.access_token, res.id)
    })
  }
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
    hasShadow: false,
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
  // mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
  mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)

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

  mainWindow.on("show", () => {
    mainWindow.webContents.send(AppEvents.ON_SHOW)
    modalWindow?.webContents.send(AppEvents.ON_SHOW)
    mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
  })

  mainWindow.on("hide", () => {
    mainWindow.webContents.send(AppEvents.ON_HIDE)
    modalWindow.webContents.send(AppEvents.ON_HIDE)
  })

  mainWindow.on("blur", () => {
    mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
  })

  mainWindow.on("focus", () => {
    mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
  })

  mainWindow.webContents.on("did-finish-load", () => {
    getLastStreamSettings(mainWindow).then((settings) => {
      modalWindow?.webContents.send(RecordSettingsEvents.INIT, settings)
      mainWindow.webContents.send(RecordSettingsEvents.INIT, settings)
    })
  })

  createModal(mainWindow)
  createLoginWindow()
}

function sendUserSettings() {
  if (modalWindow) {
    modalWindow.webContents.send(
      UserSettingsEvents.SHORTCUTS_GET,
      getUserShortcutsSettings(eStore.get(UserSettingsKeys.SHORT_CUTS))
    )

    modalWindow.webContents.send(
      UserSettingsEvents.FLIP_CAMERA_GET,
      eStore.get(UserSettingsKeys.FLIP_CAMERA)
    )

    modalWindow.webContents.send(
      UserSettingsEvents.PANEL_VISIBILITY_GET,
      eStore.get(UserSettingsKeys.PANEL_VISIBILITY)
    )

    modalWindow.webContents.send(
      UserSettingsEvents.AUTO_LAUNCH_GET,
      eStore.get(UserSettingsKeys.AUTO_LAUNCH)
    )
  }

  if (mainWindow) {
    mainWindow.webContents.send(
      UserSettingsEvents.SHORTCUTS_GET,
      getUserShortcutsSettings(eStore.get(UserSettingsKeys.SHORT_CUTS))
    )

    mainWindow.webContents.send(
      UserSettingsEvents.FLIP_CAMERA_GET,
      eStore.get(UserSettingsKeys.FLIP_CAMERA)
    )

    mainWindow.webContents.send(
      UserSettingsEvents.PANEL_VISIBILITY_GET,
      eStore.get(UserSettingsKeys.PANEL_VISIBILITY)
    )
  }
}

function createModal(parentWindow) {
  modalWindow = new BrowserWindow({
    titleBarStyle: "hidden",
    fullscreenable: false,
    maximizable: false,
    resizable: false,
    width: ModalWindowWidth.MODAL,
    height: ModalWindowHeight.MODAL,
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
  modalWindow.setAlwaysOnTop(true, "screen-saver", 999990)

  modalWindow.on("hide", () => {
    modalWindow.webContents.send(ModalWindowEvents.HIDE)
    dropdownWindow.hide()
    checkOrganizationLimits()
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      getMediaDevicesAccess()
    )
  })

  modalWindow.on("ready-to-show", () => {
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      getMediaDevicesAccess()
    )
    checkOrganizationLimits()
    loadAccountData()
    modalWindow.webContents.send(AppEvents.GET_VERSION, app.getVersion())
    sendUserSettings()

    getLastStreamSettings(modalWindow).then((settings) => {
      modalWindow.webContents.send(RecordSettingsEvents.INIT, settings)
      mainWindow.webContents.send(RecordSettingsEvents.INIT, settings)
    })
  })

  modalWindow.on("show", () => {
    modalWindow.webContents.send(ModalWindowEvents.SHOW)
    modalWindow.webContents.send(AppEvents.ON_SHOW)
    modalWindow.webContents.send(
      "mediaDevicesAccess:get",
      getMediaDevicesAccess()
    )
    modalWindow.webContents.send(AppEvents.GET_VERSION, app.getVersion())
    checkOrganizationLimits()
    loadAccountData()
    sendUserSettings()
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
    modalWindow.loadFile(join(import.meta.dirname, "../renderer/modal.html"))
  }

  modalWindow.webContents.on("did-finish-load", () => {
    modalWindow.webContents.send(AppEvents.GET_VERSION, app.getVersion())
    checkForUpdates()
    getLastStreamSettings(modalWindow).then((settings) => {
      modalWindow.webContents.send(RecordSettingsEvents.INIT, settings)
      mainWindow.webContents.send(RecordSettingsEvents.INIT, settings)
    })

    loadAccountData()
  })

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
  dropdownWindow.setAlwaysOnTop(true, "screen-saver", 999990)
  if (os.platform() == "darwin") {
    dropdownWindow.setWindowButtonVisibility(false)
  }

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    dropdownWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/dropdown.html`
    )
  } else {
    dropdownWindow.loadFile(
      join(import.meta.dirname, "../renderer/dropdown.html")
    )
  }

  dropdownWindow.webContents.on("did-finish-load", () => {
    dropdownWindow.webContents.send(AppEvents.GET_VERSION, app.getVersion())
  })

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
    loginWindow.loadFile(join(import.meta.dirname, "../renderer/login.html"))
  }

  loginWindow.on("show", () => {
    mainWindow?.webContents.send(AppEvents.ON_BEFORE_HIDE)
    modalWindow?.webContents.send(AppEvents.ON_BEFORE_HIDE)
  })

  loginWindow.webContents.on("did-finish-load", () => {
    loginWindow.webContents.send(AppEvents.GET_VERSION, app.getVersion())
  })
}

function createScreenshotWindow(dataURL: string) {
  if (screenshotWindow) {
    screenshotWindowBounds = undefined
    screenshotWindow.destroy()
  }

  const cursor = screen.getCursorScreenPoint()
  const currentScreen = activeDisplay || screen.getDisplayNearestPoint(cursor)
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

  const spacing = 32 + 57
  const mainWindowBounds = screenBounds
  const x = mainWindowBounds.x + (mainWindowBounds.width - width) / 2
  const y =
    mainWindowBounds.y + (mainWindowBounds.height - height - spacing) / 2
  const bounds: Electron.Rectangle = { x, y, width, height: height + spacing }

  const isRecording = (store.get() as any).recordingState == "recording"
  if (!isRecording) {
    hideWindows()
  }

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
    parent: isRecording ? mainWindow : undefined,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"), // для безопасного взаимодействия с рендерером
      nodeIntegration: true, // повышаем безопасность
      zoomFactor: 1.0,
      devTools: !app.isPackaged,
      // contextIsolation: true,  // повышаем безопасность
    },
  })

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    screenshotWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/screenshot.html`
    )
  } else {
    screenshotWindow.loadFile(
      join(import.meta.dirname, "../renderer/screenshot.html")
    )
  }

  screenshotWindow.webContents.on("did-finish-load", () => {
    screenshotWindow.webContents.send(
      ScreenshotWindowEvents.RENDER_IMAGE,
      imageData
    )
    screenshotWindow.setBounds(bounds)
    screenshotWindow.show()
    screenshotWindow.moveTop()
  })
}

function showWindows() {
  if (isDialogWindowOpen) {
    return
  }

  logSender.sendLog("app.activated")
  registerShortCutsOnShow()
  registerUserShortCutsOnShow()
  if (TokenStorage.dataIsActual()) {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
    }
    if (modalWindow) {
      modalWindow.show()
      modalWindow.setAlwaysOnTop(true, "screen-saver", 999990)
    }
  } else {
    if (loginWindow) loginWindow.show()
  }
}

function hideWindows() {
  logSender.sendLog("app.disactivated")
  unregisterShortCutsOnHide()
  unregisterUserShortCutsOnShow()
  if (TokenStorage.dataIsActual()) {
    if (mainWindow) {
      mainWindow.webContents.send(AppEvents.ON_BEFORE_HIDE)
      mainWindow.hide()
    }
    if (modalWindow) {
      modalWindow.webContents.send(AppEvents.ON_BEFORE_HIDE)
      modalWindow.hide()
    }
  } else {
    if (loginWindow) loginWindow.hide()
  }
}

function toggleWindows() {
  if (TokenStorage.dataIsActual()) {
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
      const data: ISimpleStoreData = {
        key: "recordingState",
        value: "stopped",
      }
      ipcMain.emit(SimpleStoreEvents.UPDATE, null, data)
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
      visible: TokenStorage.dataIsActual(),
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
  TokenStorage.reset()
  mainWindow.webContents.send(AppEvents.ON_BEFORE_HIDE)
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
  } else {
    showWindows()
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

ipcMain.on("change-organization", (event, orgId: number) => {
  const lastTokenStorageData: IAuthData = {
    token: TokenStorage.token!,
    organization_id: orgId,
  }

  hideWindows()
  TokenStorage.reset()
  ipcMain.emit(LoginEvents.TOKEN_CONFIRMED, lastTokenStorageData)
})

ipcMain.on(UserSettingsEvents.FLIP_CAMERA_SET, (event, data: boolean) => {
  eStore.set(UserSettingsKeys.FLIP_CAMERA, data)
  logSender.sendLog("settings.flip_camera.update", `${data}`)
  sendUserSettings()
})

ipcMain.on(UserSettingsEvents.PANEL_VISIBILITY_SET, (event, data: boolean) => {
  eStore.set(UserSettingsKeys.PANEL_VISIBILITY, data)
  logSender.sendLog("settings.panel_visibility.update", `${data}`)
  sendUserSettings()
})
ipcMain.on(UserSettingsEvents.AUTO_LAUNCH_SET, (event, data: boolean) => {
  eStore.set(UserSettingsKeys.AUTO_LAUNCH, data)
  logSender.sendLog("settings.auto_launch.update", `${data}`)
  AutoLaunch.setup(data)
})

ipcMain.on(
  UserSettingsEvents.SHORTCUTS_SET,
  (event, data: IUserSettingsShortcut[]) => {
    eStore.set(UserSettingsKeys.SHORT_CUTS, data)
    logSender.sendLog("settings.shortcuts.update", stringify({ data }))
    unregisterUserShortCutsOnShow()
    registerUserShortCutsOnShow()

    unregisterUserShortCuts()
    registerUserShortCuts()

    sendUserSettings()
  }
)

ipcMain.on(
  UserSettingsEvents.SHORTCUTS_UNREGISTER,
  (event, shortcut: string) => {
    if (globalShortcut.isRegistered(shortcut)) {
      globalShortcut.unregister(shortcut)
    }
  }
)

ipcMain.on(HotkeysEvents.GLOBAL_PAUSE, (event, data) => {
  isHotkeysLocked = true
})
ipcMain.on(HotkeysEvents.GLOBAL_RESUME, (event, data) => {
  isHotkeysLocked = false
})

ipcMain.on("draw:start", (event, data) => {
  isDrawActive = true
})
ipcMain.on("draw:end", (event, data) => {
  isDrawActive = false
})

ipcMain.on(ModalWindowEvents.RENDER, (event, data) => {
  if (modalWindow) {
    modalWindow.webContents.send(ModalWindowEvents.RENDER, data)
  }
})
ipcMain.on(ModalWindowEvents.TAB, (event, data: IModalWindowTabData) => {
  if (mainWindow) {
    mainWindow.webContents.send(ModalWindowEvents.TAB, data)
    if (data.activeTab == "video") {
      mainWindow.focus()
    }
  }

  if (dropdownWindow) {
    dropdownWindow.hide()
  }
})
ipcMain.on(ModalWindowEvents.OPEN, (event, data) => {
  if (modalWindow) {
    modalWindow.show()
  }
})

ipcMain.on(
  ModalWindowEvents.RESIZE,
  (event, data: { width: number; height: number; alwaysOnTop: boolean }) => {
    if (modalWindow) {
      modalWindow.setBounds({ width: data.width, height: data.height })

      if (!data.alwaysOnTop && !deviceAccessInterval) {
        deviceAccessInterval = setInterval(watchMediaDevicesAccessChange, 2000)
      }

      if (os.platform() == "darwin") {
        if (data.alwaysOnTop) {
          mainWindow.setAlwaysOnTop(true, "screen-saver", 999990)
          modalWindow.setAlwaysOnTop(true, "screen-saver", 999990)
        } else {
          mainWindow.setAlwaysOnTop(true, "modal-panel")
          modalWindow.setAlwaysOnTop(true, "modal-panel")
        }
      }
    }
  }
)

ipcMain.on("system-settings:open", (event, device: MediaDeviceType) => {
  if (os.platform() == "darwin") {
    if (device == "screen") {
      exec(
        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"'
      )
    }
  }

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
ipcMain.on(RecordSettingsEvents.UPDATE, (event, data) => {
  mainWindow.webContents.send(RecordSettingsEvents.UPDATE, data)
})

ipcMain.on("dropdown:close", (event, data) => {
  dropdownWindow.hide()
})
ipcMain.on("dropdown:select", (event, data: IDropdownPageSelectData) => {
  dropdownWindow.hide()
  modalWindow.webContents.send("dropdown:select", data)
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

ipcMain.on(ScreenshotActionEvents.FULL, (event, data) => {
  hideWindows()
  mainWindow?.webContents.send(ScreenshotActionEvents.FULL, data)
  setTimeout(() => {
    createScreenshot()
  }, 50)
})

ipcMain.on(ScreenshotActionEvents.CROP, (event, data) => {
  modalWindow?.hide()
  mainWindow?.focus()
  mainWindow?.webContents.send(ScreenshotActionEvents.CROP, data)
})

ipcMain.on(ScreenshotWindowEvents.COPY_IMAGE, (event, imgDataUrl: string) => {
  const image = nativeImage.createFromDataURL(imgDataUrl)
  clipboard.writeImage(image)
})
ipcMain.on(
  ScreenshotWindowEvents.CREATE,
  (event, crop: Rectangle | undefined) => {
    createScreenshot(crop)
  }
)
ipcMain.on(APIEvents.UPLOAD_SCREENSHOT, (event, data) => {
  const file = dataURLToFile(data.dataURL, data.fileName)
  uploadScreenshotCommand(
    TokenStorage.token!.access_token,
    TokenStorage.organizationId!,
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

ipcMain.on(APIEvents.GET_ACCOUNT_DATA, (event, data: IAccountData) => {
  if (modalWindow && TokenStorage.organizationId) {
    const currentOrgId = TokenStorage.organizationId
    const currentOrg = data.organizations.find(
      (o) => o.id == currentOrgId
    )! as any
    const avatarData: IAvatarData = {
      id: data.id,
      name: data.name,
      initials: data.initials,
      avatar_url: data.avatar_url,
      bg_color_number:
        currentOrg.organization_users.find((u) => u.user_id == data.id)
          ?.color || 0,
      currentOrganization: { id: currentOrg.id, name: currentOrg.name },
      organizations: data.organizations.map((o) => ({
        id: o.id,
        name: o.name,
      })),
    }

    logSender.sendLog("api.accountData.get", stringify(avatarData))
    modalWindow.webContents.send("userAccountData:get", avatarData)
  }
})

ipcMain.on(
  FileUploadEvents.UPLOAD_PROGRESS_STATUS,
  (event, data: IRecordUploadProgressData[]) => {
    logSender.sendLog(FileUploadEvents.UPLOAD_PROGRESS_STATUS, stringify(data))
    if (!data.length) {
      modalWindow?.webContents.send(ModalWindowEvents.UPLOAD_PROGRESS_HIDE)
    } else {
      const progress = data[0]!.progress
      modalWindow?.webContents.send(
        ModalWindowEvents.UPLOAD_PROGRESS_SHOW,
        progress
      )
    }
  }
)

ipcMain.on(RecordEvents.START, (event, data) => {
  if (mainWindow) {
    StorageService.startRecord().then((r) => {
      mainWindow.webContents.send(
        RecordEvents.START,
        data,
        r.getDataValue("uuid")
      )
    })
  }

  modalWindow.hide()
})

ipcMain.on(RecordEvents.CANCEL, (event, data) => {
  const { fileUuid } = data as { fileUuid: string }
  logSender.sendLog("record.recording.cancel", stringify({ fileUuid }))
  StorageService.cancelRecord(fileUuid)
})

ipcMain.on(RecordEvents.SET_CROP_DATA, (event, data) => {
  const { fileUuid, cropVideoData } = data as {
    fileUuid: string
    cropVideoData: ICropVideoData
  }

  const cropData: ICropVideoData =
    os.platform() == "darwin"
      ? { ...cropVideoData }
      : {
          x: Math.round(cropVideoData.x * activeDisplay.scaleFactor),
          y: Math.round(cropVideoData.y * activeDisplay.scaleFactor),
          out_w: Math.round(cropVideoData.out_w * activeDisplay.scaleFactor),
          out_h: Math.round(cropVideoData.out_h * activeDisplay.scaleFactor),
        }

  logSender.sendLog(
    "record.recording.set_crop.data.received",
    stringify({ fileUuid, cropData })
  )

  StorageService.setCropData(fileUuid, cropData)
})

ipcMain.on(RecordEvents.SEND_DATA, (event, res) => {
  const { data, fileUuid, index, isLast } = res
  logSender.sendLog(
    "record.recording.chunk.received",
    stringify({ fileUuid, byteLength: data.byteLength, count: index })
  )
  if (!data.byteLength) {
    logSender.sendLog(
      "record.recording.chunk.received.error",
      stringify({ fileUuid, byteLength: data.byteLength }),
      true
    )
    showRecordErrorBox("Ошибка записи")
    return
  }
  const blob = new Blob([data], { type: "video/webm;codecs=h264" })
  StorageService.getNextChunk(fileUuid, blob, index, isLast)
  const preview = store.get()["lastVideoPreview"]
  if (preview && !PreviewManager.hasPreview(fileUuid)) {
    logSender.sendLog(
      "record.recording.preview.received",
      stringify({ fileUuid })
    )
    PreviewManager.savePreview(fileUuid, preview)
  }

  // unprocessedFilesService
  //   .saveFileWithStreams(blob, lastCreatedFileName!, isLast)
  //   .then((rawFileName) => {
  //     logSender.sendLog(
  //       "record.raw_file_chunk.save.success",
  //       stringify({ byteLength: data.byteLength })
  //     )
  //   })
  //   .catch((e) => {
  //     logSender.sendLog(
  //       "record.raw_file.save.error",
  //       stringify({ err: e }),
  //       true
  //     )
  //     showRecordErrorBox("Ошибка записи")
  //   })
})

ipcMain.on("stop-recording", (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send("stop-recording")
  }

  if (data?.showModal) {
    modalWindow.show()
  }
})

ipcMain.on("windows:minimize", (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win == screenshotWindow) {
    screenshotWindow.hide()
  } else {
    hideWindows()
  }
})
ipcMain.on("windows:close", (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win == screenshotWindow) {
    screenshotWindow.hide()
  } else {
    hideWindows()
  }
})

ipcMain.on("windows:maximize", (event, data) => {
  if (screenshotWindow) {
    if (!screenshotWindowBounds) {
      screenshotWindowBounds = screenshotWindow.getBounds()
      screenshotWindow.setBounds(activeDisplay.workArea)
    } else if (screenshotWindowBounds) {
      screenshotWindow.setBounds(screenshotWindowBounds)
      screenshotWindowBounds = undefined
    }
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

  const isRecording = ["recording", "paused"].includes(
    store.get()["recordingState"]
  )

  if (isRecording) {
    PowerSaveBlocker.start()
  } else {
    PowerSaveBlocker.stop()
  }
})

ipcMain.on("main-window-focus", (event, data) => {
  if (
    modalWindow &&
    modalWindow.isAlwaysOnTop() &&
    !isDialogWindowOpen &&
    !isHotkeysLocked
  ) {
    mainWindow.focus()
  }
})

ipcMain.on("invalidate-shadow", (event, data) => {
  if (os.platform() == "darwin") {
    mainWindow.invalidateShadow()
  }
})
ipcMain.on("openLinkInBrowser", (event, href) => {
  openExternalLink(href)
})
ipcMain.on("redirect:app", (event, route) => {
  const url = route.replace("%orgId%", TokenStorage.organizationId)
  const link = `${import.meta.env.VITE_AUTH_APP_URL}${url}`
  openExternalLink(link)
  hideWindows()
})

ipcMain.on(AppEvents.LOGOUT, (event) => {
  logOut()
})

ipcMain.on(AppEvents.HIDE, (event) => {
  hideWindows()
})

ipcMain.on(LoginEvents.LOGIN_SUCCESS, (event) => {
  logSender.sendLog("user.login.success")

  checkOrganizationLimits().then(() => {
    contextMenu.getMenuItemById("menuLogOutItem")!.visible = true
    loginWindow.hide()
    getLastStreamSettings(modalWindow).then((settings) => {
      modalWindow.webContents.send(RecordSettingsEvents.INIT, settings)
      mainWindow.webContents.send(RecordSettingsEvents.INIT, settings)
      mainWindow.show()
      modalWindow.show()
    })
  })
})

ipcMain.on(LoginEvents.TOKEN_CONFIRMED, (event: unknown) => {
  logSender.sendLog("sessions.created")
  const { token, organization_id } = event as IAuthData

  getCurrentUser(token!.access_token).then((res: IUser) => {
    getAccountData(token!.access_token, res.id).then((accountData) => {
      TokenStorage.encryptAuthData({
        token,
        organization_id,
        user_id: accountData.id,
        entity_id: res.id,
      })
      logSender.sendLog("user.verified")
      ipcMain.emit(LoginEvents.LOGIN_SUCCESS)
    })
  })
})

ipcMain.on(RecordEvents.ERROR, (event, file) => {
  showRecordErrorBox()
})

ipcMain.on(RecordEvents.STOP, (event, data) => {
  const { fileUuid } = data
  StorageService.endRecord(fileUuid)
})

ipcMain.on(LoginEvents.LOGOUT, (event) => {
  logSender.sendLog("sessions.deleted")
  contextMenu.getMenuItemById("menuLogOutItem")!.visible = false
})

ipcMain.on(APIEvents.GET_ORGANIZATION_LIMITS, (data: unknown) => {
  const limits = data as IOrganizationLimits
  isScreenshotAllowed = limits.allow_screenshots
  logSender.sendLog("api.limits.get", stringify(data))

  if (mainWindow) {
    mainWindow.webContents.send(APIEvents.GET_ORGANIZATION_LIMITS, limits)
  }

  if (modalWindow) {
    modalWindow.webContents.send(APIEvents.GET_ORGANIZATION_LIMITS, limits)
  }
})

ipcMain.on("systemDialog:show", (evt, data) => {
  hideWindows()
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

ipcMain.on(DialogWindowEvents.CREATE, (evt, data: IDialogWindowData) => {
  if (modalWindow && modalWindow.isVisible()) {
    modalWindow.hide()
  }

  mainWindow.webContents.send(DialogWindowEvents.CREATE, data)

  createDialogWindow({ data })
  isDialogWindowOpen = true
})

ipcMain.on(
  DialogWindowEvents.CALLBACK,
  (evt, data: IDialogWindowCallbackData) => {
    if (data.action == "cancel") {
      destroyDialogWindow()
      mainWindow.focusOnWebView()
    }

    if (data.action == "ok") {
      destroyDialogWindow()
      mainWindow.focusOnWebView()
    }

    mainWindow.webContents.send(DialogWindowEvents.CALLBACK, data)
    isDialogWindowOpen = false
  }
)

ipcMain.on(FileUploadEvents.FILE_CREATE_ON_SERVER_ERROR, (event: unknown) => {
  dialog.showMessageBox(mainWindow, {
    type: "error",
    title: "Ошибка. Не удалось загрузить файл на сервер",
    message:
      "Загрузка файла будет повторяться в фоновом процессе, пока он не будет отправлен на сервер. Как только файл будет загружен, вы увидите его в своей библиотеке.",
  })
})

powerMonitor.on("suspend", () => {
  StorageService.sleep()
  const isRecording = ["recording", "paused"].includes(
    store.get()["recordingState"]
  )
  logSender.sendLog("powerMonitor.suspend")

  if (isRecording) {
    const data: ISimpleStoreData = {
      key: "recordingState",
      value: "stopped",
    }
    ipcMain.emit(SimpleStoreEvents.UPDATE, null, data)
  }
})
