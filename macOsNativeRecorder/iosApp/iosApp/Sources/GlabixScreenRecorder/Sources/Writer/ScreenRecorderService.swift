//
//  ScreenRecorderService.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

import Foundation

final class Callback: @unchecked Sendable {
    static let shared = Callback()
    
    var enabled: Bool = true
    
    private func print(_ data: any Codable) {
        guard enabled else { return }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        if let prettyPrintedData = try? encoder.encode(data) {
            let prettyPrintedString = String(data: prettyPrintedData, encoding: .utf8)!
            fflush(stdout)
            Swift.print("[glabix-screen.callback]\(prettyPrintedString)###END")
            fflush(stdout)
        } else {
            debugPrint("cannot encode", data)
        }
    }
    
    static func print(_ data: any Codable) {
        shared.print(data)
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
    
//    struct CameraDevices: CallbackActionContainable {
//        let devices: [CaptureDevice]
//        
//        var action: RecordingAction = .videoInputDevices
//    }
    
    struct MicrophoneWaveform: CallbackActionContainable {
        let amplitudes: [Float]
        
        var action: RecordingAction = .microphoneWaveform
    }
}

extension Callback {
    enum RecordingAction: String, Codable {
        case chunkFinalized
        case started
        case stopped
        case audioInputDevices
//        case videoInputDevices
        case microphoneWaveform
    }
    
    struct ChunkFile: Codable {
        let path: String
        let size: Int?
    }
    
    struct ChunkFinalized: CallbackActionContainable {
        var action: RecordingAction = .chunkFinalized
        let index: Int
        let screenFile: ChunkFile?
        let micFile: ChunkFile?
    }
    
    struct RecordingStarted: Codable {
        var action: RecordingAction = .started
        let outputPath: String?
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
        
        recorder.start()
    }
    
    func stopRecording() {
        commandQueue.async { [recorder] in
            Task { [recorder] in
                defer { fflush(stdout) }
                do {
                    try await recorder.stop()
                } catch {
                    Log.error("Error stopping capture: \(error)")
                }
            }
        }
    }
    
    func printAudioInputDevices() {
        recorder.printAudioInputDevices()
    }
    
//    func printVideoInputDevices() {
//        recorder.printVideoInputDevices()
//    }
}
