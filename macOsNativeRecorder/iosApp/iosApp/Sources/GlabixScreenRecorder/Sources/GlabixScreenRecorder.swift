import Foundation
import ArgumentParser
import CoreGraphics

// {"action": "start", "config": {"fps": 25, "showCursor": false, "displayId": null, "resolution": "uhd4k", "cropRect": {"x": 10, "y": 10, "width": 1000, "height": 500}}}
// {"action": "start", "config": {"fps": 25, "showCursor": false, "displayId": null, "resolution": "uhd4k", "cropRect": null}}
// {"action": "stop"}

enum CommandAction: String, Codable {
    case start
    case stop
}

struct Command: Codable {
    let action: CommandAction
    let config: Config?
}

struct CropRect: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

struct Config: Codable {
    let fps: Int
    let displayId: CGDirectDisplayID? // nil for default
    let resolution: RecordResolution
    let cropRect: CropRect? // nil for full screen recording
    let chunksDirectoryPath: String?
    let showCursor: Bool
    let captureSystemAudio: Bool
    let captureMicrophone: Bool
    let microphoneUniqueID : String?
    
    static var `default`: Config {
        .init(
            fps: 30,
            displayId: nil,
            resolution: .uhd4k,
            cropRect: nil,
            chunksDirectoryPath: "/Users/pavelfeklistov/Documents/chunks",
            showCursor: true,
            captureSystemAudio: true,
            captureMicrophone: true,
            microphoneUniqueID: nil
        )
    }
}

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

class ScreenRecorderService {
    private let recorder = ScreenRecorder()
    private let commandQueue = DispatchQueue(label: "com.screenrecorder.commandQueue")
//    private let completionGroup = DispatchGroup()
    
    static func printCallback(_ message: String) {
        fflush(stdout)
        print("[glabix-screen] \(message)")
        fflush(stdout)
    }

    func pause() {
        commandQueue.async { [recorder] in
            Task { [recorder] in
                recorder.chunksManager?.pause()
            }
        }
    }
    
    func resume() {
        commandQueue.async { [recorder] in
            Task { [recorder] in
                recorder.chunksManager?.resume()
            }
        }
    }
            
    func startRecording(config: Config) {
//        completionGroup.enter()
        commandQueue.async { [recorder] in
            Task { [recorder] in
                defer { fflush(stdout) }
                do {
//                    try await self.recorder.startCapture(configJSON: configJSON)
                    try await recorder.start(config: config)
                    let path = recorder.chunksManager?.outputDirectory?.path() ?? "null"
                    ScreenRecorderService.printCallback("recording started at `\(path)`")
                } catch {
                    print("Error starting capture: \(error)")
//                    self.completionGroup.leave()
                }
            }
        }
    }
    
    func stopRecording() {
        commandQueue.async { [recorder] in
            Task { [recorder] in
                defer { fflush(stdout) }
                do {
                    recorder.stop()
                    print("Recording stopped")
//                    self.completionGroup.leave()
                } catch {
                    print("Error stopping capture: \(error)")
//                    self.completionGroup.leave()
                }
            }
        }
    }
    
//    func waitForCompletion() {
//        completionGroup.wait()
//    }
}
