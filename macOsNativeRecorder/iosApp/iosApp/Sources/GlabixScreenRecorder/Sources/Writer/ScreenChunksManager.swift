//
//  ScreenChunksManager.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

class ScreenChunksManager {
    private let screenConfigurator: ScreenConfigurator
    private let recordConfiguration: RecordConfiguration
    
    private var writer: ScreenWriter?
    private var previousChunkWriter: ScreenWriter?
    private var nextChunkWriter: ScreenWriter?
    private var chunkStartTime: CMTime = .zero
    
    private let chunkDuration: CMTime = CMTime(seconds: 5, preferredTimescale: 1)
    private var chunkIndex = 0
    private var lastSampleTime: CMTime?
    
    private let queue = DispatchQueue(label: "com.glabix.screen.chunksManager")
    private let chunksDir: String
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) {
        self.screenConfigurator = screenConfigurator
        self.recordConfiguration = recordConfiguration
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "y-MM-dd_HH-mm-ss"
        self.chunksDir = dateFormatter.string(from: Date())
        
        queue.async { [weak self] in
            self?.setNextChunkWriter()
        }
    }
    
    private func setNextChunkWriter() {
        guard let outputURL = createNewOutputURL(),
              let micOutputURL = createNewMicOutputURL() else { return }
        
        nextChunkWriter = try? ScreenWriter(
            outputURL: outputURL,
            micOutputURL: micOutputURL,
            chunkIndex: chunkIndex,
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration
        )
    }
    
    private func createNewChunk(startTime: CMTime) throws {
        defer { fflush(stdout) }
        debugPrint("createNewChunk start:", startTime.seconds, "next exists?", nextChunkWriter != nil)
        
        writer = try nextChunkWriter ?? ScreenWriter(
            outputURL: createNewOutputURL()!,
            micOutputURL: createNewMicOutputURL(),
            chunkIndex: chunkIndex,
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration
        )

        writer?.startSession(atSourceTime: startTime)
        
        chunkStartTime = startTime
        
        chunkIndex += 1
        
        queue.async { [weak self] in
            self?.setNextChunkWriter()
        }
    }
    
    private var pausedAt: CMTime?
    private var shouldPause: Bool = false
    
    func pause() {
        shouldPause = true
    }
    
    func resume() {
        pausedAt = nil
        writer = nil // start new on next frame
    }
    
    func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        let timestamp = sampleBuffer.presentationTimeStamp
        lastSampleTime = timestamp
        
        if type == .screen {
            if shouldPause {
                shouldPause = false
                
                if let videoInput = writer?.videoWriterInput,
                   videoInput.isReadyForMoreMediaData,
                   let additionalSampleBuffer = buildAdditionalSampleBuffer(from: sampleBuffer, at: timestamp) {
                    videoInput.append(additionalSampleBuffer)
                }
                asyncFinalizeCurrentChunk(endTime: timestamp)
                
                pausedAt = timestamp
                writer = nil
                chunkStartTime = timestamp // write next to previous writer
            } else if pausedAt == nil {
                if writer == nil {
                    try? createNewChunk(startTime: timestamp)
                } else if timestamp - chunkStartTime >= chunkDuration {
                    debugPrint("should Start new on timer", "start", timestamp.seconds, "chunk start", chunkStartTime.seconds)
                    
                    if let videoInput = writer?.videoWriterInput,
                       videoInput.isReadyForMoreMediaData,
                       let additionalSampleBuffer = buildAdditionalSampleBuffer(from: sampleBuffer, at: timestamp) {
                        videoInput.append(additionalSampleBuffer)
                    }
                    
                    asyncFinalizeCurrentChunk(endTime: timestamp)
                    try? createNewChunk(startTime: timestamp)
                }
            }
        }
        
        guard let writer = sampleBuffer.presentationTimeStamp < chunkStartTime ? previousChunkWriter : writer else {
            if pausedAt == nil {
                debugPrint("(\(writer?.chunkIndex ?? -1)) no writer found \(type)")
            }
            return
        }
        
        if sampleBuffer.presentationTimeStamp < chunkStartTime {
            debugPrint("writing \(type) to prev #\(writer.chunkIndex)")
        }
        
//        if writer.isPaused {
//            debugPrint("skipping \(type) (paused)")
//            return
//        }
        
        let assetWriterInput = switch type {
            case .systemAudio: writer.systemAudioWriterInput
            case .screen: writer.videoWriterInput
            case .mic: writer.micWriterInput
        }
        
        guard let assetWriterInput = assetWriterInput, assetWriterInput.isReadyForMoreMediaData else {
            debugPrint("(\(writer.chunkIndex)) no input or not ready for \(type)", "isReady", assetWriterInput?.isReadyForMoreMediaData ?? "no AssetWriterInput")
            return
        }
        
        assetWriterInput.append(sampleBuffer)
    }
    
    private func buildAdditionalSampleBuffer(from originalBuffer: CMSampleBuffer, at additionalSampleTime: CMTime) -> CMSampleBuffer? {
        let timing = CMSampleTimingInfo(
            duration: originalBuffer.duration,
            presentationTimeStamp: additionalSampleTime,
            decodeTimeStamp: originalBuffer.decodeTimeStamp
        )
        if let additionalSampleBuffer = try? CMSampleBuffer(copying: originalBuffer, withNewTiming: [timing]) {
            return additionalSampleBuffer
        } else {
            return nil
        }
    }
    
    private func asyncFinalizeCurrentChunk(endTime: CMTime) {
        previousChunkWriter = writer
        guard let writer = writer else { return }
        
        queue.asyncAfter(deadline: .now() + 0.3) { [weak self] in // wait for next processed samples
            debugPrint("(\(writer.chunkIndex)) asyncFinalizePendingChunk", "end", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds)
//            guard writer.assetWriter.status == .writing else { return }
            writer.finalize(endTime: endTime)
            self?.previousChunkWriter = nil
        }
    }
    
    func stop() {
        guard let writer = writer else { return }
        let endTime = lastSampleTime ?? CMClock.hostTimeClock.time
        debugPrint("stop", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds)
//        guard writer.assetWriter.status == .writing else { return }
        
        writer.finalize(endTime: endTime)
        
        self.writer = nil
        self.previousChunkWriter = nil
        self.nextChunkWriter = nil
        self.chunkIndex = 0
    }
    
    var outputDirectory: URL? {
        if let path = recordConfiguration.chunksDirectoryPath {
            return URL(fileURLWithPath: path)
        } else {
            let fileManager = FileManager.default
            let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
            
            return documentsDirectory?.appendingPathComponent(chunksDir)
        }
    }
    
    private func createNewOutputURL() -> URL? {
        let fileManager = FileManager.default
        
        guard let pathURL = outputDirectory,
              let _ = try? fileManager.createDirectory(atPath: pathURL.path(), withIntermediateDirectories: true, attributes: nil) else { return nil }
        
        let outputURL = pathURL.appendingPathComponent("chunk_\(chunkIndex).mp4")
        debugPrint("Preparing ouput file: ", outputURL.absoluteString)
        try? fileManager.removeItem(at: outputURL)
        return outputURL
    }
    
    private func createNewMicOutputURL() -> URL? {
        guard recordConfiguration.captureMicrophone else { return nil }
        
        let fileManager = FileManager.default
        
        guard let pathURL = outputDirectory,
              let _ = try? fileManager.createDirectory(atPath: pathURL.path(), withIntermediateDirectories: true, attributes: nil) else { return nil }
        
        let outputURL = pathURL.appendingPathComponent("chunk_\(chunkIndex).m4a")
        debugPrint("Preparing ouput file: ", outputURL.absoluteString)
        try? fileManager.removeItem(at: outputURL)
        return outputURL
    }
}
