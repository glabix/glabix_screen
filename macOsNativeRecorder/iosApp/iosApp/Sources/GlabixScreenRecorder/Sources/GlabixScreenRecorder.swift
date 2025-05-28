import Foundation
import ArgumentParser

@main
struct GlabixScreenRecorder: ParsableCommand {
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
    
    func run() throws {
        Log.shared.verbose = verbose
        
        Log.success("Recorder module launched \(verbose)")
        
        let recorder = ScreenRecorderService()
        
        DispatchQueue.global().async {
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
                            recorder.configureRecorder(with: command.config ?? .default)
                        case .start:
                            recorder.startRecording()
                        case .startWithConfig:
                            recorder.startRecording(withConfig: command.config ?? .default)
                        case .stop:
                            recorder.stopRecording()
                        case .pause:
                            recorder.pause()
                        case .resume:
                            recorder.resume()
                        case .printAudioInputDevices:
                            recorder.printAudioInputDevices()
//                        case .printVideoInputDevices:
//                            recorder.printVideoInputDevices()
                    }
                } catch {
                    let action = commandJSON
                    switch action {
                        case "config":
                            recorder.configureRecorder(with: .default)
                        case "start":
                            recorder.startRecording()
                        case "startWithConfig":
                            recorder.startRecording(withConfig: .default)
                        case "stop":
                            recorder.stopRecording()
                        case "pause", "p":
                            recorder.pause()
                        case "resume", "r":
                            recorder.resume()
                        case "mics":
                            recorder.printAudioInputDevices()
//                        case "cams":
//                            recorder.printVideoInputDevices()
                        default:
                            print("invalid command format", error)
                    }
                }
            }
        }
        RunLoop.main.run()
    }
}


