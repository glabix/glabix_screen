//
//  ScreenRecorderService.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

import Foundation

struct Callback {
    static func print(_ data: any Codable) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        if let prettyPrintedData = try? encoder.encode(data) {
            let prettyPrintedString = String(data: prettyPrintedData, encoding: .utf8)!
            fflush(stdout)
            Swift.print("[glabix-screen.callback] \(prettyPrintedString)")
            fflush(stdout)
        } else {
            debugPrint("cannot encode", data)
        }
    }
}

protocol CallbackActionContainable: Codable {
    var action: Callback.RecordingAction { get }
}

extension Callback {
    struct CaptureDevice: Codable {
        let id: String
        let name: String
        let isDefault: Bool
    }
    
    struct MicrophoneDevices: CallbackActionContainable {
        let devices: [CaptureDevice]
        
        var action: RecordingAction = .audioInputDevices
    }
    
    struct CameraDevices: CallbackActionContainable {
        let devices: [CaptureDevice]
        
        var action: RecordingAction = .videoInputDevices
    }
}

extension Callback {
    enum RecordingAction: String, Codable {
        case chunkFinalized
        case started
        case stopped
        case audioInputDevices
        case videoInputDevices
    }
    
    struct ChunkFinalized: CallbackActionContainable {
        var action: RecordingAction = .chunkFinalized
        let index: Int
    }
    
    struct RecordingStarted: Codable {
        var action: RecordingAction = .started
        let path: String?
    }
    
    struct RecordingStopped: Codable {
        var action: RecordingAction = .stopped
        let lastChunkIndex: Int?
    }
}

class ScreenRecorderService {
    private let recorder = ScreenRecorder()
    private let captureDevicesObserver = CaptureDevicesObserver()
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
            
    func startRecording(withConfig config: Config) {
//        completionGroup.enter()
        commandQueue.async { [recorder] in
            Task { [recorder] in
                defer { fflush(stdout) }
                do {
//                    try await self.recorder.startCapture(configJSON: configJSON)
                    try await recorder.start(withConfig: config)
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
    
    func configureRecorder(with config: Config) {
        commandQueue.async { [recorder] in
            Task { [recorder] in
                defer { fflush(stdout) }
                do {
                    try await recorder.configureAndInitialize(with: config)
                }
            }
        }
    }
    
    func startRecording() {
        defer { fflush(stdout) }
        let path = recorder.chunksManager?.outputDirectory?.path() ?? "null"
        ScreenRecorderService.printCallback("recording started at `\(path)`")
        debugPrint("recording started at `\(path)`")
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
    
    func printAudioInputDevices() {
        recorder.printAudioInputDevices()
    }
    
    func printVideoInputDevices() {
        recorder.printVideoInputDevices()
    }
    
//    func waitForCompletion() {
//        completionGroup.wait()
//    }
}
