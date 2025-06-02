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

actor ChunksHolder {
    private let screenConfigurator: ScreenConfigurator
    private let recordConfiguration: RecordConfiguration
    private var outputDirectoryURL: URL!
    private let defaultChunksDir: String
    
    private var _chunkWriters: [ChunkWriter] = []
    func notCancelledChunkWriters()  async -> [ChunkWriter] {
        await _chunkWriters.async.filter {
            await $0.isNotCancelled
        }.toArray()
//        (\.isNotCancelled)
    }
    func activeChunkWriters() async -> [ChunkWriter] {
        await _chunkWriters.async.filter {
            await $0.isActive
        }.toArray()
    }
    func activeOrFinalizingChunkWriters() async -> [ChunkWriter] {
        await _chunkWriters.async.filter{
            await $0.isActiveOrFinalizing
        }.toArray()
    }
    func activeChunkWriter(_ index: Int) async -> ChunkWriter? {
        await activeChunkWriters().async.first(where: { $0.chunkIndex == index })
    }
    
    func chunkWritersDebugInfo() async -> String {
        await "\n" + _chunkWriters
        //            .map(\.debugInfo)
            .asyncMap {
                await $0.debugInfo
            }
            .map(\.description)
            .joined(separator: "\n")
    }
    
    init(screenConfigurator: ScreenConfigurator, recordConfiguration: RecordConfiguration, defaultChunksDir: String) {
        self.screenConfigurator = screenConfigurator
        self.recordConfiguration = recordConfiguration
        self.outputDirectoryURL = nil
        self.defaultChunksDir = defaultChunksDir
    }
    
    func start(withDirectoryURL outputDirectoryURL: URL?) async {
        self.outputDirectoryURL = outputDirectoryURL
        
//        await notCancelledChunkWriters().forEach {
//            $0.outputDirectoryURL = outputDirectoryURL
//        }
    }
    
    func initializeFirstChunkWriter() {
        guard _chunkWriters.isEmpty else {
            Log.error("Can't initialize while running")
            return
        }
        initChunkWriter(index: 0, expectedStartTime: nil)
    }
    
    func clear() {
        _chunkWriters = []
    }
    
    func initChunkWriterIfNeeded(index: Int, expectedStartTime: CMTime?) async {
        guard await activeChunkWriter(index) == nil else { return }
        initChunkWriter(index: index, expectedStartTime: expectedStartTime)
    }
    
    func initChunkWriter(index: Int, expectedStartTime: CMTime?) {
        Log.print("createNewChunk initChunkWriter expectedStartTime:", expectedStartTime?.seconds ?? 0, Log.nowString, chunkIndex: index)
        _chunkWriters.append(
            ChunkWriter(
                screenConfigurator: screenConfigurator,
                recordConfiguration: recordConfiguration,
                tempDirectoryURL: getOrCreateTempOutputDirectory(),
                outputDirectoryURL: outputDirectoryURL,
                captureMicrophone: recordConfiguration.captureMicrophone,
                index: index,
                startTime: expectedStartTime
            )
        )
    }
    
    func writerAt(_ timestamp: CMTime) async -> ChunkWriter? {
        await activeOrFinalizingChunkWriters().async.first { writer in
            guard let startTime = await writer.startTime, let endTime = await writer.endTime else { return false }
            return endTime >= timestamp && startTime <= timestamp
        }
    }
    
    private func getOrCreateTempOutputDirectory() -> URL? {
        let fileManager = FileManager.default
        
        guard let pathURL = tempOutputDirectory,
              let _ = try? fileManager.createDirectory(atPath: pathURL.path(), withIntermediateDirectories: true, attributes: nil) else { return nil }
        return pathURL
    }
    
    var tempOutputDirectory: URL? {
        let fileManager = FileManager.default
        let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
        
        return documentsDirectory?.appendingPathComponent(defaultChunksDir)
    }
    
    func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil, type: ScreenRecorderSourceType) async -> ChunkWriter? {
        if await writerAt(timestamp) == nil, type == .screen {
            let lastChunk = await notCancelledChunkWriters().last
            let defaultEndTime = await lastChunk?.endTime ?? timestamp
            let newChunkStartTime = startTime ?? defaultEndTime
            let newChunkIndex: Int
            if let lastChunk = lastChunk {
                if await lastChunk.startTime == nil {
                    newChunkIndex = lastChunk.chunkIndex
                    Log.info("starting chunk at \(newChunkStartTime.seconds)", Log.nowString, chunkIndex: newChunkIndex)
                    await lastChunk.startAt(newChunkStartTime)
                } else {
                    newChunkIndex = lastChunk.chunkIndex + 1
                }
            } else {
                newChunkIndex = 0
            }
            
            if let nextChunkWriter = await activeChunkWriter(newChunkIndex) {
                Log.print("createNewChunk Chunk Exists #\(newChunkIndex) start:", newChunkStartTime.seconds, "chunk start", await nextChunkWriter.startTime?.seconds ?? 0, "end", await nextChunkWriter.endTime?.seconds ?? 0, Log.nowString, chunkIndex: newChunkIndex)
            } else {
                Log.warn("!!!!!!!! createNewChunk start:", newChunkStartTime.seconds, "startTime", startTime?.seconds ?? 0, "current", timestamp.seconds, chunkWritersDebugInfo, Log.nowString, chunkIndex: newChunkIndex)
                initChunkWriter(index: newChunkIndex, expectedStartTime: newChunkStartTime)
            }
        }
        
        return await writerAt(timestamp)
    }
}

actor ChunksStateActor {
    var state: ChunksManagerState = .initial
    
    func shouldPause() {
        guard state == .recording else { return }
        state = .shouldPause
    }
    
    func shouldResume() {
        guard state == .paused else { return }
        state = .shouldResume
    }
    
    func shouldStart() {
        guard state == .initial else { return }
        state = .shouldStart
    }
    
    func recording() {
        state = .recording
    }
    
    func paused() {
        state = .paused
    }
    
    func stop() {
        state = .initial
    }
}

actor SamplesActor {
    private var lastSampleTime: CMTime? = nil
    private var lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer] = [:]
    //    private let queue = DispatchQueue(label: "com.glabix.screen.chunksManager")
    //    private let processSampleQueue = DispatchQueue(label: "com.glabix.screen.screenCapture.processSample")
    //    private let defaultChunksDir: String
    //    private var outputDirectoryURL: URL!
    
    private let chunksHolder: ChunksHolder
    private let stateActor = ChunksStateActor()
    
    init(chunksHolder: ChunksHolder) {
        self.chunksHolder = chunksHolder
    }
    
    func test(_ sampleBuffer: CMSampleBuffer) {
        lastSampleTime = nil
    }
}

class ScreenChunksManager: @unchecked Sendable {
    private let screenConfigurator: ScreenConfigurator
    private let recordConfiguration: RecordConfiguration
    

    private var lastSampleTime: CMTime?
    private var lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer] = [:]
//    private let queue = DispatchQueue(label: "com.glabix.screen.chunksManager")
    private let processSampleQueue = DispatchQueue(label: "com.glabix.screen.screenCapture.processSample")
//    private let defaultChunksDir: String
//    private var outputDirectoryURL: URL!
    
    private let chunksHolder: ChunksHolder
    private let samplesActor: SamplesActor
    private let stateActor = ChunksStateActor()
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) {
        self.screenConfigurator = screenConfigurator
        self.recordConfiguration = recordConfiguration
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "y-MM-dd_HH-mm-ss"
        let defaultChunksDir = dateFormatter.string(from: Date())
        
        chunksHolder = ChunksHolder(
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
            defaultChunksDir: defaultChunksDir
        )
        
        samplesActor = SamplesActor(chunksHolder: chunksHolder)
    }
    
    private func asyncInitializeNextIfNeeded(chunkWriter: ChunkWriter) {
        let nextChunkIndex = chunkWriter.chunkIndex + 1
        
//        processSampleQueue.async { [weak self] in // not always state = shouldPause being applied
        Task.detached(priority: .background) { [chunksHolder, stateActor] in
            
            
            guard await stateActor.state == .recording else {
                Log.warn("invalid state for next writer initialization")
                return
            }
//            
//            Log.info("asyncInitializeNextIfNeeded current index", chunkWriter.chunkIndex, "state", await stateActor.state, "with start time", chunkWriter.endTime?.seconds ?? 0, Log.nowString, await chunksHolder.chunkWritersDebugInfo, chunkIndex: nextChunkIndex)
            await chunksHolder.initChunkWriterIfNeeded(index: nextChunkIndex, expectedStartTime: chunkWriter.endTime)
        }
    }
    

    func tempOutputDirectory() async -> URL? {
        await chunksHolder.tempOutputDirectory
    }
    
    func initializeFirstChunkWriter() async {
        await chunksHolder.initializeFirstChunkWriter()
    }
    
    func pause() async {
        await stateActor.shouldPause()
    }
    
    func resume() async {
        await stateActor.shouldResume()
    }
    
    func startOnNextSample(outputDirectoryPath: String) {
        Task {
            let outputDirectoryURL = URL(fileURLWithPath: outputDirectoryPath)
            
            let fileManager = FileManager.default
            do {
                try fileManager.createDirectory(atPath: outputDirectoryURL.path(), withIntermediateDirectories: true, attributes: nil)
            } catch {
                Log.error("Can not create output dir at", outputDirectoryURL ?? "nil")
            }
            
            await chunksHolder.start(withDirectoryURL: outputDirectoryURL)
            
            await stateActor.shouldStart()
        }
    }
    
    func syncProcessSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) {
//        Task.detached(priority: .medium) { [weak self] in
        processSampleQueue.async { [sampleBuffer, weak self] in
            
            Task { [sampleBuffer, weak self] in
                await self?.processSampleBuffer(sampleBuffer, type: type)
                //            await samplesActor?.test(sampleBuffer)
                
                //            if writerAt(sampleBuffer.presentationTimeStamp)?.chunkIndex == 3, state == .recording {
                //                Log.error("COMMENT OUT THIS!", Log.nowString)
                //                pause()
                //                Task {
                //                    await stop()
                //                }
                //            }
            }
        }
    }
    
    func getOrInitializeWriterAt(_ timestamp: CMTime, startTime: CMTime? = nil, type: ScreenRecorderSourceType) async -> ChunkWriter? {
        if let chunkWriter = await chunksHolder.getOrInitializeWriterAt(timestamp, type: type) {
            asyncInitializeNextIfNeeded(chunkWriter: chunkWriter)
            await chunksHolder.activeChunkWriters()
                .filter { $0.chunkIndex < chunkWriter.chunkIndex }
                .asyncForEach { outdatedChunkWriter in
                    guard let endTime = await outdatedChunkWriter.endTime else { return }
                    await outdatedChunkWriter.updateStatusOnFinalizeOrCancel(endTime: endTime)
                    
                    //                    queue.async { [weak outdatedChunkWriter, weak self] in
                    Task { [weak outdatedChunkWriter, weak self] in
                        guard let lastSampleBuffers = self?.lastSampleBuffers else { return }
                        await outdatedChunkWriter?.finalizeOrCancelWithDelay(
                            endTime: endTime,
                            lastSampleBuffers: lastSampleBuffers
                        )
                    }
                    //                    }
                }
            
            return chunkWriter
        }
        
        return nil
    }
    
    func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: ScreenRecorderSourceType) async {
        let timestamp = sampleBuffer.presentationTimeStamp
        
        let chunkWriter: ChunkWriter?
        switch await stateActor.state {
            case .initial:
                chunkWriter = await chunksHolder.writerAt(timestamp)
            case .shouldStart:
                guard type == .screen else { return }
                
                await stateActor.recording()
                chunkWriter = await getOrInitializeWriterAt(timestamp, type: type)
            case .shouldResume:
                guard type == .screen else { return }
                
                await stateActor.recording()
                chunkWriter = await getOrInitializeWriterAt(timestamp, startTime: timestamp, type: type)
            case .shouldPause:
                if type == .screen {
                    await stateActor.paused()
                    chunkWriter = await chunksHolder.writerAt(timestamp)
                    
                    Log.info("Pausing", "timestamp", timestamp.seconds, Log.nowString, await chunksHolder.chunkWritersDebugInfo(), chunkIndex: chunkWriter?.chunkIndex)//, "chunk start", chunkStartTime.seconds)
                    //            pausedAt = timestamp
                    
//                    queue.async { [weak self] in
                        Task { //[weak self] in
                            await chunksHolder.activeChunkWriters()
                                .asyncForEach { chunkWriter in
                                    await chunkWriter.updateStatusOnFinalizeOrCancel(endTime: timestamp)
                                
//                                    guard let lastSampleBuffers = lastSampleBuffers else { return }
                                    await chunkWriter.finalizeOrCancelWithDelay(
                                        endTime: timestamp,
                                        lastSampleBuffers: lastSampleBuffers
                                    )
                                }
                            
                            guard let lastChunkIndex = await chunksHolder.notCancelledChunkWriters().last?.chunkIndex else { return }
                            await chunksHolder.initChunkWriter(index: lastChunkIndex + 1, expectedStartTime: nil)
                            Log.success("Paused", await chunksHolder.chunkWritersDebugInfo())
                        }
//                    }
                } else {
                    chunkWriter = await getOrInitializeWriterAt(timestamp, type: type)
                }
            case .paused:
                chunkWriter = await chunksHolder.writerAt(timestamp)
            case .recording:
                chunkWriter = await getOrInitializeWriterAt(timestamp, type: type)
        }
        
        guard let chunkWriter = chunkWriter else {
            if await !chunksHolder.activeOrFinalizingChunkWriters().isEmpty,
               await ![.initial, .paused].contains(stateActor.state),
               (await chunksHolder.notCancelledChunkWriters().first?.startTime.map { $0 <= timestamp } == true) // skip buffers before start time
            {
                Log.error("no writer found \(type) at \(timestamp.seconds); state: \(await stateActor.state)", await chunksHolder.chunkWritersDebugInfo(), Log.nowString)
            }
            return
        }
        
        if type == .screen {
            lastSampleTime = timestamp // will stop at this time
        }
        
        await chunkWriter.appendSampleBuffer(sampleBuffer, type: type, lastSampleBuffers: lastSampleBuffers)
        
        if lastSampleBuffers[type] == nil {
            Log.info("first chunk of \(type) at \(timestamp.seconds)", Log.nowString, chunkIndex: chunkWriter.chunkIndex)
        }
        
        lastSampleBuffers[type] = LastSampleBuffer(chunkIndex: chunkWriter.chunkIndex, sampleBuffer: sampleBuffer)
    }
    
    func stop() async {
        await stateActor.stop()
        
        let endTime = lastSampleTime ?? CMClock.hostTimeClock.time
        Log.info("stop", endTime.seconds, Log.nowString, await chunksHolder.chunkWritersDebugInfo())
        
        await chunksHolder.activeChunkWriters()
            .asyncForEach { chunkWriter in
                await chunkWriter.finalizeOrCancelWithDelay(
                    endTime: endTime,
                    lastSampleBuffers: lastSampleBuffers
                )
            }
        
        let chunkIndex = await chunksHolder.notCancelledChunkWriters().last?.chunkIndex
        Log.success("Stopped", endTime.seconds, Log.nowString, await chunksHolder.chunkWritersDebugInfo(), chunkIndex: chunkIndex)
        Callback.print(Callback.RecordingStopped(lastChunkIndex: chunkIndex))
                       
        await chunksHolder.clear()
        self.lastSampleBuffers = [:]
    }
}
