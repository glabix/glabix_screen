//
//  GlabixWaveform.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 27.05.2025.
//

import Foundation
import ArgumentParser

struct GlabixWaveform: ParsableCommand {
    @OptionGroup
    var options: GlabixScreenRecorder
    
    func run() throws {
        Log.success("Waveform module launched")
        
        let service = WaveformService()
        
        DispatchQueue.global().async {
            while let input = readLine() {
                defer { fflush(stdout) }
                
                let commandJSON = input.trimmingCharacters(in: .whitespacesAndNewlines)
                guard let jsonData = commandJSON.data(using: .utf8) else { continue }
                
                // {"action": "start", "config": {"microphoneUniqueID": null}}
                
                do {
                    let command = try JSONDecoder().decode(WaveformCommand.self, from: jsonData)
                    debugPrint("command", command)
                    
                    // {"action": "printAudioInputDevices"}
                    switch command.action {
                        case .start:
                            service.start(config: command.config ?? .default)
                        case .stop:
                            service.stop()
                    }
                } catch {
                    let action = commandJSON
                    switch action {
                        case "start":
                            service.start(config: .default)
                        case "stop":
                            service.stop()
                        default:
                            print("invalid command format", error)
                    }
                }
            }
        }
        RunLoop.main.run()
    }
}
