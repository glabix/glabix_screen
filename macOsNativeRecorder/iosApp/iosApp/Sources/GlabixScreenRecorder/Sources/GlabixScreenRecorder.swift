import Foundation
import ArgumentParser

@main
struct GlabixScreenRecorder: AsyncParsableCommand {
//    @Argument(help: "JSON configuration for recording (optional)")
//    var configJSON: String?
    
    static let configuration: CommandConfiguration = CommandConfiguration(
        commandName: "waveform",
        abstract: "waveform mode",
        subcommands: [GlabixWaveform.self]
    )
    
    @Option(
        name: .shortAndLong,
        help: "Print debug info"
    )
    var verbose: Bool = true
    
    func run() async throws {
        Log.shared.verbose = verbose
        
        Log.success("Recorder module launched \(verbose)")
        
        let captureDevicesObserver = CaptureDevicesObserver()
        let recorder = ScreenRecorder()
        
        let commandTask = Task {
            while let input = readLine() {
                defer { fflush(stdout) }
                
                let commandJSON = input.trimmingCharacters(in: .whitespacesAndNewlines)
                guard let jsonData = commandJSON.data(using: .utf8) else { continue }
                
                do {
                    let command = try JSONDecoder().decode(Command.self, from: jsonData)
                    debugPrint("command", command)
                    
                    // {"action": "printAudioInputDevices"}
                    switch command.action {
                        case .configure:
                            try? await recorder.configureAndInitialize(with: command.config!)
                        case .start:
                            await recorder.start()
                        case .stop:
                            await recorder.stop()
                        case .pause:
                            await recorder.pause()
                        case .resume:
                            await recorder.resume()
                        case .printAudioInputDevices:
                            recorder.printAudioInputDevices()
//                        case .printVideoInputDevices:
//                            recorder.printVideoInputDevices()
                    }
                } catch {
                    let action = commandJSON
                    switch action {
                        case "config", "c":
                            try? await recorder.configureAndInitialize(with: .development)
                        case "start", "s":
                            await recorder.start()
                        case "stop", "t":
                            await recorder.stop()
                        case "pause", "p":
                            await recorder.pause()
                        case "resume", "r":
                            await recorder.resume()
                        case "mics":
                            recorder.printAudioInputDevices()
//                        case "cams":
//                            recorder.printVideoInputDevices()
                        default:
                            print("invalid command format", error)
                    }
                }
                await Task.yield()
            }
        }
        await commandTask.value
    }
}


