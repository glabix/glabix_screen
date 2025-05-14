//
//  ScreenWriter.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

class ScreenWriter {
    private var assetWriter: AVAssetWriter?
    private var micAssetWriter: AVAssetWriter?
    
    var videoWriterInput: AVAssetWriterInput?
    var systemAudioWriterInput: AVAssetWriterInput?
    var micWriterInput: AVAssetWriterInput?
    
    init(
        outputURL: URL?,
        micOutputURL: URL?,
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) throws {
        assetWriter = try outputURL.map { try AVAssetWriter(outputURL: $0, fileType: .mp4) }
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
        }
        await assetWriter?.finishWriting()

        if micAssetWriter?.status == .writing {
            micAssetWriter?.endSession(atSourceTime: endTime)
        }
        await micAssetWriter?.finishWriting()
    }
}
