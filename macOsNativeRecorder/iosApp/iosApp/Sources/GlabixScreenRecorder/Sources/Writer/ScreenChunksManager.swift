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

enum ChunksManagerState {
    case initial
    case paused
    case shouldPause
    case shouldResume
    case shouldStart
    case recording
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
    
    private var state: ChunksManagerState = .initial

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
    
    private func initChunkWriter(index: Int, expectedStartTime: CMTime?) {
        debugPrint("(\(index)) createNewChunk initChunkWriter ", expectedStartTime?.seconds ?? 0)

        _chunkWriters.append(
            ChunkWriter(
                screenConfigurator: screenConfigurator,
                recordConfiguration: recordConfiguration,
                outputDir: getOrCreateOutputDirectory(),
                captureMicrophone: recordConfiguration.captureMicrophone,
                index: index,
                startTime: expectedStartTime
            )
        )
    }

    private func asyncInitializeNextIfNeeded(chunkWriter: ChunkWriter) {
        let nextChunkIndex = chunkWriter.chunkIndex + 1
        queue.async { [weak self] in
            guard self?.activeChunkWriter(nextChunkIndex) == nil else { return }
            
            debugPrint("(\(chunkWriter.chunkIndex)) createNewChunk asyncInitializeNextIfNeeded nextId:", nextChunkIndex, "state", self?.state, "with start time", chunkWriter.endTime?.seconds ?? 0)
            guard self?.state == .recording else {
                debugPrint("invalid state for next writer initialization")
                return
            }
            self?.initChunkWriter(index: nextChunkIndex, expectedStartTime: chunkWriter.endTime)
        }
    }
    
    private func writerAt(_ timestamp: CMTime) -> ChunkWriter? {
        activeOrFinalizingChunkWriters.first { writer in
            writer.endTime.map { $0 > timestamp } == true
        }
    }
    
    private func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil, type: ScreenRecorderSourceType) -> ChunkWriter? {
        if writerAt(timestamp) == nil, type == .screen {
            let lastChunk = notCancelledChunkWriters.last
            let newChunkStartTime = startTime ?? lastChunk?.endTime ?? timestamp
            let newChunkIndex: Int
            if let lastChunk = lastChunk {
                if lastChunk.startTime == nil {
                    newChunkIndex = lastChunk.chunkIndex
                    debugPrint("(\(newChunkIndex)) starting chunk at \(newChunkStartTime.seconds)")
                    lastChunk.startAt(newChunkStartTime)
                } else {
                    newChunkIndex = lastChunk.chunkIndex + 1
                }
            } else {
                newChunkIndex = 0
            }
            
            if let nextChunkWriter = activeChunkWriter(newChunkIndex) {
                debugPrint("(\(newChunkIndex)) createNewChunk Chunk Exists #\(newChunkIndex) start:", newChunkStartTime.seconds, "chunk start", nextChunkWriter.startTime?.seconds ?? 0, "end", nextChunkWriter.endTime?.seconds ?? 0)
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
                    guard let endTime = outdatedChunkWriter.endTime else { return }
                    outdatedChunkWriter.updateStatusOnFinalizeOrCancel(endTime: endTime)
                    
                    queue.async { [weak outdatedChunkWriter] in
                        Task { [weak outdatedChunkWriter] in
//                            guard let endTime = outdatedChunkWriter?.endTime else { return }
                            await outdatedChunkWriter?.finalizeOrCancelWithDelay(endTime: endTime)
                        }
                    }
                }
            
            return chunkWriter
        } else { return nil }
        
    }
    
    func pause() {
        guard state == .recording else { return }
        state = .shouldPause
    }
    
    func resume() {
        guard state == .paused else { return }
        state = .shouldResume
    }
    
    func startOnNextSample() {
        guard state == .initial else { return }
        state = .shouldStart
    }
    
    func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        let timestamp = sampleBuffer.presentationTimeStamp
        
        let chunkWriter: ChunkWriter?        
        switch state {
            case .initial:
                return
            case .shouldStart:
                guard type == .screen else { return }
                
                state = .recording
                chunkWriter = getOrInitializeWriterAt(timestamp, type: type)
            case .shouldResume:
                guard type == .screen else { return }
                
                state = .recording
                chunkWriter = getOrInitializeWriterAt(timestamp, startTime: timestamp, type: type)
            case .shouldPause:
                if type == .screen {
                    state = .paused
                    debugPrint("Pause", "timestamp", timestamp.seconds)//, "chunk start", chunkStartTime.seconds)
                    //            pausedAt = timestamp
                    activeChunkWriters
                        .forEach { chunkWriter in
                            chunkWriter.updateStatusOnFinalizeOrCancel(endTime: timestamp)
                            
                            queue.async { [weak chunkWriter] in
                                Task { [weak chunkWriter] in
                                    await chunkWriter?.finalizeOrCancelWithDelay(endTime: timestamp)
                                }
                            }
                        }
                    chunkWriter = writerAt(timestamp)
                } else {
                    chunkWriter = getOrInitializeWriterAt(timestamp, type: type)
                }
            case .paused:
                chunkWriter = writerAt(timestamp)
            case .recording:
                chunkWriter = getOrInitializeWriterAt(timestamp, type: type)
        }
        
        guard let chunkWriter = chunkWriter else {
            if !activeOrFinalizingChunkWriters.isEmpty, state != .paused {
                debugPrint("no writer found \(type) at \(timestamp.seconds); state: \(state)", chunkWritersDebugInfo)
            }
            return
        }
        
        if type == .screen {
            lastSampleTime = timestamp // will stop at this time
        }
        
        if let lastSampleBuffer = lastSampleBuffers[type],
           lastSampleBuffer.chunkIndex < chunkWriter.chunkIndex,
           let chunkWriterStartTime = chunkWriter.startTime,
           let additionalSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(
            from: lastSampleBuffer.sampleBuffer,
            at: chunkWriterStartTime// - (lastSampleBuffer.sampleBuffer.duration.seconds.isNaN ? CMTime() : lastSampleBuffer.sampleBuffer.duration)
           )
        {
            if type != .mic {
                if (additionalSampleBuffer.presentationTimeStamp != timestamp) {
                    debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing as first \(type) from #", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", chunkWriter.startTime?.seconds ?? 0, "duration", lastSampleBuffer.sampleBuffer.duration.seconds, "current", timestamp.seconds)
                    chunkWriter.appendSampleBuffer(additionalSampleBuffer, type: type)
                } else {
                    debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing SKIPPED as first \(type) from #", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", chunkWriter.startTime?.seconds ?? 0, "duration", lastSampleBuffer.sampleBuffer.duration.seconds, "current", timestamp.seconds)
                }
            }
            
            if type == .screen {
                if let prevChunkWriter = activeOrFinalizingChunkWriters.first(where: { $0.chunkIndex == lastSampleBuffer.chunkIndex }) {
                    debugPrint("(\(chunkWriter.chunkIndex)) @@@@@@ writing as last \(type) to ", lastSampleBuffer.chunkIndex, lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "endtime", prevChunkWriter.endTime?.seconds ?? 0, "additionnal at", additionalSampleBuffer.presentationTimeStamp.seconds)
                    prevChunkWriter.appendSampleBuffer(additionalSampleBuffer, type: type)
                } else {
                    debugPrint("(\(chunkWriter.chunkIndex)) 💀💀💀@@@@@@ writing as last \(type) to ", lastSampleBuffer.chunkIndex, "not found", chunkWritersDebugInfo)
                }
            }
        }
        
        if lastSampleBuffers[type] == nil {
            debugPrint("first chunk of \(type) at \(timestamp.seconds)")
        }
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBuffer)
        
        chunkWriter.appendSampleBuffer(sampleBuffer, type: type)
    }
    
    func initializeFirstChunkWriter() {
        guard _chunkWriters.isEmpty else {
            debugPrint("Can't initialize while running")
            return
        }
        initChunkWriter(index: 0, expectedStartTime: nil)
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
