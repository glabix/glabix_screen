import { RecordEvents } from "@shared/events/record.events"
import { spawn } from "child_process"
import { app, ipcMain } from "electron"
import os from "os"
import path, { join } from "path"
import { LogSender } from "./log-sender"
import { execa } from "execa"
const logSender = new LogSender()

const homeDir = os.homedir()
const packageDir = app.isPackaged
  ? join(app.getAppPath(), "..", "extra-resources")
  : join(import.meta.dirname, "../../extra-resources/swift-recorder/prod")
// const extraPackageDir = join(app.getAppPath(), '..', "extra-resources");
// path.join(electronUtil.fixPathForAsarUnpack(__dirname), 'audio-devices')
logSender.sendLog("packageDir dir", `${packageDir}`)

const toolPath = join(packageDir, "GlabixScreenRecorder")

logSender.sendLog("native recorder dir", `${toolPath}`)

// export const swiftProcess = spawn(toolPath)
export const swiftProcess = spawn("echo", ["Hello, World!"])
logSender.sendLog("swiftProcess", `${swiftProcess}`)
// const child = spawn('echo', ['Hello, World!']);

swiftProcess.stdout.on("data", (data) => {
  // console.log(`
  //   Swift Output: ${data.toString()}
  //   `);
  logSender.sendLog(`
      Swift Output: ${data.toString()}
    `)
})

swiftProcess.stderr.on("data", (data) => {
  console.error(`
    stderr: ${data}
    `)
})

swiftProcess.on("close", (code) => {
  console.log(`детский процесс завершился с кодом ${code}`)
})

function startRecording() {
  // swiftProcess.stdin.write('{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": 0}}\n');
  const startAction = `{"action": "start", "config": {"fps": 30, "showCursor": true, "displayId": 69734406, "resolution": "uhd4k", "cropRect": null, "captureSystemAudio": true, "captureMicrophone": false, "chunksDirectoryPath": "${path.join(os.homedir(), "Library", "Application Support", app.getName(), "chunks_storage")}"}}\n`
  // console.log('startAction', startAction)
  // const params = `{"action": "start", "config": {"fps": 30, "captureSystemAudio": true, "captureMicrophone": false, "showCursor": true, "displayId": 69734406, "resolution": "uhd4k", "cropRect": null, "chunksDirectoryPath": "/Users/artembydiansky/Library/Application Support/glabix-screen/chunks_storage" }}\n`
  swiftProcess.stdin.write(startAction)
  execa(toolPath, [startAction]).then((res) => {
    console.log(`execa start ${res}`)
  })
  // console.log(`
  //   ===========
  //   start
  // `)
}

function stopRecording() {
  swiftProcess.stdin.write('{"action": "stop"}\n')
  // execa(toolPath, ['{"action": "stop"}']).then()
  console.log(`
    stop
    ===========
  `)
}

ipcMain.on(RecordEvents.START, (event, data) => {
  startRecording()
})
ipcMain.on("stop-recording", (event, data) => {
  stopRecording()
})

// (async () => {
//   try {
//     const { stdout } = await execa(toolPath, );
//     console.log(`stdout: ${stdout}`);
//   } catch (error) {
//     console.error(`stderr: ${error}`);
//   }
// })();
