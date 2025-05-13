//
//  ScreenWriter.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

class ScreenWriter {
    let chunkIndex: Int

    private var assetWriter: AVAssetWriter
    private var micAssetWriter: AVAssetWriter?
    
    var videoWriterInput: AVAssetWriterInput?
    var systemAudioWriterInput: AVAssetWriterInput?
    var micWriterInput: AVAssetWriterInput?
    
    init(
        outputURL: URL,
        micOutputURL: URL?,
        chunkIndex: Int,
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) throws {
        self.chunkIndex = chunkIndex
        
        let fileManager = FileManager.default
        try? fileManager.removeItem(at: outputURL)
        try? micOutputURL.map { try fileManager.removeItem(at: $0) }
        
        assetWriter = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        micAssetWriter = try micOutputURL.map { try AVAssetWriter(outputURL: $0, fileType: .m4a) }
        
        videoWriterInput = try VideoInput(screenConfigurator: screenConfigurator, recordConfiguration: recordConfiguration).build()
        micWriterInput = try MicInput.build()
        systemAudioWriterInput = try SystemAudioInput.build()

        if let videoWriterInput = videoWriterInput {
            assetWriter.add(videoWriterInput)
        }
        if let systemAudioWriterInput = systemAudioWriterInput {
            assetWriter.add(systemAudioWriterInput)
//            micAssetWriter?.add(systemAudioWriterInput)
        }
        if let micWriterInput = micWriterInput {
            micAssetWriter?.add(micWriterInput)
        }
    }
    
    func startSession(atSourceTime startTime: CMTime) {
        debugPrint("(\(chunkIndex)) startSession now:", CMClock.hostTimeClock.time.seconds)
        assetWriter.startWriting()
        assetWriter.startSession(atSourceTime: startTime)
        debugPrint("(\(chunkIndex)) startSession 1 now:", CMClock.hostTimeClock.time.seconds)
        micAssetWriter?.startWriting()
        micAssetWriter?.startSession(atSourceTime: startTime)
        debugPrint("(\(chunkIndex)) startSession 2 now:", CMClock.hostTimeClock.time.seconds)
    }
    
    func finalize(endTime: CMTime) async {
        debugPrint("\(chunkIndex) finalizing status", assetWriter.status.rawValue)
        if assetWriter.status == .writing {
            assetWriter.endSession(atSourceTime: endTime)
        }
        await assetWriter.finishWriting()
//        {
//            debugPrint("(\(self.chunkIndex)) finalized writing screen. now:", CMClock.hostTimeClock.time.seconds)
//            ScreenRecorderService.printCallback("chunk screen finalized #\(self.chunkIndex)")
//        }
        
        if micAssetWriter?.status == .writing {
            micAssetWriter?.endSession(atSourceTime: endTime)
        }
        await micAssetWriter?.finishWriting()
//        {
//            debugPrint("(\(self.chunkIndex)) finalized writing mic. now:", CMClock.hostTimeClock.time.seconds)
//            ScreenRecorderService.printCallback("chunk mic finalized #\(self.chunkIndex)")
//        }
    }
}
