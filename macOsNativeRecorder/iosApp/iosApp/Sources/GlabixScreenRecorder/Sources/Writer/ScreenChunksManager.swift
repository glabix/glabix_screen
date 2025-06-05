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
    private func notCancelledChunkWriter(_ index: Int) -> ChunkWriter? {
        notCancelledChunkWriters.first(where: { $0.chunkIndex == index })
    }
    
//    private var chunkWritersDebugInfo: [[Any]] {
    private var chunkWritersDebugInfo: String {
        "\n" + _chunkWriters
            .map(\.debugInfo)
            .map(\.description)
            .joined(separator: "\n")
    }
    
    private var state: ChunksManagerState = .initial

    private var sampleRetimeDiff: CMTime?
    private var lastPausedAt: CMTime = .zero
    private var lastSampleTime: CMTime?
    private var lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer] = [:]
    private let asyncFinalizeQueue = DispatchQueue(label: "com.glabix.screen.chunksManager.asyncFinalize")
    let bufferProcessingQueue = DispatchQueue(label: "com.recorder.buffer.queue",
                                            qos: .userInteractive,
                                            attributes: .concurrent)
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
    
    private func initChunkWriter(index: Int) -> ChunkWriter {
        Log.print("createNewChunk initChunkWriter", chunkIndex: index)
        let writer = ChunkWriter(
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
            captureMicrophone: recordConfiguration.captureMicrophone,
            index: index,
        )
        _chunkWriters.append(writer)
        
        return writer
    }

    private func asyncInitializeNextIfNeeded(chunkWriter: ChunkWriter) {
        let nextChunkIndex = chunkWriter.chunkIndex + 1
        
        bufferProcessingQueue.async { [weak self] in // not always state = shouldPause being applied
            guard self?.notCancelledChunkWriter(nextChunkIndex) == nil else { return }
            
            guard self?.state == .recording else {
                Log.warn("invalid state for next writer initialization")
                return
            }
            
            Log.info("asyncInitializeNextIfNeeded current index", chunkWriter.chunkIndex, "state", self?.state, Log.nowString, chunkIndex: nextChunkIndex)
            _ = self?.initChunkWriter(index: nextChunkIndex)
        }
    }
    
    private func writerAt(_ timestamp: CMTime) -> ChunkWriter? {
        guard let _ = sampleRetimeDiff else { return nil }
        
        return activeOrFinalizingChunkWriters.first { writer in
            guard let startTime = writer.startTime else { return false }
            return startTime <= timestamp && (writer.endTime.map { $0 > timestamp } != false)
        }
    }
    
    private func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil, type: ScreenRecorderSourceType) -> ChunkWriter? {
        guard let chunkWriter = writerAt(timestamp) else { return nil }
        
        if chunkWriter.endTime == nil, chunkWriter.calcCurrentFileSize() >= recordConfiguration.minChunkSizeBytes {
            let endTime = timestamp + CMTime(seconds: 0.3, preferredTimescale: 10)
//            Log.info("will end", endTime.seconds, chunkIndex: chunkWriter.chunkIndex)
            chunkWriter.endTime = endTime
            
            if let nextChunkWriter = activeChunkWriter(chunkWriter.chunkIndex + 1) {
                nextChunkWriter.startAt(endTime)
            } else {
                Log.error("nextChunkWriter not found", chunkIndex: chunkWriter.chunkIndex)
            }
        }
        
        asyncInitializeNextIfNeeded(chunkWriter: chunkWriter)
        
        activeChunkWriters
            .filter { $0.chunkIndex < chunkWriter.chunkIndex }
            .forEach { outdatedChunkWriter in
                guard let endTime = outdatedChunkWriter.endTime else {
                    Log.error("No end time found", chunkWritersDebugInfo, chunkIndex: outdatedChunkWriter.chunkIndex)
                    return
                }
                outdatedChunkWriter.updateStatusOnFinalizeOrCancel(endTime: endTime)
                
                bufferProcessingQueue.async(flags: .barrier) { [weak outdatedChunkWriter, weak self] in
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
    }
    
    func pause() {
        bufferProcessingQueue.async {
            guard self.state == .recording else { return }
            self.state = .shouldPause
        }
    }
    
    func resume() {
        bufferProcessingQueue.async {
            guard self.state == .paused else { return }
            self.state = .shouldResume
        }
    }
    
    func startOnNextSample() {
        bufferProcessingQueue.async {
            guard self.state == .initial else { return }
            self.state = .shouldStart
        }
    }
    
//    private var _stopped: Bool = false
    func syncProcessSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        bufferProcessingQueue.async(flags: .barrier) {
            self.processSampleBuffer(sampleBuffer, type: type)
            
//            if self.writerAt(sampleBuffer.presentationTimeStamp - (self.firstSampleTime ?? .zero))?.chunkIndex == 3, self.state == .recording, self._stopped == false {
//                Log.error("COMMENT OUT THIS!", Log.nowString)
//                self._stopped = true
////                self.pause()
//                Task {
//                    try? await Task.sleep(for: .seconds(0.3))
//                    await self.stop()
//                }
//            }
        }
    }
    
    private func retimedSampleBuffer(_ originalSampleBuffer: CMSampleBuffer) -> CMSampleBuffer {
        guard let sampleRetimeDiff = sampleRetimeDiff else { return originalSampleBuffer }
        let timing = CMSampleTimingInfo(
            duration: originalSampleBuffer.duration,
            presentationTimeStamp: originalSampleBuffer.presentationTimeStamp - sampleRetimeDiff,
            decodeTimeStamp: originalSampleBuffer.decodeTimeStamp
        )
        return try! CMSampleBuffer(copying: originalSampleBuffer, withNewTiming: [timing])
    }
    
    private func processSampleBuffer(_ originalSampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
        let sampleBuffer: CMSampleBuffer
        let chunkWriter: ChunkWriter?
        switch state {
            case .initial:
                sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
                chunkWriter = writerAt(sampleBuffer.presentationTimeStamp)
            case .shouldStart:
                guard type == .screen else { return }
                
                if sampleRetimeDiff == nil {
                    sampleRetimeDiff = originalSampleBuffer.presentationTimeStamp
                }
                
                state = .recording
                sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
                chunkWriter = getOrInitializeWriterAt(sampleBuffer.presentationTimeStamp, type: type)
            case .shouldResume:
                guard type == .screen else { return }
                
                state = .recording
                let pauseDuration = originalSampleBuffer.presentationTimeStamp - lastPausedAt - CMTime(value: 1, timescale: 1000)
                sampleRetimeDiff = (sampleRetimeDiff ?? .zero) + pauseDuration
                sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
                chunkWriter = getOrInitializeWriterAt(sampleBuffer.presentationTimeStamp, startTime: sampleBuffer.presentationTimeStamp, type: type)
                Log.info("Resume after pause duration", pauseDuration.seconds, "at", sampleBuffer.presentationTimeStamp.seconds, chunkIndex: chunkWriter?.chunkIndex)
            case .shouldPause:
                if type == .screen {
                    state = .paused
                    lastPausedAt = originalSampleBuffer.presentationTimeStamp
                    sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
                    chunkWriter = writerAt(sampleBuffer.presentationTimeStamp)

                    Log.info("Pausing on \(type)", "timestamp", sampleBuffer.presentationTimeStamp.seconds, chunkIndex: chunkWriter?.chunkIndex)
                } else {
                    sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
                    chunkWriter = getOrInitializeWriterAt(sampleBuffer.presentationTimeStamp, type: type)
                }
            case .paused:
                return;
//                sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
//                chunkWriter = writerAt(sampleBuffer.presentationTimeStamp)
            case .recording:
                sampleBuffer = retimedSampleBuffer(originalSampleBuffer)
                chunkWriter = getOrInitializeWriterAt(sampleBuffer.presentationTimeStamp, type: type)
        }
        
        guard let chunkWriter = chunkWriter else {
            if !activeOrFinalizingChunkWriters.isEmpty,
               ![.initial].contains(state),
               sampleBuffer.presentationTimeStamp > .zero // skip buffers before start time
            {
                Log.error("no writer found \(type) at \(sampleBuffer.presentationTimeStamp.seconds); state: \(state)", chunkWritersDebugInfo, Log.nowString)
            }
            return
        }
        
        if type == .screen {
//            Log.print("appe scr", state, chunkWritersDebugInfo, chunkWriter.calcCurrentFileSize(), chunkIndex: chunkWriter.chunkIndex)
            lastSampleTime = sampleBuffer.presentationTimeStamp // will stop at this time
        }
        
        chunkWriter.appendSampleBuffer(sampleBuffer, type: type, lastSampleBuffers: lastSampleBuffers)
        
//        if lastSampleBuffers[type] == nil {
//            Log.info("first chunk of \(type) at \(timestamp.seconds)", Log.nowString, chunkIndex: chunkWriter.chunkIndex)
//        }
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBuffer)
    }
    
    func initializeFirstChunkWriter() {
        guard _chunkWriters.isEmpty else {
            Log.error("Can't initialize while running")
            return
        }
        initChunkWriter(index: 0).startAt(.zero)
    }
    
    func stop() async { // must be called in bufferProcessingQueue
        let endTime = self.lastSampleTime ?? CMClock.hostTimeClock.time
        Log.info("stop called", endTime.seconds, Log.nowString, self.chunkWritersDebugInfo)
        
        while !self.activeChunkWriters.isEmpty,
              let chunkWriter = self.activeChunkWriters.first {
            chunkWriter.updateStatusOnFinalizeOrCancel(endTime: endTime)
            await chunkWriter.finalizeOrCancelWithDelay(
                endTime: endTime,
                lastSampleBuffers: self.lastSampleBuffers
            )
        }
        
        self.state = .initial
        
        //        await activeChunkWriters
        //            .asyncForEach { chunkWriter in
        //                await chunkWriter.finalizeOrCancelWithDelay(
        //                    endTime: endTime,
        //                    lastSampleBuffers: lastSampleBuffers
        //                )
        //            }
        
        let chunkIndex = self.notCancelledChunkWriters.last(where: { $0.startTime != nil })?.chunkIndex
        Log.success("Stopped", endTime.seconds, self.chunkWritersDebugInfo, chunkIndex: chunkIndex)
        Callback.print(Callback.RecordingStopped(lastChunkIndex: chunkIndex))
        
        self._chunkWriters = []
        self.lastSampleBuffers = [:]
    }
}
