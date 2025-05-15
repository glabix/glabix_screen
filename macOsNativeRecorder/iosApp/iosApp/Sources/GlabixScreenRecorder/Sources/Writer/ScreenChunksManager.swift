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

struct SampleBufferBuilder {
    static func buildAdditionalSampleBuffer(from originalBuffer: CMSampleBuffer?, at additionalSampleTime: CMTime) -> CMSampleBuffer? {
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
    private func activeChunkWriter(_ index: Int) -> ChunkWriter? {
        activeChunkWriters.first(where: { $0.chunkIndex == index })
    }
    
    private var chunkWritersDebugInfo: [[Any]] {
        _chunkWriters.map(\.debugInfo)
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
                endTime: endTime,
                
            )
        )
    }

    private func asyncInitializeNextIfNeeded(chunkWriter: ChunkWriter) {
        let nextChunkIndex = chunkWriter.chunkIndex + 1
        queue.async { [weak self] in
            guard self?.activeChunkWriter(nextChunkIndex) == nil else { return }
            
            debugPrint("(\(chunkWriter.chunkIndex)) createNewChunk asyncInitializeNextIfNeeded nextId:", nextChunkIndex, "paused", self?.pausedAt, "should", self?.shouldPause, "with start time", chunkWriter.endTime.seconds)
            guard self?.pausedAt == nil, self?.shouldPause == false else { return }
            self?.initChunkWriter(index: nextChunkIndex, expectedStartTime: chunkWriter.endTime)
        }
    }
    
    private func writerAt(_ timestamp: CMTime) -> ChunkWriter? {
        activeChunkWriters.first(where: { $0.endTime > timestamp })
    }
    
    private func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil, type: ScreenRecorderSourceType) -> ChunkWriter? {
        if writerAt(timestamp) == nil, type == .screen {
            let lastChunk = notCancelledChunkWriters.last
            let newChunkIndex = lastChunk.map { $0.chunkIndex + 1 } ?? 0
            let newChunkStartTime = startTime ?? lastChunk?.endTime ?? timestamp
            
            if let nextChunkWriter = activeChunkWriter(newChunkIndex) {
                debugPrint("(\(newChunkIndex)) createNewChunk Chunk Exists #\(newChunkIndex) start:", newChunkStartTime.seconds, "chunk start", nextChunkWriter.startTime.seconds, "end", nextChunkWriter.endTime.seconds)
            } else {
                debugPrint("(\(newChunkIndex)) !!!!!!!! createNewChunk start:", newChunkStartTime.seconds, "startTime", startTime?.seconds, "current", timestamp.seconds, chunkWritersDebugInfo)
                initChunkWriter(index: newChunkIndex, expectedStartTime: newChunkStartTime)
            }
        }
        
        if let chunkWriter = writerAt(timestamp) {
            asyncInitializeNextIfNeeded(chunkWriter: chunkWriter)
            activeChunkWriters
                .filter { $0.chunkIndex < chunkWriter.chunkIndex }
                .forEach { outdatedChunkWriter in
                    outdatedChunkWriter.updateStatusOnFinalizeOrCancel(endTime: outdatedChunkWriter.endTime)
                    
                    queue.async { [weak outdatedChunkWriter] in
                        Task { [weak outdatedChunkWriter] in
                            guard let endTime = outdatedChunkWriter?.endTime else { return }
                            await outdatedChunkWriter?.finalizeOrCancelWithDelay(endTime: endTime)
                        }
                    }
                }
            
            return chunkWriter
        } else { return nil }
        
    }
    
    func pause() {
        guard pausedAt == nil else { return }
        shouldPause = true
    }
    
    func resume() {
        guard pausedAt != nil else { return }
        shouldUnpause = true
    }
    
    func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        let timestamp = sampleBuffer.presentationTimeStamp
        
        var chunkWriterStartTime: CMTime? = nil
        if shouldPause, type == .screen {
            shouldPause = false
            debugPrint("Pause", "timestamp", timestamp.seconds)//, "chunk start", chunkStartTime.seconds)
            pausedAt = timestamp
            activeChunkWriters
                .forEach { chunkWriter in
                    chunkWriter.updateStatusOnFinalizeOrCancel(endTime: timestamp)
                    
                    queue.async { [weak chunkWriter] in
                        Task { [weak chunkWriter] in
                            await chunkWriter?.finalizeOrCancelWithDelay(endTime: timestamp)
                        }
                    }
                }
            return
        } else if shouldUnpause, type == .screen {
            shouldUnpause = false
            chunkWriterStartTime = timestamp
            pausedAt = nil
        } else if pausedAt != nil {
            return
        }
        
        if type == .screen {
            lastSampleTime = timestamp // will stop at this time
        }
        
        guard let chunkWriter = getOrInitializeWriterAt(timestamp, startTime: chunkWriterStartTime, type: type) else {
            if !activeOrFinalizingChunkWriters.isEmpty {
                debugPrint("no writer found \(type) at \(timestamp.seconds);", chunkWritersDebugInfo)
            }
            return
        }
        
        
        if let lastSampleBuffer = lastSampleBuffers[type],
           lastSampleBuffer.chunkIndex < chunkWriter.chunkIndex,
           let additionalSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(
            from: lastSampleBuffer.sampleBuffer,
            at: chunkWriter.startTime// - (lastSampleBuffer.sampleBuffer.duration.seconds.isNaN ? CMTime() : lastSampleBuffer.sampleBuffer.duration)
           )
        {
            if (additionalSampleBuffer.presentationTimeStamp != timestamp) {
                debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing as first \(type) from #", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", chunkWriter.startTime.seconds, "duration", lastSampleBuffer.sampleBuffer.duration.seconds, "current", timestamp.seconds)
                chunkWriter.appendSampleBuffer(additionalSampleBuffer, type: type)
            } else {
                debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing SKIPPED as first \(type) from #", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", chunkWriter.startTime.seconds, "duration", lastSampleBuffer.sampleBuffer.duration.seconds, "current", timestamp.seconds)
            }
            
            if type == .screen {
                if let prevChunkWriter = activeOrFinalizingChunkWriters.first(where: { $0.chunkIndex == lastSampleBuffer.chunkIndex }) {
                    debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing as last \(type) to ", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "endtime", prevChunkWriter.endTime.seconds, "additionnal at", additionalSampleBuffer.presentationTimeStamp.seconds)
                    prevChunkWriter.appendSampleBuffer(additionalSampleBuffer, type: type)
                } else {
                    debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing as last \(type) to ", lastSampleBuffer.chunkIndex, "not found", chunkWritersDebugInfo)
                }
            }
        }
        
        if lastSampleBuffers[type] == nil {
            debugPrint("first chunk of \(type) at \(timestamp.seconds)")
        }
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBuffer)
        
        chunkWriter.appendSampleBuffer(sampleBuffer, type: type)
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
                await chunkWriter.finalizeOrCancelWithDelay(endTime: endTime)
            }
        
        debugPrint("stopped", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds)
        Callback.print(Callback.RecordingStopped(lastChunkIndex: notCancelledChunkWriters.last?.chunkIndex))
                       
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
