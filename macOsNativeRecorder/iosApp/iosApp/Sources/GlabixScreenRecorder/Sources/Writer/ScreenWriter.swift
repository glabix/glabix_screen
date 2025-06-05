//
//  ScreenWriter.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

final class ScreenWriter {
    private var assetWriter: AVAssetWriter?
    private var micAssetWriter: AVAssetWriter?
    private let chunkIndex: Int
    var videoWriterInput: AVAssetWriterInput?
    var systemAudioWriterInput: AVAssetWriterInput?
    var micWriterInput: AVAssetWriterInput?
//    private let queue = DispatchQueue(label: "com.glabix.screen.chunkWriter")
    
    var debugStatus: String {
        [assetWriter?.status.rawValue.description ?? "-1", assetWriter?.error.debugDescription ?? ""].joined(separator: " ")
    }
    
    init(
        screenOutputURL: URL?,
        micOutputURL: URL?,
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        chunkIndex: Int
    ) throws {
        self.chunkIndex = chunkIndex
        assetWriter = try screenOutputURL.map { try AVAssetWriter(outputURL: $0, fileType: .mp4) }
        micAssetWriter = try micOutputURL.map { try AVAssetWriter(outputURL: $0, fileType: .m4a) }
        
        videoWriterInput = try VideoInput(screenConfigurator: screenConfigurator, recordConfiguration: recordConfiguration).build()
        micWriterInput = try MicInput.build()
        systemAudioWriterInput = try SystemAudioInput.build()

        if let videoWriterInput = videoWriterInput {
            assetWriter?.add(videoWriterInput)
        }
        if let systemAudioWriterInput = systemAudioWriterInput {
            assetWriter?.add(systemAudioWriterInput)
//            micAssetWriter?.add(systemAudioWriterInput)
        }
        if let micWriterInput = micWriterInput {
            micAssetWriter?.add(micWriterInput)
        }
    }
    
    func startSession(atSourceTime startTime: CMTime) {
        assetWriter?.startWriting()
        assetWriter?.startSession(atSourceTime: startTime)
        
        micAssetWriter?.startWriting()
        micAssetWriter?.startSession(atSourceTime: startTime)
    }
    
    func finalize(endTime: CMTime) async {
        if assetWriter?.status == .writing {
            assetWriter?.endSession(atSourceTime: endTime)
            await assetWriter?.finishWriting()
        } else {
            Log.error("screen assetWriter is not writing \(assetWriter?.status.rawValue.description ?? "n/a")", chunkIndex: chunkIndex)
        }
        
        if micAssetWriter?.status == .writing {
            micAssetWriter?.endSession(atSourceTime: endTime)
            await micAssetWriter?.finishWriting()
        } else {
            Log.error("mic assetWriter is not writing \(micAssetWriter?.status.rawValue.description ?? "n/a")", chunkIndex: chunkIndex)
        }
    }
}
