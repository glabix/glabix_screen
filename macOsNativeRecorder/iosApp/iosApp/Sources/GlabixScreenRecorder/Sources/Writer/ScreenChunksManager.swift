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
    private var previousChunkWriters: [CMTime: ScreenWriter] = [:]
    private var nextChunkWriter: ScreenWriter?
    private var chunkStartTime: CMTime = .zero
    
    private let chunkDuration: CMTime = CMTime(seconds: 3, preferredTimescale: 1)
    private var chunkIndex = 0
    private var lastSampleTime: CMTime?
    private var lastSampleBuffers: [ScreenRecorderSourceType: CMSampleBuffer] = [:]
    
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
        debugPrint("createNewChunk #\(chunkIndex) start:", startTime.seconds, "next exists?", nextChunkWriter != nil)
        
        writer = try nextChunkWriter ?? {
            let outputURL = createNewOutputURL()
            debugPrint("chunk #\(chunkIndex) path: ", outputURL?.absoluteString ?? "-")
            return try ScreenWriter(
                outputURL: outputURL!,
                micOutputURL: createNewMicOutputURL(),
                chunkIndex: chunkIndex,
                screenConfigurator: screenConfigurator,
                recordConfiguration: recordConfiguration
            )
        }()

        writer?.startSession(atSourceTime: startTime)
//        writer?.startSession(atSourceTime: startTime - CMTime(value: 1, timescale: 1))
        
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
                
                debugPrint("Pause", "timestamp", timestamp.seconds, "chunk start", chunkStartTime.seconds)
                appendSampleBuffer(buildAdditionalSampleBuffer(from: sampleBuffer, at: timestamp), type: type, to: writer)
                appendSampleBuffer(buildAdditionalSampleBuffer(from: lastSampleBuffers[.systemAudio], at: timestamp), type: type, to: writer)
                appendSampleBuffer(buildAdditionalSampleBuffer(from: lastSampleBuffers[.mic], at: timestamp), type: type, to: writer)
                
                asyncFinalizeCurrentChunk(endTime: timestamp)
                
                pausedAt = timestamp
                writer = nil
                chunkStartTime = timestamp // write next to previous writer
            } else if pausedAt == nil {
                if writer == nil {
                    try? createNewChunk(startTime: timestamp)
                } else if timestamp - chunkStartTime >= chunkDuration {
                    debugPrint("should Start new on timer", "start", timestamp.seconds, "chunk start", chunkStartTime.seconds, "duration", (timestamp - chunkStartTime).seconds)
                    
                    appendSampleBuffer(buildAdditionalSampleBuffer(from: sampleBuffer, at: timestamp), type: type, to: writer)
                    appendSampleBuffer(buildAdditionalSampleBuffer(from: lastSampleBuffers[.systemAudio], at: timestamp), type: type, to: writer)
                    appendSampleBuffer(buildAdditionalSampleBuffer(from: lastSampleBuffers[.mic], at: timestamp), type: type, to: writer)
                    
                    asyncFinalizeCurrentChunk(endTime: timestamp)
                    try? createNewChunk(startTime: timestamp)
                }
            }
        }
        
        lastSampleBuffers[type] = sampleBuffer
        
        guard let writer = if timestamp < chunkStartTime {
            previousChunkWriters.first(where: {
                $0.key > timestamp
            }).map({
                let diff = $0.key - timestamp
                debugPrint("writing \(type) to prev #\($0.value.chunkIndex) diff \(diff.seconds)")
                return $0.value
            })
        } else {
            writer
        } else {
            if pausedAt == nil {
                debugPrint("(\(writer?.chunkIndex ?? -1)) no writer found \(type)")
            }
            return
        }
        
        appendSampleBuffer(sampleBuffer, type: type, to: writer)
    }
    
    private func appendSampleBuffer(_ sampleBuffer: CMSampleBuffer?, type: ScreenRecorderSourceType, to writer: ScreenWriter?) {
        guard let sampleBuffer = sampleBuffer else {
            debugPrint("(\(writer?.chunkIndex ?? -1)) \(type) sample buffer is nil")
            return
        }
        guard let writer = writer else {
            debugPrint("(\(writer?.chunkIndex ?? -1)) no writer found \(type)")
            return
        }
        
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
    
    private func buildAdditionalSampleBuffer(from originalBuffer: CMSampleBuffer?, at additionalSampleTime: CMTime) -> CMSampleBuffer? {
        guard let sampleBuffer = originalBuffer else { return nil }
        let timing = CMSampleTimingInfo(
            duration: sampleBuffer.duration,
            presentationTimeStamp: additionalSampleTime,
            decodeTimeStamp: sampleBuffer.decodeTimeStamp
        )
        if let additionalSampleBuffer = try? CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing]) {
            return additionalSampleBuffer
        } else {
            return nil
        }
    }
    
    private func asyncFinalizeCurrentChunk(endTime: CMTime) {
        previousChunkWriters[endTime] = writer
        guard let writer = writer else { return }
        
        queue.asyncAfter(deadline: .now() + 1.0) { [weak self] in // wait for next processed samples
            Task { [writer, weak self] in
                debugPrint("(\(writer.chunkIndex)) asyncFinalizePendingChunk", "end", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds)
                //            guard writer.assetWriter.status == .writing else { return }
                await writer.finalize(endTime: endTime)
                self?.previousChunkWriters.removeValue(forKey: endTime)
                
                ScreenRecorderService.printCallback("chunk screen finalized #\(writer.chunkIndex)")
            }
        }
    }
    
    func stop() async {
        guard let writer = writer else { return }
        let endTime = lastSampleTime ?? CMClock.hostTimeClock.time
        debugPrint("stop", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds)
//        guard writer.assetWriter.status == .writing else { return }
        
        await writer.finalize(endTime: endTime)
        
        ScreenRecorderService.printCallback("chunk screen finalized on stop #\(writer.chunkIndex)")
        
        self.writer = nil
        self.previousChunkWriters = [:]
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
    
    private func getOrCreateOutputDirectory() -> URL? {
        let fileManager = FileManager.default
        
        guard let pathURL = outputDirectory,
              let _ = try? fileManager.createDirectory(atPath: pathURL.path(), withIntermediateDirectories: true, attributes: nil) else { return nil }
        return pathURL
    }
    
    private func createNewOutputURL() -> URL? {
        getOrCreateOutputDirectory()?.appendingPathComponent("chunk_\(chunkIndex).mp4")
    }
    
    private func createNewMicOutputURL() -> URL? {
        guard recordConfiguration.captureMicrophone else { return nil }

        return getOrCreateOutputDirectory()?.appendingPathComponent("chunk_\(chunkIndex).m4a")
    }
}
