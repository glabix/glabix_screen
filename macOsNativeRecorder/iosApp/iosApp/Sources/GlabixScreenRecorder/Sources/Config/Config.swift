//
//  Config.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

import CoreGraphics

struct Config: Codable {
    let displayId: CGDirectDisplayID? // nil for default
    let resolution: RecordResolution
    let fps: Int
    let cropRect: CropRect? // nil for full screen recording
    let chunksDirectoryPath: String?
    let showCursor: Bool
    let captureSystemAudio: Bool
    let captureMicrophone: Bool
    let microphoneUniqueID : String?
    
    static var `default`: Config {
        .init(
            displayId: nil,
            resolution: .uhd4k,
            fps: 25,
            cropRect: nil,
            chunksDirectoryPath: nil,//"/Users/pavelfeklistov/Documents/chunks",
            showCursor: true,
            captureSystemAudio: true,
            captureMicrophone: true,
            microphoneUniqueID: nil
        )
    }
}

struct WaveformConfig: Codable {
    let microphoneUniqueID : String?
    
    static var `default`: WaveformConfig {
        .init(
            microphoneUniqueID: nil
        )
    }
}
