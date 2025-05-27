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

// import audioDevices from 'macos-audio-devices'
// import mic from 'mic'
// import Analyser from 'audio-analyser'
// import fs from "fs"
// import { Transform } from "stream"
// let analyser: any

const CALLBACK_SEPARATOR = "[glabix-screen.callback]"
let audioInputDevices: IMediaDevice[] = []
let swiftProcess: ChildProcessWithoutNullStreams | null = null
let waveFormProcess: ChildProcessWithoutNullStreams | null = null
const logSender = new LogSender()
let isRecording = false

// console.log(`
//   macos-audio-devices:
// `, audioDevices.getDefaultInputDevice.sync().uid)

// analyzeAudioFromDevice('default')

if (os.platform() == "darwin") {
  let swiftRecorderConfig: ISwiftRecorderConfig = {}

  let browserMediaDevices: MediaDeviceInfo[] = []
  // const audioDevices: MediaDeviceInfo[] = []

  function kill() {
    swiftProcess?.kill()
  }

  function init(path: string) {
    swiftProcess = spawn(path)

    swiftProcess.stdout.on("data", (data) => {
      console.log(`
        swiftProcess Output: ${data.toString()}
        `)
      parseCallbackByActions(data.toString())
      // logSender.sendLog(`
      //     Swift Output: ${data.toString()}
      //   `)
    })

    swiftProcess.stderr.on("data", (data) => {
      // logSender.sendLog("swiftProcess.stderr.on('data'): ", `${data.toString()}`)
      console.error(`
        stderr: ${data}
        `)
    })

    swiftProcess.on("close", (code) => {
      console.log(`детский процесс завершился с кодом ${code}`)
    })

    waveFormProcess = spawn(path)
    waveFormProcess.stdout.on("data", (data) => {
      console.log(`
        waveFormProcess Output: ${data.toString()}
      `)
      parseCallbackByActions(data.toString())
      // logSender.sendLog(`
      //     Swift Output: ${data.toString()}
      //   `)
    })
  }

  const packageDir = app.isPackaged
    ? join(app.getAppPath(), "..", "extra-resources", "swift-recorder")
    : join(import.meta.dirname, "../../extra-resources/swift-recorder")

  const toolPath = join(packageDir, "GlabixScreenRecorder")

  init(toolPath)
  getMics()
  // configureRecording()

  function configRecording(config: ISwiftRecorderConfig): string {
    let result = ""
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
    result = `{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": ${config.displayId}, "resolution": "uhd4k", "cropRect": ${cropRect}, "captureSystemAudio": ${Boolean(config.systemAudio)}, "captureMicrophone": ${Boolean(config.audioDeviceId)}, ${config.audioDeviceId ? '"microphoneUniqueID":' + '"' + config.audioDeviceId + '",' : ""} "chunksDirectoryPath": "${chunkDir}"}}\n`
    logSender.sendLog("SwiftRecorder start config: ", JSON.stringify(config))
    logSender.sendLog("SwiftRecorder init: ", result)
    return result
  }

  function configureRecording() {
    const action = `{"action": "configure", "config": {"fps": 30, "showCursor": true, "displayId": null, "resolution": "uhd4k", "cropRect": null, "captureSystemAudio": false, "captureMicrophone": true}}\n`
    swiftProcess?.stdin.write(action)
  }

  function startRecording(_config: ISwiftRecorderConfig) {
    // swiftProcess.stdin.write('{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": 0}}\n');

    const params = `{"action": "start", "config": {"fps": 30, "captureSystemAudio": true, "captureMicrophone": false, "showCursor": true, "displayId": 69734406, "resolution": "uhd4k", "cropRect": null, "chunksDirectoryPath": "/Users/artembydiansky/Library/Application Support/glabix-screen/chunks_storage" }}\n`
    const config = configRecording(_config)
    const startAction = `{"action": "start", "config":${config}`
    swiftProcess?.stdin.write(startAction)
    // console.log('startAction', startAction)
  }

  function getMics() {
    // const isRecording = ["recording", "paused"].includes(
    //   store.get()["recordingState"]
    // )
    // kill()
    // init(toolPath)
    swiftProcess?.stdin.write('{"action": "printAudioInputDevices"}\n')
    logSender.sendLog('{"action": "printAudioInputDevices"}\n')
  }

  function stopRecording() {
    swiftProcess?.stdin.write('{"action": "stop"}\n')
    // logSender.sendLog("stopRecording", `stopRecording`)
    // execa(toolPath, ['{"action": "stop"}']).then()
    console.log(`
      stop
      ===========
    `)
  }

  function pauseRecording() {
    swiftProcess?.stdin.write('{"action": "pause"}\n')
    // swiftProcess.stdin.write("pause\n")
    console.log(`
      pause
      ===========
    `)
  }

  function resumeRecording() {
    swiftProcess?.stdin.write('{"action": "resume"}\n')
    // swiftProcess.stdin.write("resume\n")
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
    SwiftRecorderEvents.CROP_UPDATE,
    (event, cropRect: Rectangle | undefined) => {
      swiftRecorderConfig = { ...swiftRecorderConfig, cropRect }
    }
  )

  ipcMain.on(
    RecordSettingsEvents.UPDATE,
    (event, settings: IStreamSettings) => {
      // console.log(`
      //   RecordSettingsEvents.UPDATE swift-recorder.helper.ts
      // `, settings)
      assignSettingsToConfig(settings)
    }
  )

  ipcMain.on(RecordSettingsEvents.INIT, (event, settings: IStreamSettings) => {
    // console.log(`
    //   RecordSettingsEvents.INIT
    // `, settings)
    assignSettingsToConfig(settings)
  })

  ipcMain.on(
    SwiftRecorderEvents.START,
    (event, config: ISwiftRecorderConfig) => {
      console.log(
        `
      config
      `,
        config
      )
      swiftRecorderConfig = {
        ...swiftRecorderConfig,
        ...config,
      }

      swiftRecorderConfig = filterStreamSettings(swiftRecorderConfig)

      console.log(
        `
      SwiftRecorderEvents.START
    `,
        swiftRecorderConfig
      )

      startRecording(swiftRecorderConfig)
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
    console.log("isRecording", isRecording)
    if (isRecording) {
      return
    }

    getMics()
  })
}

ipcMain.handle(SwiftMediaDevicesEvents.GET_DEVICES, (event, key) => {
  return audioInputDevices
})

function parseCallback(str: string): any[] {
  let res: any[] = []
  if (str) {
    const actionStr = str
      .split(CALLBACK_SEPARATOR)
      .map((s) => s.trim())
      .filter((s) => Boolean(s))
    actionStr.forEach((s) => {
      if (s.includes('{"action":') || s.includes('{ "action":')) {
        try {
          res.push(JSON.parse(s))
        } catch (e) {}
      }
    })
  }
  // console.log('res', res)
  return res
}

function parseCallbackByActions(str: string) {
  if (str) {
    const allActions = parseCallback(str)
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
      ipcMain.emit(SwiftMediaDevicesEvents.CHANGE, null, audioInputDevices)
    }

    const waveFormAction = allActions.filter(
      (i) => i.action == SwiftRecorderCallbackActions.GET_AUDIO_WAVE_FORM
    )

    // console.log(`
    //   ====parseCallbackByActions====
    //   waveFormAction:
    // `, waveFormAction)

    if (waveFormAction.length) {
      ipcMain.emit(
        SwiftMediaDevicesEvents.GET_WAVE_FORM,
        null,
        waveFormAction[0].amplitudes
      )
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

// function initMicStream(deviceId: any) {

//   const micInstance = mic({
//     rate: '16000',
//     channels: '1',
//     debug: true,
//     // exitOnSilence: 6,
//     device: deviceId // Укажите здесь ваш идентификатор устройства
//   });

//   // var outputFileStream = fs.WriteStream('output.raw');

//   const micInputStream = micInstance.getAudioStream();
//   // micInputStream.pipe(outputFileStream);
//   // Трансформирующий поток для анализа данных
// // const volumeAnalyser = new Transform({
// //   transform(chunk, encoding, callback) {
// //     const volume = getRMS1(chunk);
// //     console.log(`Current volume level: ${volume}`);
// //     callback(null, chunk);
// //   },
// // });

// // // Функция для вычисления RMS (корня среднего квадрата)
// // function getRMS1(buffer) {
// //   let sum = 0;
// //   for (let i = 0; i < buffer.length; i++) {
// //     const sample = buffer.readInt16LE(i * 2); // Чтение 16-битного значения
// //     sum += sample * sample;
// //   }
// //   return Math.sqrt(sum / (buffer.length / 2));
// // }

// // // Подключение аудиопотока к анализатору
// // micInputStream.pipe(volumeAnalyser);

//   // Конфигурация анализатора
// const analyserOptions = {
//   minDecibels: -90, // Минимальный уровень децибел
//   maxDecibels: -10, // Максимальный уровень децибел
//   smoothingTimeConstant: 0.85, // Параметр сглаживания
//   fftSize: 256, // Размер FFT
// };

// analyser = new Analyser(analyserOptions);
// micInputStream.pipe(analyser);
// console.log(`
//   analyser
//   `, analyser)

// // Подключение аудиопотока к анализатору

// console.log(`
//   analyser.getByteTimeDomainData(1024):
// `), analyser.getByteTimeDomainData(1024);
// // Обработка данных из анализатора
// analyser.on('data', (data) => {
//   const volume = getRMS(data); // Функция для вычисления корня среднего квадрата
//   console.log(`
//     Current volume level: ${volume}
//   `);
// });

// // Функция для вычисления RMS (корня среднего квадрата)
// function getRMS(data) {
//   let sum = 0;
//   for (let i = 0; i < data.length; i++) {
//     sum += data[i] * data[i];
//   }
//   return Math.sqrt(sum / data.length);
// }

//   console.log(`
//     micInputStream:
//     `, micInputStream);

//   micInputStream.on('data', function(data) {
//     console.log(`
//       Received Input Stream: `,
//       data);
//     // Обработка данных аудио потока
//   });

//   micInputStream.on("startComplete", (data) => {
//     console.log(`
//       startComplete: `,
//       data);
//   })
//   micInputStream.on("stopComplete", (data) => {
//     console.log(`
//       stopComplete: `,
//       data);
//   })

//   micInputStream.on('error', function(err) {
//     console.log("Error in Input Stream: " + err);
//   });

//   // Запуск записи
//   micInstance.start();

//   // setTimeout(() => {
//   //   micInstance.stop();
//   // }, 5000); // Остановить запись через 5 секунд
// }

// Функция для анализа уровня сигнала
// function analyzeAudioFromDevice(deviceId) {
//   console.log('deviceId', deviceId)
//   const micInstance = mic({
//     rate: '44100',
//     channels: '1',
//     device: deviceId, // Указываем идентификатор устройства
//     debug: true,
//     exitOnSilence: 6,
//   });

//   const micInputStream = micInstance.getAudioStream();

//   const volumeAnalyser = new Transform({
//     transform(chunk, encoding, callback) {
//       const volume = getRMS(chunk);
//       console.log(`Current volume level: ${volume}`);
//       callback(null, chunk);
//     },
//   });

//   console.log(`
//     micInputStream / volumeAnalyser
//     `, volumeAnalyser
//   )

//   function getRMS(buffer) {
//     let sum = 0;
//     for (let i = 0; i < buffer.length / 2; i++) {
//       const sample = buffer.readInt16LE(i * 2);
//       sum += sample * sample;
//     }
//     const rms = Math.sqrt(sum / (buffer.length / 2));
//     console.log(`RMS calculated: ${rms}`); // Добавьте это
//     return rms;
//   }

//   micInputStream.pipe(volumeAnalyser);

//   micInputStream.on('data', (data) => {
//   console.log('Audio data received:', data);
//   });

//   micInputStream.on('startComplete', () => {
//     console.log('Microphone stream started');
//   });

//   micInputStream.on('processExitComplete', () => {
//     console.log('Microphone stream exited');
//   });

//   micInputStream.on('error', (err) => {
//     console.error('Error in Input Stream: ' + err);
//   });

//   micInstance.start();
// }

// ipcMain.handle('getAudioAnalizer', async (event, key) => {
//   console.log(`
//     analyser.getByteTimeDomainData(1024)
//     `, analyser.getByteTimeDomainData(1024))
//   return analyser.toString()
// })
