//
//  ScreenWriter.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

final class ScreenWriter: @unchecked Sendable {
    private let screenAssetWriter: AVAssetWriter?
    private let micAssetWriter: AVAssetWriter?
    private let chunkIndex: Int
    let videoWriterInput: AVAssetWriterInput?
    let systemAudioWriterInput: AVAssetWriterInput?
    let micWriterInput: AVAssetWriterInput?
    
    var debugStatus: String {
        [screenAssetWriter?.status.rawValue.description ?? "-1", screenAssetWriter?.error.debugDescription ?? ""].joined(separator: " ")
    }
    var screenError: Error? {
        screenAssetWriter?.error
    }
    
    init(
        screenOutputURL: URL?,
        micOutputURL: URL?,
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        chunkIndex: Int
    ) throws {
        self.chunkIndex = chunkIndex
        screenAssetWriter = try screenOutputURL.map { try AVAssetWriter(outputURL: $0, fileType: .mp4) }
        micAssetWriter = try micOutputURL.map { try AVAssetWriter(outputURL: $0, fileType: .m4a) }
        
        videoWriterInput = try VideoInput(screenConfigurator: screenConfigurator, recordConfiguration: recordConfiguration).build()
        micWriterInput = try MicInput.build()
        systemAudioWriterInput = try SystemAudioInput.build()

        if let videoWriterInput = videoWriterInput {
            screenAssetWriter?.add(videoWriterInput)
        }
        if let systemAudioWriterInput = systemAudioWriterInput {
            screenAssetWriter?.add(systemAudioWriterInput)
//            micAssetWriter?.add(systemAudioWriterInput)
        }
        if let micWriterInput = micWriterInput {
            micAssetWriter?.add(micWriterInput)
        }
    }
        
    func isRecording(type: ScreenRecorderSourceType) -> Bool {
        switch type {
            case .systemAudio:
                systemAudioWriterInput != nil
            case .screen:
                videoWriterInput != nil
            case .mic:
                micWriterInput != nil
        }
    }
    
    func startSession(atSourceTime startTime: CMTime) {
        screenAssetWriter?.startWriting()
        screenAssetWriter?.startSession(atSourceTime: startTime)
        
        micAssetWriter?.startWriting()
        micAssetWriter?.startSession(atSourceTime: startTime)
    }
    
    func finalize(endTime: CMTime) async {
        if let screenAssetWriterError = screenAssetWriter?.error {
            Log.error("ERROR on screen assetWriter", screenAssetWriterError, chunkIndex: chunkIndex)
        }
        if screenAssetWriter?.status == .writing {
            screenAssetWriter?.endSession(atSourceTime: endTime)
            await screenAssetWriter?.finishWriting()
        } else {
            Log.error("screen assetWriter is not writing \(screenAssetWriter?.status.rawValue.description ?? "n/a")", chunkIndex: chunkIndex)
        }
        
        if micAssetWriter?.status == .writing {
            micAssetWriter?.endSession(atSourceTime: endTime)
            await micAssetWriter?.finishWriting()
        } else {
            Log.error("mic assetWriter is not writing \(micAssetWriter?.status.rawValue.description ?? "n/a")", chunkIndex: chunkIndex)
        }
    }
}
