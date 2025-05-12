import { RecordEvents, SwiftRecorderEvents } from "@shared/events/record.events"
import { spawn } from "child_process"
import { app, ipcMain } from "electron"
import os from "os"
import path, { join } from "path"
import { LogSender } from "./log-sender"

const logSender = new LogSender()
const packageDir = app.isPackaged
  ? join(app.getAppPath(), "..", "extra-resources", "swift-recorder")
  : join(import.meta.dirname, "../../extra-resources/swift-recorder")
// const extraPackageDir = join(app.getAppPath(), '..', "extra-resources");
// path.join(electronUtil.fixPathForAsarUnpack(__dirname), 'audio-devices')
// logSender.sendLog("packageDir dir", `${packageDir}`)

const toolPath = join(packageDir, "GlabixScreenRecorder")

logSender.sendLog("native recorder dir", `${toolPath}`)

// export const swiftProcess = spawn(toolPath)
export const swiftProcess = spawn(toolPath)
logSender.sendLog("swiftProcess", `${swiftProcess}`)
// const child = spawn('echo', ['Hello, World!']);

swiftProcess.stdout.on("data", (data) => {
  console.log(`
    Swift Output: ${data.toString()}
  `)
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

function startRecording() {
  // swiftProcess.stdin.write('{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": 0}}\n');
  const chunkDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    app.getName(),
    "chunks_storage"
  )
  const startAction = `{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": 69734406, "resolution": "uhd4k", "cropRect": null, "captureSystemAudio": true, "captureMicrophone": false, "chunksDirectoryPath": "${chunkDir}"}}\n`
  // console.log('startAction', startAction)
  // const params = `{"action": "start", "config": {"fps": 30, "captureSystemAudio": true, "captureMicrophone": false, "showCursor": true, "displayId": 69734406, "resolution": "uhd4k", "cropRect": null, "chunksDirectoryPath": "/Users/artembydiansky/Library/Application Support/glabix-screen/chunks_storage" }}\n`
  swiftProcess.stdin.write(startAction)
  // logSender.sendLog("chunkDir", `${chunkDir}`)
  // execa(toolPath, [startAction]).then((res) => {
  //   console.log(`execa start ${res}`)
  // })
  // console.log(`
  //   ===========
  //   start
  // `)
}

function stopRecording() {
  swiftProcess.stdin.write('{"action": "stop"}\n')
  // logSender.sendLog("stopRecording", `stopRecording`)
  // execa(toolPath, ['{"action": "stop"}']).then()
  console.log(`
    stop
    ===========
  `)
}

function pauseRecording() {
  // swiftProcess.stdin.write('{"action": "pause"}\n')
  swiftProcess.stdin.write("pause\n")
  console.log(`
    pause
    ===========
  `)
}

function resumeRecording() {
  // swiftProcess.stdin.write('{"action": "resume"}\n')
  swiftProcess.stdin.write("resume\n")
  console.log(`
    resume
    ===========
  `)
}

ipcMain.on(SwiftRecorderEvents.START, (event, data) => {
  startRecording()
})
ipcMain.on(SwiftRecorderEvents.STOP, (event, data) => {
  stopRecording()
})
ipcMain.on(SwiftRecorderEvents.PAUSE, (event, data) => {
  pauseRecording()
})
ipcMain.on(SwiftRecorderEvents.RESUME, (event, data) => {
  resumeRecording()
})

// (async () => {
//   try {
//     const { stdout } = await execa(toolPath, );
//     console.log(`stdout: ${stdout}`);
//   } catch (error) {
//     console.error(`stderr: ${error}`);
//   }
// })();
