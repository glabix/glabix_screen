//
//  ScreenChunksManager.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

struct LastSampleBuffer: @unchecked Sendable {
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

actor ScreenChunksManager {
    private let screenConfigurator: ScreenConfigurator
    private let recordConfiguration: RecordConfiguration
    
    private var _chunkWriters: [ChunkWriter] = []
    private var notCancelledChunkWriters: [ChunkWriter] {
        get async {
            await _chunkWriters.async.filter {
                await $0.isNotCancelled
            }.toArray()
        }
    }
    private var activeChunkWriters: [ChunkWriter] {
        get async {
            await _chunkWriters.async.filter {
                await $0.isActive
            }.toArray()
        }
    }
    private var activeOrFinalizingChunkWriters: [ChunkWriter] {
        get async {
            await _chunkWriters.async.filter {
                await $0.isActiveOrFinalizing
            }.toArray()
        }
    }
    private var finalizedOrCancelledChunkWriters: [ChunkWriter] {
        get async {
            await _chunkWriters.async.filter {
                await $0.isFinalizedOrCancelled
            }.toArray()
        }
    }
    
    private func activeChunkWriter(_ index: Int) async -> ChunkWriter? {
        await activeChunkWriters.first(where: { $0.chunkIndex == index })
    }
    private func notCancelledChunkWriter(_ index: Int) async -> ChunkWriter? {
        await notCancelledChunkWriters.first(where: { $0.chunkIndex == index })
    }
    
    private var chunkWritersDebugInfo: String {
        get async {
            await lastChunkWritersDebugInfo(count: Int.max)
        }
    }
    
    private func lastChunkWritersDebugInfo(count: Int) async -> String {
        await "\n" + _chunkWriters
            .async
            .map { await $0.debugInfo }
            .toArray()
            .suffix(count)
            .map(\.description)
            .joined(separator: "\n")
    }
    
    private var state: ChunksManagerState = .initial

    private var sampleRetimeDiff: CMTime?
    private var lastPausedAt: CMTime = .zero
    private var lastSampleTime: CMTime?
    private var lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer] = [:]
    private var _stopped: Bool = false
    var outputDirectoryURL: URL { recordConfiguration.outputDirectoryURL }
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
    ) {
        self.screenConfigurator = screenConfigurator
        self.recordConfiguration = recordConfiguration
        
        let fileManager = FileManager.default
        do {
            try fileManager.createDirectory(atPath: recordConfiguration.outputDirectoryURL.path(), withIntermediateDirectories: true, attributes: nil)
        } catch {
            Log.error("Can not create output dir at", recordConfiguration.outputDirectoryURL, error)
        }
    }
    
    func startProcessing(sampleBufferStream: AsyncStream<SampleBufferData>) {
        Task {
            for await buffer in sampleBufferStream {
                await processSampleBuffer(buffer)
                await Task.yield()
            }
        }
    }
    
    private func buildChunkWriter(index: Int) -> ChunkWriter {
        ChunkWriter(
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
            captureMicrophone: recordConfiguration.captureMicrophone,
            index: index,
        )
    }
    
    private func appendChunkWriter(_ chunkWriter: ChunkWriter) {
        _chunkWriters.append(chunkWriter)
    }

    private func asyncInitializeNextIfNeeded(chunkWriter: ChunkWriter) {
        let nextChunkIndex = chunkWriter.chunkIndex + 1
        
        Task {
            guard await notCancelledChunkWriter(nextChunkIndex) == nil else { return }
            
            guard self.state == .recording else {
                Log.warn("invalid state for next writer initialization")
                return
            }
            
            let chunkWriter = buildChunkWriter(index: nextChunkIndex)
            appendChunkWriter(chunkWriter)
            await chunkWriter.removeOutputFiles()
        }
    }
    
    private func writerAt(_ timestamp: CMTime) async -> ChunkWriter? {
        guard let _ = sampleRetimeDiff else { return nil }
        
        return await activeOrFinalizingChunkWriters.async.first { writer in
            guard let startTime = await writer.startTime else { return false }
            let endTime = await writer.endTime
            return startTime <= timestamp && (endTime.map { $0 > timestamp } != false)
        }
    }
    
    private func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil, type: ScreenRecorderSourceType) async -> ChunkWriter? {
        guard let chunkWriter = await writerAt(timestamp) else { return nil }
        
        if let endTime = await chunkWriter.setEndIfNeeded(at: timestamp) {
            if let nextChunkWriter = await activeChunkWriter(chunkWriter.chunkIndex + 1) {
                await nextChunkWriter.startAt(endTime)
            } else {
                Log.error("nextChunkWriter not found", chunkIndex: chunkWriter.chunkIndex)
            }
        }
        
        asyncInitializeNextIfNeeded(chunkWriter: chunkWriter)
        
        let activeSequence = await activeChunkWriters.filter { $0.chunkIndex < chunkWriter.chunkIndex }.async
        for try await outdatedChunkWriter in activeSequence {
            guard let endTime = await outdatedChunkWriter.endTime else {
                Log.error("No end time found", await chunkWritersDebugInfo, chunkIndex: outdatedChunkWriter.chunkIndex)
                continue
            }
            await outdatedChunkWriter.finalizeOrCancel(endTime: endTime)
        }
        
        while let _ = await finalizedOrCancelledChunkWriters.first {
            _chunkWriters.removeFirst()
        }
        
        return chunkWriter
    }
    
    func pause() {
        guard self.state == .recording else { return }
        self.state = .shouldPause
    }
    
    func resume() {
        guard self.state == .paused else { return }
        self.state = .shouldResume
    }
    
    func startOnNextSample() {
        guard self.state == .initial else { return }
        self.state = .shouldStart
    }
    
    private func retimedSampleBufferData(_ originalSampleBuffer: SampleBufferData) -> SampleBufferData {
        guard let sampleRetimeDiff = sampleRetimeDiff else { return originalSampleBuffer }
        let timing = CMSampleTimingInfo(
            duration: originalSampleBuffer.sampleBuffer.duration,
            presentationTimeStamp: originalSampleBuffer.sampleBuffer.presentationTimeStamp - sampleRetimeDiff,
            decodeTimeStamp: originalSampleBuffer.sampleBuffer.decodeTimeStamp
        )
        let sampleBuffer = try! CMSampleBuffer(
            copying: originalSampleBuffer.sampleBuffer,
            withNewTiming: [timing]
        )
        return SampleBufferData(type: originalSampleBuffer.type, sampleBuffer: sampleBuffer)
    }
    
    func processSampleBuffer(_ originalSampleBuffer: SampleBufferData) async {
        let type = originalSampleBuffer.type
        let sampleBufferData: SampleBufferData
        let chunkWriter: ChunkWriter?
        
        switch state {
            case .initial:
                sampleBufferData = retimedSampleBufferData(originalSampleBuffer)
                chunkWriter = await writerAt(sampleBufferData.timestamp)
            case .shouldStart:
                guard type == .screen else { return }
                
                if sampleRetimeDiff == nil {
                    sampleRetimeDiff = originalSampleBuffer.timestamp
                }
                
                state = .recording
                sampleBufferData = retimedSampleBufferData(originalSampleBuffer)
                chunkWriter = await getOrInitializeWriterAt(sampleBufferData.timestamp, type: type)
            case .shouldResume:
                guard type == .screen else { return }
                
                state = .recording
                let pauseDuration = originalSampleBuffer.timestamp - lastPausedAt - CMTime(value: 1, timescale: 1000)
                sampleRetimeDiff = (sampleRetimeDiff ?? .zero) + pauseDuration
                sampleBufferData = retimedSampleBufferData(originalSampleBuffer)
                chunkWriter = await getOrInitializeWriterAt(sampleBufferData.timestamp, startTime: sampleBufferData.timestamp, type: type)
                Log.info("Resume after pause duration", pauseDuration.seconds, "at", sampleBufferData.timestamp.seconds, chunkIndex: chunkWriter?.chunkIndex)
            case .shouldPause:
                if type == .screen {
                    state = .paused
                    lastPausedAt = originalSampleBuffer.timestamp
                    sampleBufferData = retimedSampleBufferData(originalSampleBuffer)
                    chunkWriter = await writerAt(sampleBufferData.timestamp)

                    Log.info("Pausing on \(type)", "timestamp", sampleBufferData.timestamp.seconds, chunkIndex: chunkWriter?.chunkIndex)
                } else {
                    sampleBufferData = retimedSampleBufferData(originalSampleBuffer)
                    chunkWriter = await getOrInitializeWriterAt(sampleBufferData.timestamp, type: type)
                }
            case .paused:
                return
            case .recording:
                sampleBufferData = retimedSampleBufferData(originalSampleBuffer)
                chunkWriter = await getOrInitializeWriterAt(sampleBufferData.timestamp, type: type)
                
//                if chunkWriter?.chunkIndex == 3, self._stopped == false {
//                    Task {
//                        Log.error("COMMENT OUT THIS!", Log.nowString)
//                        self._stopped = true
//                        //                self.pause()
//                        //                try? await Task.sleep(for: .seconds(0.3))
//                        await stop()
//                    }
//                }
        }
        
        guard let chunkWriter = chunkWriter else {
            if !(await activeOrFinalizingChunkWriters.isEmpty),
               ![.initial].contains(state),
               sampleBufferData.sampleBuffer.presentationTimeStamp > .zero // skip buffers before start time
            {
                Log.error("no writer found \(type) at \(sampleBufferData.timestamp.seconds); state: \(state)", await lastChunkWritersDebugInfo(count: 3), Log.nowString)
            }
            
            for activeChunkWriter in await activeOrFinalizingChunkWriters {
                await activeChunkWriter.handleProcessedSampleBuffer(type: type, at: sampleBufferData.timestamp)
            }
            
            return
        }
        
        if type == .screen {
            lastSampleTime = sampleBufferData.timestamp // will stop at this time
        }
        
        await chunkWriter.appendSampleBuffer(sampleBufferData, lastSampleBuffers: lastSampleBuffers, debugString: "process")
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBufferData.sampleBuffer)
        
        for activeChunkWriter in await activeOrFinalizingChunkWriters {
            await activeChunkWriter.handleProcessedSampleBuffer(type: type, at: sampleBufferData.timestamp)
        }
    }
    
    func initializeFirstChunkWriter() async {
        guard _chunkWriters.isEmpty else {
            Log.error("Can't initialize while running")
            return
        }
        let chunkWriter = buildChunkWriter(index: 0)
        appendChunkWriter(chunkWriter)
        await chunkWriter.removeOutputFiles()
        await chunkWriter.startAt(.zero)
    }
    
    func stop() async {
        self.state = .initial
        let endTime = lastSampleTime ?? CMClock.hostTimeClock.time
        
        
        while let chunkWriter = await activeChunkWriters.first {
            await chunkWriter.finalizeOrCancel(endTime: endTime)
        }
        
        while let chunkWriter = await activeOrFinalizingChunkWriters.first {
            try? await Task.sleep(nanoseconds: UInt64(0.1 * 1_000_000_000))
            if await chunkWriter.isActiveOrFinalizing {
                Log.warn("waiting to finish value", chunkIndex: chunkWriter.chunkIndex)
            }
        }
        
        let lastChunkIndex = await notCancelledChunkWriters
//            .async
//            .last(where: { await $0.startTime != nil })?
            .last?
            .chunkIndex
        Log.success("Stopped", endTime.seconds, await chunkWritersDebugInfo, chunkIndex: lastChunkIndex)
        Callback.print(Callback.RecordingStopped(lastChunkIndex: lastChunkIndex))
        
        self._chunkWriters = []
        self.lastSampleBuffers = [:]
    }
}
