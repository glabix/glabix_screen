//
//  Config.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

import Foundation
import CoreGraphics

struct Config: Codable {
    let displayId: CGDirectDisplayID? // nil for default
    let resolution: RecordResolution
    let fps: Int
    let cropRect: CropRect? // nil for full screen recording
    let chunksDirectoryPath: String
    let minChunkSizeMebibytes: Double
    let minChunkDurationSeconds: Double
    let showCursor: Bool
    let captureSystemAudio: Bool
    let captureMicrophone: Bool
    let microphoneUniqueID : String?
    
    static var development: Config {
        .init(
            displayId: nil,
            resolution: .uhd4k,
            fps: 30,
            cropRect: nil,
//            chunksDirectoryPath: "/Users/pavelfeklistov/Library/Containers/com.glabix.screenMac/Data/Documents/chunks",
            chunksDirectoryPath: "/Users/pavelfeklistov/chunks",
//            chunksDirectoryPath: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.appendingPathComponent("defaultChunksDir").path(),
            minChunkSizeMebibytes: 5,
            minChunkDurationSeconds: 5,
            showCursor: true,
            captureSystemAudio: true,
            captureMicrophone: true,
            microphoneUniqueID: nil
        )
    }
    
    static var appDevelopment: Config {
        .init(
            displayId: nil,
            resolution: .uhd4k,
            fps: 30,
            cropRect: nil,
            chunksDirectoryPath: "/Users/pavelfeklistov/Library/Containers/com.glabix.screenMac/Data/Documents/chunks",
//            chunksDirectoryPath: "/Users/pavelfeklistov/Documents/chunks",
//            chunksDirectoryPath: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.appendingPathComponent("defaultChunksDir").path(),
            minChunkSizeMebibytes: 5,
            minChunkDurationSeconds: 5,
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
