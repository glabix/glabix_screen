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
    
    init(
        outputURL: URL?,
        micOutputURL: URL?,
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        chunkIndex: Int
    ) throws {
        self.chunkIndex = chunkIndex
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
        } else {
            Log.error("screen assetWriter is not writing \(assetWriter?.status.rawValue)", Log.nowString, chunkIndex: chunkIndex)
        }
        assetWriter?.endSession(atSourceTime: endTime)
        await assetWriter?.finishWriting()
//        assetWriter?.finishWriting {}

        if micAssetWriter?.status == .writing {
        } else {
            Log.error("mic assetWriter is not writing \(micAssetWriter?.status.rawValue)", Log.nowString, chunkIndex: chunkIndex)
        }
        micAssetWriter?.endSession(atSourceTime: endTime)
        await micAssetWriter?.finishWriting()
//        micAssetWriter?.finishWriting {}
    }
}
