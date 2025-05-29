import {
  RecordEvents,
  RecordSettingsEvents,
} from "@shared/events/record.events"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import { app, ipcMain, Rectangle } from "electron"
import os from "os"
import path, { join } from "path"
import { LogSender } from "./log-sender"
import {
  IMediaDevice,
  IStreamSettings,
  SimpleStoreEvents,
} from "@shared/types/types"
import {
  ISwiftMediaDevice,
  ISwiftRecorderCallbackAudioDevices,
  ISwiftRecorderConfig,
  SwiftMediaDevicesEvents,
  SwiftRecorderCallbackActions,
  SwiftRecorderEvents,
} from "@shared/types/swift-recorder.types"
import { AppEvents } from "@shared/events/app.events"

// import audioDevices from 'macos-audio-devices'
// import mic from 'mic'
// import Analyser from 'audio-analyser'
// import fs from "fs"
// import { Transform } from "stream"
// let analyser: any

const CALLBACK_START = "[glabix-screen.callback]"
const CALLBACK_END = "###END"
let audioInputDevices: IMediaDevice[] = []
let recorderProcess: ChildProcessWithoutNullStreams | null = null
let waveFormProcess: ChildProcessWithoutNullStreams | null = null
const logSender = new LogSender()
let isRecording = false

// console.log(`
//   macos-audio-devices:
// `, audioDevices.getDefaultInputDevice.sync().uid)

// analyzeAudioFromDevice('default')

if (os.platform() == "darwin") {
  let swiftRecorderConfig: ISwiftRecorderConfig = {}

  // let browserMediaDevices: MediaDeviceInfo[] = []
  // const audioDevices: MediaDeviceInfo[] = []

  function kill() {
    recorderProcess?.kill()
    waveFormProcess?.kill()
  }

  function init(path: string) {
    recorderProcess = spawn(path)

    recorderProcess.stdout.on("data", (data) => {
      console.log(`
        recorderProcess Output: ${data.toString()}
        `)
      parseCallbackByActions(data.toString())
      // logSender.sendLog(`
      //     Swift Output: ${data.toString()}
      //   `)
    })

    recorderProcess.stderr.on("data", (data) => {
      // logSender.sendLog("recorderProcess.stderr.on('data'): ", `${data.toString()}`)
      console.error(`
        recorderProcess stderr: ${data}
        `)
    })

    recorderProcess.on("close", (code) => {
      console.log(`детский процесс завершился с кодом ${code}`)
    })

    waveFormProcess = spawn(path, ["glabix-waveform"])
    waveFormProcess.stdout.on("data", (data) => {
      // console.log(`
      //   waveFormProcess Output: ${data.toString()}
      // `)
      parseWaveFormCallbackByAction(data.toString())
      // logSender.sendLog(`
      //     Swift Output: ${data.toString()}
      //   `)
    })

    waveFormProcess.stderr.on("data", (data) => {
      // logSender.sendLog("recorderProcess.stderr.on('data'): ", `${data.toString()}`)
      console.error(`
        waveFormProcess stderr: ${data}
        `)
    })
  }

  const packageDir = app.isPackaged
    ? join(app.getAppPath(), "..", "extra-resources", "swift-recorder")
    : join(import.meta.dirname, "../../extra-resources/swift-recorder")

  const toolPath = join(packageDir, "GlabixScreenRecorder")

  init(toolPath)
  getMics()
  // configureRecording()

  function configRecording() {
    const config = { ...swiftRecorderConfig }
    let action = ""
    const chunkDir = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      app.getName(),
      "chunks_storage"
    )
    const cropRect = config.cropRect
      ? `{"x": ${config.cropRect.x}, "y": ${config.cropRect.y}, "width": ${config.cropRect.width}, "height": ${config.cropRect.height}}`
      : null
    action = `{"action": "configure", "config": {"fps": 30, "showCursor": true, "displayId": ${config.displayId}, "resolution": "uhd4k", "cropRect": ${cropRect}, "captureSystemAudio": ${Boolean(config.systemAudio)}, "captureMicrophone": ${Boolean(config.audioDeviceId)}, ${config.audioDeviceId ? '"microphoneUniqueID":' + '"' + config.audioDeviceId + '",' : ""} "chunksDirectoryPath": "${chunkDir}"}}\n`
    recorderProcess?.stdin.write(action)
    // return result
  }

  // function createConfigAction(config: ISwiftRecorderConfig): string {
  //   let action = ""
  //   const chunkDir = path.join(
  //     os.homedir(),
  //     "Library",
  //     "Application Support",
  //     app.getName(),
  //     "chunks_storage"
  //   )
  //   const cropRect = config.cropRect
  //     ? `{"x": ${config.cropRect.x}, "y": ${config.cropRect.y}, "width": ${config.cropRect.width}, "height": ${config.cropRect.height}}`
  //     : null
  //   return action = `{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": ${config.displayId}, "resolution": "uhd4k", "cropRect": ${cropRect}, "captureSystemAudio": ${Boolean(config.systemAudio)}, "captureMicrophone": ${Boolean(config.audioDeviceId)}, ${config.audioDeviceId ? '"microphoneUniqueID":' + '"' + config.audioDeviceId + '",' : ""} "chunksDirectoryPath": "${chunkDir}"}}\n`
  // }

  function startRecording() {
    recorderProcess?.stdin.write('{"action": "start"}\n')
    logSender.sendLog('{"swift-recorder": "start"}')
    // recorderProcess.stdin.write('{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": 0}}\n');

    // const params = `{"action": "start", "config": {"fps": 30, "captureSystemAudio": true, "captureMicrophone": false, "showCursor": true, "displayId": 69734406, "resolution": "uhd4k", "cropRect": null, "chunksDirectoryPath": "/Users/artembydiansky/Library/Application Support/glabix-screen/chunks_storage" }}\n`
    // const config = configRecording(_config)
    // const startAction = `{"action": "start", "config":${config}`
    // recorderProcess?.stdin.write(startAction)
    // console.log('startAction', startAction)
  }

  function getMics() {
    // const isRecording = ["recording", "paused"].includes(
    //   store.get()["recordingState"]
    // )
    // kill()
    // init(toolPath)
    recorderProcess?.stdin.write('{"action": "printAudioInputDevices"}\n')
    logSender.sendLog('{"swift-recorder": "printAudioInputDevices"}\n')
  }

  function startWaveForm() {
    const config = { ...swiftRecorderConfig }
    const action = `{"action": "start", "config": {"microphoneUniqueID": "${config.audioDeviceId}"}}\n`
    waveFormProcess?.stdin.write(action)
  }

  function stopWaveForm() {
    waveFormProcess?.stdin.write('{"action": "stop"}\n')
  }

  function stopRecording() {
    recorderProcess?.stdin.write('{"action": "stop"}\n')
    // logSender.sendLog("stopRecording", `stopRecording`)
    // execa(toolPath, ['{"action": "stop"}']).then()
    console.log(`
      stop
      ===========
    `)
  }

  function pauseRecording() {
    recorderProcess?.stdin.write('{"action": "pause"}\n')
    // recorderProcess.stdin.write("pause\n")
    console.log(`
      pause
      ===========
    `)
  }

  function resumeRecording() {
    recorderProcess?.stdin.write('{"action": "resume"}\n')
    // recorderProcess.stdin.write("resume\n")
    console.log(`
      resume
      ===========
    `)
  }

  function filterStreamSettings(settings: any): any {
    const audioDeviceId =
      settings.audioDeviceId == "no-microphone"
        ? undefined
        : settings.audioDeviceId
    const cameraDeviceId =
      settings.cameraDeviceId == "no-camera"
        ? undefined
        : settings.cameraDeviceId
    const result = { ...settings, audioDeviceId, cameraDeviceId }
    return result
  }

  function assignSettingsToConfig(_settings: IStreamSettings) {
    const settings = filterStreamSettings(_settings)
    swiftRecorderConfig = {
      ...swiftRecorderConfig,
      audioDeviceId: settings.audioDeviceId,
      systemAudio: settings.audio,
    }
  }

  ipcMain.on(
    RecordSettingsEvents.UPDATE,
    (event, settings: IStreamSettings) => {
      // console.log(`
      //   RecordSettingsEvents.UPDATE swift-recorder.helper.ts
      // `, settings)
      assignSettingsToConfig(settings)
      configRecording()
    }
  )

  ipcMain.on(RecordSettingsEvents.INIT, (event, settings: IStreamSettings) => {
    // console.log(`
    //   RecordSettingsEvents.INIT
    // `, settings)
    assignSettingsToConfig(settings)
    configRecording()
  })

  ipcMain.on(SwiftRecorderEvents.START_WAVE_FORM, (event, data) => {
    startWaveForm()
  })
  ipcMain.on(SwiftRecorderEvents.STOP_WAVE_FORM, (event, data) => {
    stopWaveForm()
  })

  ipcMain.on(
    SwiftRecorderEvents.START,
    (event, config: ISwiftRecorderConfig) => {
      // console.log(
      //   `
      // config
      // `,
      //   config
      // )
      // swiftRecorderConfig = {
      //   ...swiftRecorderConfig,
      //   ...config,
      // }

      // swiftRecorderConfig = filterStreamSettings(swiftRecorderConfig)

      console.log(
        `
        SwiftRecorderEvents.START
      `
      )

      startRecording()
    }
  )
  ipcMain.on(SwiftRecorderEvents.STOP, (event, data) => {
    stopRecording()
  })
  ipcMain.on(SwiftRecorderEvents.PAUSE, (event, data) => {
    pauseRecording()
  })
  ipcMain.on(SwiftRecorderEvents.RESUME, (event, data) => {
    resumeRecording()
  })

  ipcMain.on("devicechange", (event, data) => {
    if (isRecording) {
      return
    }

    getMics()
  })

  ipcMain.on(
    SwiftRecorderEvents.CONFIGURE,
    (event, newConfig: ISwiftRecorderConfig) => {
      console.log(
        `
      prev config
    `,
        swiftRecorderConfig
      )
      swiftRecorderConfig = { ...swiftRecorderConfig, ...newConfig }
      configRecording()
      console.log(
        `
      new config
    `,
        swiftRecorderConfig
      )
    }
  )

  ipcMain.on(AppEvents.ON_HIDE, (event, data) => {
    stopRecording()
    stopWaveForm()
  })

  ipcMain.on(AppEvents.ON_SHOW, (event, data) => {
    configRecording()
  })
}

ipcMain.handle(SwiftMediaDevicesEvents.GET_DEVICES, (event, key) => {
  return audioInputDevices
})

function parseCallback(str: string): any[] {
  let res: any[] = []
  if (str) {
    const actionStr = str
      .split(CALLBACK_START)
      .map((s) => s.trim())
      .filter((s) => Boolean(s))
      .flatMap((s) => s.split(CALLBACK_END))

    actionStr.forEach((s) => {
      if (s.includes('{"action":') || s.includes('{ "action":')) {
        try {
          res.push(JSON.parse(s))
        } catch (e) {}
      }
    })
  }
  return res
}

function parseWaveFormCallbackByAction(str: string) {
  if (str) {
    const allActions = parseCallback(str)

    const waveFormAction = allActions.filter(
      (i) => i.action == SwiftRecorderCallbackActions.GET_AUDIO_WAVE_FORM
    )

    if (waveFormAction.length) {
      ipcMain.emit(
        SwiftMediaDevicesEvents.GET_WAVE_FORM,
        null,
        waveFormAction[0].amplitudes
      )
    }
  }
}

function parseCallbackByActions(str: string) {
  if (str) {
    const allActions = parseCallback(str)

    console.log("allActions", allActions)
    if (allActions.length) {
    }

    const startActions = allActions.filter(
      (i) => i.action == SwiftRecorderCallbackActions.RECORD_STARTED
    )
    if (startActions.length) {
      // - emit action
      // console.log(`
      //   ====parseCallbackByActions====
      //   startActions:
      // `, startActions)
    }

    const stopAction = allActions.filter(
      (i) => i.action == SwiftRecorderCallbackActions.RECORD_STOPPED
    )
    if (stopAction.length) {
      // - emit action
      // console.log(`
      //   ====parseCallbackByActions====
      //   stopActions:
      // `, stopAction)
    }

    const chunkFinalizedAction = allActions.filter(
      (i) => i.action == SwiftRecorderCallbackActions.CHUNK_FINALIZED
    )
    if (chunkFinalizedAction.length) {
      // - emit action
      // console.log(`
      //   ====parseCallbackByActions====
      //   chunkFinalizedAction:
      //   `, chunkFinalizedAction)
    }

    const swiftAudioInputAction = allActions.filter(
      (i) => i.action == SwiftRecorderCallbackActions.GET_AUDIO_INPUT_DEVICES
    ) as ISwiftRecorderCallbackAudioDevices[]

    // console.log(`
    //   ====parseCallbackByActions====
    //   swiftAudioInputAction:
    // `, swiftAudioInputAction , allActions)

    if (swiftAudioInputAction.length) {
      // audioInputDevices = [...swiftAudioInputDevices]
      const audioMediaDevices: IMediaDevice[] =
        swiftAudioInputAction[0]!.devices.map((d) => ({
          isDefault: d.isDefault,
          label: d.name,
          deviceId: d.id,
          kind: "audioinput",
        }))
      audioInputDevices = [...audioMediaDevices]
      // - emit action

      console.log(
        `
        audioInputDevices
      `,
        audioInputDevices
      )
      ipcMain.emit(SwiftMediaDevicesEvents.CHANGE, null, audioInputDevices)
    }
  }

  // if (str) {
  //   const actionStr = str.split(CALLBACK_SEPARATOR).map(s => s.trim()).filter(s => Boolean(s))
  //   actionStr.forEach(s => {
  //     const objArr = s.split('{').flatMap(s => s.split('}')).filter(s => s.includes('":')).flatMap(s => `{${s}}`)
  //     objArr.forEach(s => {
  //       if (s.includes('"action":')) {
  //         try {
  //           actions.push(JSON.parse(s))
  //         } catch (e) {}
  //       }
  //     })
  //   })
  // }

  // return actions
}

ipcMain.on(SimpleStoreEvents.CHANGED, (event, state) => {
  isRecording = ["recording", "paused"].includes(state["recordingState"])
})

app.on("before-quit", () => {
  recorderProcess?.kill()
  waveFormProcess?.kill()
})
