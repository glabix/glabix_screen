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
    
//    private var chunkWritersDebugInfo: [[Any]] {
    private var chunkWritersDebugInfo: String {
        "\n" + _chunkWriters
            .map(\.debugInfo)
            .map(\.description)
            .joined(separator: "\n")
    }
    
    private var state: ChunksManagerState = .initial

    private var lastSampleTime: CMTime?
    private var lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer] = [:]
    private let queue = DispatchQueue(label: "com.glabix.screen.chunksManager")
    private let processSampleQueue = DispatchQueue(label: "com.glabix.screen.screenCapture.processSample")
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
        Log.print("createNewChunk initChunkWriter expectedStartTime:", expectedStartTime?.seconds ?? 0, Log.nowString, chunkIndex: index)
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
        
        processSampleQueue.async { [weak self] in // not always state = shouldPause being applied
            guard self?.activeChunkWriter(nextChunkIndex) == nil else { return }
            
            guard self?.state == .recording else {
                Log.warn("invalid state for next writer initialization")
                return
            }
            
            Log.info("asyncInitializeNextIfNeeded current index", chunkWriter.chunkIndex, "state", self?.state, "with start time", chunkWriter.endTime?.seconds ?? 0, Log.nowString, chunkIndex: nextChunkIndex)
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
                    Log.info("starting chunk at \(newChunkStartTime.seconds)", Log.nowString, chunkIndex: newChunkIndex)
                    lastChunk.startAt(newChunkStartTime)
                } else {
                    newChunkIndex = lastChunk.chunkIndex + 1
                }
            } else {
                newChunkIndex = 0
            }
            
            if let nextChunkWriter = activeChunkWriter(newChunkIndex) {
                Log.print("createNewChunk Chunk Exists #\(newChunkIndex) start:", newChunkStartTime.seconds, "chunk start", nextChunkWriter.startTime?.seconds ?? 0, "end", nextChunkWriter.endTime?.seconds ?? 0, Log.nowString, chunkIndex: newChunkIndex)
            } else {
                Log.warn("!!!!!!!! createNewChunk start:", newChunkStartTime.seconds, "startTime", startTime?.seconds, "current", timestamp.seconds, chunkWritersDebugInfo, Log.nowString, chunkIndex: newChunkIndex)
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
                    
                    queue.async { [weak outdatedChunkWriter, weak self] in
                        Task { [weak outdatedChunkWriter, weak self] in
                            guard let lastSampleBuffers = self?.lastSampleBuffers else { return }
                            await outdatedChunkWriter?.finalizeOrCancelWithDelay(
                                endTime: endTime,
                                lastSampleBuffers: lastSampleBuffers
                            )
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
    
    func syncProcessSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        processSampleQueue.sync {
            processSampleBuffer(sampleBuffer, type: type)
            
//            if chunkWriter.chunkIndex == 3, state == .recording {
//                Log.error("PAUSE!", Log.nowString)
//                pause()
//            }
        }
    }
    
    private func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        let timestamp = sampleBuffer.presentationTimeStamp
        
        let chunkWriter: ChunkWriter?
        switch state {
            case .initial:
                chunkWriter = writerAt(timestamp)
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
                    chunkWriter = writerAt(timestamp)
                    
                    Log.info("Pausing", "timestamp", timestamp.seconds, Log.nowString, chunkWritersDebugInfo, chunkIndex: chunkWriter?.chunkIndex)//, "chunk start", chunkStartTime.seconds)
                    //            pausedAt = timestamp
                    
                    queue.async { [weak self] in
                        Task { [weak self] in
                            await self?.activeChunkWriters
                                .asyncForEach { chunkWriter in
                                    chunkWriter.updateStatusOnFinalizeOrCancel(endTime: timestamp)
                                
                                    guard let lastSampleBuffers = self?.lastSampleBuffers else { return }
                                    await chunkWriter.finalizeOrCancelWithDelay(
                                        endTime: timestamp,
                                        lastSampleBuffers: lastSampleBuffers
                                    )
                                }
                            
                            guard let lastChunkIndex = self?.notCancelledChunkWriters.last?.chunkIndex else { return }
                            self?.initChunkWriter(index: lastChunkIndex + 1, expectedStartTime: nil)
                            Log.success("Paused", self?.chunkWritersDebugInfo ?? "")
                        }
                    }
                } else {
                    chunkWriter = getOrInitializeWriterAt(timestamp, type: type)
                }
            case .paused:
                chunkWriter = writerAt(timestamp)
            case .recording:
                chunkWriter = getOrInitializeWriterAt(timestamp, type: type)
        }
        
        guard let chunkWriter = chunkWriter else {
            if !activeOrFinalizingChunkWriters.isEmpty, ![.initial, .paused].contains(state) {
                Log.error("no writer found \(type) at \(timestamp.seconds); state: \(state)", chunkWritersDebugInfo, Log.nowString)
            }
            return
        }
        
        if type == .screen {
            lastSampleTime = timestamp // will stop at this time
        }
        
        chunkWriter.appendSampleBuffer(sampleBuffer, type: type, lastSampleBuffers: lastSampleBuffers)
        
        if lastSampleBuffers[type] == nil {
            Log.info("first chunk of \(type) at \(timestamp.seconds)", Log.nowString, chunkIndex: chunkWriter.chunkIndex)
        }
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBuffer)
    }
    
    func initializeFirstChunkWriter() {
        guard _chunkWriters.isEmpty else {
            Log.error("Can't initialize while running")
            return
        }
        initChunkWriter(index: 0, expectedStartTime: nil)
    }
    
    func stop() async {
        state = .initial
        let endTime = lastSampleTime ?? CMClock.hostTimeClock.time
        Log.info("stop", endTime.seconds, Log.nowString, chunkWritersDebugInfo)
        
        await activeChunkWriters
            .asyncForEach { chunkWriter in
                await chunkWriter.finalizeOrCancelWithDelay(
                    endTime: endTime,
                    lastSampleBuffers: lastSampleBuffers
                )
            }
        
        let chunkIndex = notCancelledChunkWriters.last?.chunkIndex
        Log.success("Stopped", endTime.seconds, Log.nowString, chunkWritersDebugInfo, chunkIndex: chunkIndex)
        Callback.print(Callback.RecordingStopped(lastChunkIndex: chunkIndex))
                       
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
