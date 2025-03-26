export enum AppUpdaterEvents {
  // Updater callbacks
  ERROR = "appUpdater:error",
  DOWNLOAD_END = "appUpdater:download:end",
  DOWNLOAD_PROGRESS = "appUpdater:download:progress",
  CHECK_FOR_UPDATE = "appUpdater:update:check",
  UPDATE_AVAILABLE = "appUpdater:update:available",
  UPDATE_NOT_AVAILABLE = "appUpdater:update:notAvailable",

  // Renderer events
  DOWNLOAD_START = "appUpdater:download:start", // click download btn
  HAS_UPDATE = "appUpdater:hasUpdate", // show
}
