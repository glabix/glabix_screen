//
//  ScreenChunksManager.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

struct LastSampleBuffer {
    let chunkIndex: Int
    let sampleBuffer: CMSampleBuffer
}

class ScreenChunksManager {
    private let screenConfigurator: ScreenConfigurator
    private let recordConfiguration: RecordConfiguration
    
    private var _chunkWriters: [ChunkWriter] = []
    private var notCancelledChunkWriters: [ChunkWriter] {
        _chunkWriters.filter(\.isNotCancelled)
    }
    private var activeChunkWriters: [ChunkWriter] {
        _chunkWriters.filter(\.isActive)
    }
    private var activeOrFinalizingChunkWriters: [ChunkWriter] {
        _chunkWriters.filter(\.isActiveOrFinalizing)
    }
    private var chunkWritersDebugInfo: [[Any]] {
        _chunkWriters.map { [$0.chunkIndex, $0.endTime.seconds, "haswr?", $0.writer != nil, "fin?", $0.status] }
    }

    private var pausedAt: CMTime?
    private var shouldPause: Bool = false
    private var shouldUnpause: Bool = false
    
    private let chunkDuration: CMTime = CMTime(seconds: 2, preferredTimescale: 1)
    
    private var lastSampleTime: CMTime?
    private var lastSampleBuffers: [ScreenRecorderSourceType : LastSampleBuffer] = [:]
    private let queue = DispatchQueue(label: "com.glabix.screen.chunksManager")
    private let defaultChunksDir: String
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) {
        self.screenConfigurator = screenConfigurator
        self.recordConfiguration = recordConfiguration
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "y-MM-dd_HH-mm-ss"
        self.defaultChunksDir = dateFormatter.string(from: Date())
    }
    
    private func initChunkWriter(index: Int, expectedStartTime: CMTime) {
        let endTime = expectedStartTime + chunkDuration
        debugPrint("(\(index)) createNewChunk initChunkWriter ", expectedStartTime.seconds, "end", endTime.seconds)
        _chunkWriters.append(
            ChunkWriter(
                screenConfigurator: screenConfigurator,
                recordConfiguration: recordConfiguration,
                outputDir: getOrCreateOutputDirectory(),
                captureMicrophone: recordConfiguration.captureMicrophone,
                index: index,
                startTime: expectedStartTime,
                endTime: endTime
            )
        )
    }

    private func asyncInitializeNextIfNeeded(chunkWriter: ChunkWriter) {
        let nextChunkIndex = chunkWriter.chunkIndex + 1
        queue.async { [weak self] in
            guard self?.activeChunkWriters.first(where: { $0.chunkIndex == nextChunkIndex }) == nil else { return }
            
            debugPrint("(\(chunkWriter.chunkIndex)) createNewChunk asyncInitializeNextIfNeeded nextId:", nextChunkIndex, "with start time", chunkWriter.endTime.seconds)
            self?.initChunkWriter(index: nextChunkIndex, expectedStartTime: chunkWriter.endTime)
        }
    }
    
    private func writerAt(_ timestamp: CMTime) -> ChunkWriter? {
        activeChunkWriters.first(where: { $0.endTime > timestamp })
    }
    
    private func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil) -> ChunkWriter? {
        if activeChunkWriters.allSatisfy({ $0.endTime <= timestamp }) {
            let lastChunk = notCancelledChunkWriters.last
            let newChunkIndex = lastChunk.map { $0.chunkIndex + 1 } ?? 0
            let newChunkStartTime = startTime ?? lastChunk?.endTime ?? timestamp
            
            if let nextChunkWriter = activeChunkWriters.first(where: { $0.chunkIndex == newChunkIndex }) {
                debugPrint("(\(newChunkIndex)) createNewChunk Chunk Exists #\(newChunkIndex) start:", newChunkStartTime.seconds, "chunk start", nextChunkWriter.startTime.seconds, "end", nextChunkWriter.endTime.seconds)
            } else {
                debugPrint("(\(newChunkIndex)) !!!!!!!! createNewChunk start:", newChunkStartTime.seconds, chunkWritersDebugInfo)
                initChunkWriter(index: newChunkIndex, expectedStartTime: newChunkStartTime)
            }
            
        }
        
        if let chunkWriter = writerAt(timestamp) {
            asyncInitializeNextIfNeeded(chunkWriter: chunkWriter)
            
            activeChunkWriters
                .filter { $0.chunkIndex < chunkWriter.chunkIndex }
                .forEach { outdatedChunkWriter in
                    outdatedChunkWriter.asyncFinalizeOrCancel(endTime: outdatedChunkWriter.endTime)
                }
            
            return chunkWriter
        } else { return nil }
        
    }
    
    func pause() {
        shouldPause = true
    }
    
    func resume() {
        shouldUnpause = true
    }
    
    func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        let timestamp = sampleBuffer.presentationTimeStamp
        
        var chunkWriterStartTime: CMTime? = nil
        if shouldPause {
            shouldPause = false
            debugPrint("Pause", "timestamp", timestamp.seconds)//, "chunk start", chunkStartTime.seconds)
            pausedAt = timestamp
            activeChunkWriters
                .forEach { chunkWriter in
                    chunkWriter.asyncFinalizeOrCancel(endTime: timestamp)
                }
            return
        } else if shouldUnpause {
            shouldUnpause = false
            chunkWriterStartTime = timestamp
            pausedAt = nil
        } else if pausedAt != nil {
            return
        }
        
        if type == .screen {
            lastSampleTime = timestamp // will stop at this time
        }
        
        guard let chunkWriter = getOrInitializeWriterAt(timestamp, startTime: chunkWriterStartTime) else {
            debugPrint("no writer found \(type) at \(timestamp.seconds);", chunkWritersDebugInfo)
            return
        }
        
        if let lastSampleBuffer = lastSampleBuffers[type],
           lastSampleBuffer.chunkIndex < chunkWriter.chunkIndex,
           let additionalSampleBuffer = buildAdditionalSampleBuffer(from: lastSampleBuffer.sampleBuffer, at: chunkWriter.startTime)
        {
            debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing as first \(type) from #", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", chunkWriter.startTime.seconds, "duration", lastSampleBuffer.sampleBuffer.duration.seconds)
            appendSampleBuffer(additionalSampleBuffer, type: type, to: chunkWriter)
            
            if type == .screen,
                let prevChunkWriter = activeOrFinalizingChunkWriters.first(where: { $0.chunkIndex == lastSampleBuffer.chunkIndex })
            {
                debugPrint("(\(prevChunkWriter.chunkIndex)) @@@@@@ writing as last \(type)", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", chunkWriter.startTime.seconds, "duration", lastSampleBuffer.sampleBuffer.duration.seconds)
                appendSampleBuffer(additionalSampleBuffer, type: type, to: prevChunkWriter)
            }
        }
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBuffer)
        
        appendSampleBuffer(sampleBuffer, type: type, to: chunkWriter)
    }
    
    private func appendSampleBuffer(_ sampleBuffer: CMSampleBuffer?, type: ScreenRecorderSourceType, to chunkWriter: ChunkWriter?) {
        guard let sampleBuffer = sampleBuffer else {
            debugPrint("(\(chunkWriter?.chunkIndex ?? -1)) \(type) sample buffer is nil")
            return
        }
        guard let writer = chunkWriter?.writer else {
            debugPrint("(\(chunkWriter?.chunkIndex ?? -1)) no writer found \(type)")
            return
        }
        
        
        let assetWriterInput = switch type {
            case .systemAudio: writer.systemAudioWriterInput
            case .screen: writer.videoWriterInput
            case .mic: writer.micWriterInput
        }
        
        guard let assetWriterInput = assetWriterInput, assetWriterInput.isReadyForMoreMediaData else {
            debugPrint("(\(chunkWriter?.chunkIndex ?? -1)) no input or not ready for \(type)", "isReady", assetWriterInput?.isReadyForMoreMediaData ?? "no AssetWriterInput")
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
    
    func stop() async {
        let endTime = lastSampleTime ?? CMClock.hostTimeClock.time
        debugPrint("stop", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds, chunkWritersDebugInfo)
        
//        if let currentChunkWriter = writerAt(endTime),
//           let lastSampleBuffer = lastSampleBuffers[.screen],
//           let additionalSampleBuffer = buildAdditionalSampleBuffer(from: lastSampleBuffer.sampleBuffer, at: endTime)
//        {
//            debugPrint("(\(currentChunkWriter.chunkIndex)) @@@@@@ writing as last on STOPfrom #", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", currentChunkWriter.startTime.seconds, "duration", lastSampleBuffer.sampleBuffer.duration.seconds)
////            appendSampleBuffer(additionalSampleBuffer, type: .screen, to: currentChunkWriter)
//        }
        
        await activeChunkWriters
            .asyncForEach { chunkWriter in
                await chunkWriter.finalizeOrCancel(endTime: endTime)
            }
        
        self._chunkWriters = []
        self.lastSampleBuffers = [:]
    }
    
    var outputDirectory: URL? {
        if let path = recordConfiguration.chunksDirectoryPath {
            return URL(fileURLWithPath: path)
        } else {
            let fileManager = FileManager.default
            let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
            
            return documentsDirectory?.appendingPathComponent(defaultChunksDir)
        }
    }
    
    private func getOrCreateOutputDirectory() -> URL? {
        let fileManager = FileManager.default
        
        guard let pathURL = outputDirectory,
              let _ = try? fileManager.createDirectory(atPath: pathURL.path(), withIntermediateDirectories: true, attributes: nil) else { return nil }
        return pathURL
    }
}
