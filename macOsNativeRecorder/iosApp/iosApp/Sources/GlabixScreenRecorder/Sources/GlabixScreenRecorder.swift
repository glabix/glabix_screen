import Foundation
import ArgumentParser
import CoreGraphics

@main
struct GlabixScreenRecorder: ParsableCommand {
//    @Argument(help: "JSON configuration for recording (optional)")
//    var configJSON: String?
    
    func run() throws {
        let recorder = ScreenRecorderService()
        
        while let input = readLine() {
            defer { fflush(stdout) }
            
            let commandJSON = input.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let jsonData = commandJSON.data(using: .utf8) else { continue }
            
            do {
                let command = try JSONDecoder().decode(Command.self, from: jsonData)
                debugPrint("command", command)
                
                switch command.action {
                    case .start:
                        recorder.startRecording(config: command.config ?? .default)
                    case .stop:
                        recorder.stopRecording()
                    case .pause:
                        recorder.pause()
                    case .resume:
                        recorder.resume()
                }
            } catch {
                let action = commandJSON
                switch action {
                    case "start":
                        recorder.startRecording(config: .default)
                    case "stop":
                        recorder.stopRecording()
                    case "pause", "p":
                        recorder.pause()
                    case "resume", "r":
                        recorder.resume()
                    default:
                        print("invalid command format", error)
                }
            }
        }
    }
}


