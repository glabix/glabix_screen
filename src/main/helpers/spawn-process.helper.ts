import {
  ChildProcessWithoutNullStreams,
  spawn,
  SpawnOptionsWithoutStdio,
} from "child_process"

export default class SpawnProcess {
  private command: string
  private args: string[] | undefined
  private options?: SpawnOptionsWithoutStdio | undefined
  private process: ChildProcessWithoutNullStreams | null = null

  constructor(
    _command: string,
    _args?: string[],
    _options?: SpawnOptionsWithoutStdio
  ) {
    this.command = _command
    this.args = _args
    this.options = _options
    this.process = spawn(this.command, this.args, this.options)

    this.process.stdout.on("data", (data) => {
      this.onData(data)
    })

    this.process.stderr.on("data", (data) => {
      this.onError(data)
    })

    this.process.on("close", (code) => {
      this.onClose(code)
    })
  }

  init() {}

  write(chunk: any, callback?: (error: Error | null | undefined) => void) {
    if (!this.process) {
      return
    }

    this.process.stdin.write(chunk, callback)
  }

  onData(data) {
    // console.log(`stdout: ${data}`)
  }

  onError(data) {
    // console.error(`stderr: ${data}`, data)
  }

  onClose(code) {
    console.log(`Process exited with code ${code}`)
  }

  kill() {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}
