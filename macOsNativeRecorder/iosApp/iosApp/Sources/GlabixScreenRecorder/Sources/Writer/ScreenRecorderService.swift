//
//  ScreenRecorderService.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

import Foundation

class ScreenRecorderService {
    private let recorder = ScreenRecorder()
    private let commandQueue = DispatchQueue(label: "com.glabix.screen.commandQueue")
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
                    debugPrint("recording started at `\(path)`")
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
                    try await recorder.stop()
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
