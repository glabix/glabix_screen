//
//  ChunkWriter.swift
//  iosApp
//
//  Created by Pavel Feklistov on 14.05.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

actor ChunkWriter {
    private var writer: AssetWriter?
    var startTime: CMTime?
    private var endedAt: CMTime?
    var endTime: CMTime? {
        didSet {
            guard endTime != nil else { return }
            endedAt = CMClock.hostTimeClock.time
        }
    }
    let chunkIndex: Int
    
    private let minChunkSizeBytes: Int
    private let minChunkDuration: CMTime
    private var lastScreenSampleBuffer: CMSampleBuffer? // set at `initialOf_TYPE`
//    var _firstMicSampleBufferAt: CMTime?
//    var _firstSystemAudioSampleBufferAt: CMTime?
//    var _lastMicSampleBufferAt: CMTime?
//    var _lastMicSampleBufferDuration: CMTime?
//    var _lastSystemAudioSampleBufferAt: CMTime?
//    var _lastSystemAudioSampleBufferDuration: CMTime?
    private var hasAnySampleBufferOf: [ScreenRecorderSourceType: Bool] = [:]
    private var pendingBuffers: [SampleBufferData] = []

    private var status: ChunkWriterStatus = .active
    
    private let outputScreenChunkURL: URL?
    private let outputMicChunkURL: URL?
    private let fileManager = FileManager.default
    
    var isActive: Bool { writer != nil && status == .active }
    var isActiveOrFinalizing: Bool { writer != nil && (status == .active || status == .finalizing) }
    var isNotCancelled: Bool { status != .cancelled && status != .cancelling }
    var isFinalizedOrCancelled: Bool { [.cancelled, .finalized].contains(status) }
    var debugStatus: ChunkWriterStatus { status }
    private var debugBacklog: [String] = []
    private var sourceTypeCompletionMapping: [ScreenRecorderSourceType: Bool] = [:]
                            
    var debugInfo: String {
        [
            "(\(chunkIndex))",
            "time: \(startTime?.seconds ?? -1)-\(endTime?.seconds ?? -1)",
            "writer?: \(writer != nil)",
            "status: \(status)",
            "lastScreenAt: \(lastScreenSampleBuffer?.presentationTimeStamp.seconds ?? -1)",
            "writer status: \(writer?.debugStatus ?? "n/a")",
            "size: \(calcCurrentFileSize().formatted(.byteCount(style: .file)))"
        ]
            .map(\.description)
            .joined(separator: " ")
    }
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        captureMicrophone: Bool,
        index: Int,
    ) {
        minChunkSizeBytes = recordConfiguration.minChunkSizeBytes
        minChunkDuration = recordConfiguration.minChunkDuration
        
        let outputDirectoryURL = recordConfiguration.outputDirectoryURL
        let urlBuilder = ChunkURLBuilder(chunkIndex: index, dirURL: outputDirectoryURL)
        
        outputScreenChunkURL = urlBuilder.screenURL
        outputMicChunkURL = if captureMicrophone {
            urlBuilder.micURL
        } else { nil }
        
        do {
            self.writer = try AssetWriter(
                screenOutputURL: outputScreenChunkURL,
                micOutputURL: outputMicChunkURL,
                screenConfigurator: screenConfigurator,
                recordConfiguration: recordConfiguration,
                chunkIndex: index
            )
        } catch {
            Log.error("failed creating writer", error, chunkIndex: index)
        }
        
        self.chunkIndex = index
    }
    
    private func debugLog(_ message: String) {
        debugBacklog.append(message)
//        Log.print(message, chunkIndex: chunkIndex)
    }
    
    func handleProcessedSampleBuffer(type: ScreenRecorderSourceType, at timestamp: CMTime) {
        guard let endTime = endTime, !isAllSourceTypesCompleted else { return }
        sourceTypeCompletionMapping[type] = timestamp >= endTime
        
        if isAllSourceTypesCompleted {
//            let diff = CMClock.hostTimeClock.time - (endedAt ?? .zero)
//            Log.success("completed \(type) diff \(diff.seconds) \(status)", chunkIndex: chunkIndex)
            
            Task {
                if status == .finalizing {
                    try! await finalize()
                }
            }
        }
    }
    
    private var isAllSourceTypesCompleted: Bool {
        ScreenRecorderSourceType.allCases.allSatisfy { type in
            writer?.isRecording(type: type) != true || sourceTypeCompletionMapping[type] == true
        }
    }
    
    func setEndIfNeeded(at timestamp: CMTime) -> CMTime? {
        guard let startTime = startTime else { return nil }
        let duration = timestamp - startTime
        guard endTime == nil, calcCurrentFileSize() >= minChunkSizeBytes, duration >= minChunkDuration else { return nil }
        
        let endTime = timestamp + CMTime(seconds: 0.3, preferredTimescale: 10) // need time to start recording session on next chunk writer
        self.endTime = endTime
        return endTime
    }
    
    func startAt(_ startTime: CMTime?) {
        guard let startTime = startTime else { return }
        self.startTime = startTime
        writer?.startSession(atSourceTime: startTime)
    }
    
    private func shouldCancel(atEndTime endTime: CMTime) -> Bool {
        if let startTime = startTime, startTime <= endTime {
            return false
        } else {
            return true
        }
    }
    
    func finalizeOrCancel(endTime: CMTime) {
        debugLog("finalizeOrCancel at \(endTime.seconds) value \(isAllSourceTypesCompleted)")
        self.endTime = endTime
        
        if shouldCancel(atEndTime: endTime) {
            status = .cancelling
            Task {
                await cancel()
            }
        } else {
            status = .finalizing
        }
    }
    
    private func finalize() async throws {
        guard let endTime = endTime else {
            throw ChunkWriterError.undefinedFinalizeTime
        }
        
        status = .finalized
        
        debugLog("chunk writer finalized. pending \(pendingBuffers.count) at \(endTime.seconds) lastAt: \(lastScreenSampleBuffer?.presentationTimeStamp.seconds ?? 0)")
        if let lastSampleBuffer = lastScreenSampleBuffer {
            if let finalSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(from: lastSampleBuffer, at: endTime) {
                if finalSampleBuffer.presentationTimeStamp != lastSampleBuffer.presentationTimeStamp {
                    appendSampleBuffer(SampleBufferData(type: .screen, sampleBuffer: finalSampleBuffer), lastSampleBuffers: [:], debugString: "lastScreenSample")
                    debugLog("writing as last screen time: \(lastSampleBuffer.presentationTimeStamp.seconds) endtime \(endTime.seconds) final at \(finalSampleBuffer.presentationTimeStamp.seconds)")
                } else {
                    debugLog("writing SKIPPED as last screen time: \(lastSampleBuffer.presentationTimeStamp.seconds) endtime \(endTime.seconds) final at \(finalSampleBuffer.presentationTimeStamp.seconds)")
                }
            }
        }
        
//        let sysDiff: CMTime = (_lastSystemAudioSampleBufferAt ?? .zero) - (_firstSystemAudioSampleBufferAt ?? .zero)
//        let sysDiffWithDuration: CMTime = (_lastSystemAudioSampleBufferAt ?? .zero) - (_firstSystemAudioSampleBufferAt ?? .zero) + (_lastSystemAudioSampleBufferDuration ?? .zero)
//        let micDiff: CMTime = (_lastMicSampleBufferAt ?? .zero) - (_firstMicSampleBufferAt ?? .zero)
//        let micDiffWithDuration: CMTime = (_lastMicSampleBufferAt ?? .zero) - (_firstMicSampleBufferAt ?? .zero) + (_lastMicSampleBufferDuration ?? .zero)
//        Log.info("_finalized start: \(startTime?.seconds ?? 0) end: \(endTime.seconds)", chunkIndex: chunkIndex)
//        Log.info("_finalized sys: \(sysDiff.seconds) \(sysDiffWithDuration.seconds); first SystemAudio: \(_firstSystemAudioSampleBufferAt?.seconds ?? 0); last SystemAudio: \(_lastSystemAudioSampleBufferAt?.seconds ?? 0)", chunkIndex: chunkIndex)
//        Log.info("_finalized mic: \(micDiff.seconds) \(micDiffWithDuration.seconds); first mic: \(_firstMicSampleBufferAt?.seconds ?? 0); last mic: \(_lastMicSampleBufferAt?.seconds ?? 0)", chunkIndex: chunkIndex)
        tryWritePendingBuffers()
        
        if let error = writer?.screenError as? Error {
            Log.error("Chunk writer failed due to `\(error.localizedDescription)`", chunkIndex: chunkIndex)
            debugBacklog.forEach { row in
                Log.print(row, chunkIndex: chunkIndex)
            }
        }
        
        await writer?.finalize(endTime: endTime)
        writer = nil
        self.lastScreenSampleBuffer = nil
        
        Callback.print(Callback.ChunkFinalized(
            index: chunkIndex,
            screenFile: outputScreenChunkURL.map {
                Callback.ChunkFile(path: $0.path(), size: try? $0.fileSize())
            },
            micFile: outputMicChunkURL.map {
                Callback.ChunkFile(path: $0.path(), size: try? $0.fileSize())
            }
        ))
    }
    
    private func cancel() async {
        status = .cancelled
        
        let endTime = self.endTime ?? startTime ?? .zero
        await writer?.finalize(endTime: endTime)
        writer = nil
        lastScreenSampleBuffer = nil
        pendingBuffers = []
        
        removeOutputFiles()
        Log.print("chunk writer cancelled #\(chunkIndex) at \(endTime.seconds)")
    }
    
    func removeOutputFiles() {
        if let screenChunkURL = outputScreenChunkURL, fileManager.fileExists(atPath: screenChunkURL.path()) {
            do {
                try fileManager.removeItem(at: screenChunkURL)
            } catch {
                Log.error("can not remove file at \(screenChunkURL.path())", error)
            }
        }
        
        if let micChunkURL = outputMicChunkURL, fileManager.fileExists(atPath: micChunkURL.path()) {
            do {
                try fileManager.removeItem(at: micChunkURL)
            } catch {
                Log.error("can not remove file at \(micChunkURL.path())", error)
            }
        }
    }
    
    func appendSampleBuffer(_ buffer: SampleBufferData, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer], debugString: String) {
        let type = buffer.type
        let sampleBuffer = buffer.sampleBuffer
//        guard let sampleBuffer = buffer.sampleBuffer else {
//            Log.error("\(type) sample buffer is nil", chunkIndex: chunkIndex)
//            return
//        }
        
        let isFirstSampleBufferOfType = hasAnySampleBufferOf[type] != true
        hasAnySampleBufferOf[type] = true
        
        if type != .mic,
           isFirstSampleBufferOfType,
           let lastSampleBuffer = lastSampleBuffers[type],
           let startTime = startTime,
           let additionalSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(
            from: lastSampleBuffer.sampleBuffer,
            at: startTime
           )
        {
            if (sampleBuffer.presentationTimeStamp != startTime) {
                debugLog("writing as first \(type) time: \(lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds) at \(startTime.seconds)")
                appendSampleBuffer(SampleBufferData(type: type, sampleBuffer: additionalSampleBuffer), lastSampleBuffers: lastSampleBuffers, debugString: "initialOf_\(type)")
            } else {
                debugLog("writing SKIPPED as first \(type) time: \(lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds) at \(startTime.seconds)")
            }
        }
        
        
        switch type {
            case .screen:
                lastScreenSampleBuffer = sampleBuffer
            case .systemAudio: break
//                if _firstSystemAudioSampleBufferAt == nil {
//                    _firstSystemAudioSampleBufferAt = timestamp
//                }
//                _lastSystemAudioSampleBufferAt = timestamp
//                _lastSystemAudioSampleBufferDuration = sampleBuffer.duration
            case .mic: break
//                if _firstMicSampleBufferAt == nil {
//                    _firstMicSampleBufferAt = timestamp
//                }
//                _lastMicSampleBufferAt = timestamp
//                _lastMicSampleBufferDuration = sampleBuffer.duration
        }
        
        guard let assetWriterInput = readyInput(forType: type, sampleBuffer: sampleBuffer) else {
            pendingBuffers.append(buffer)
            return
        }
        
        if status == .finalizing {
            debugLog("appending to finalizing chunk \(type) at \(sampleBuffer.presentationTimeStamp.seconds) endAt \(endTime?.seconds ?? 0) diff \(CMClock.hostTimeClock.time.seconds - sampleBuffer.presentationTimeStamp.seconds)")
        }
        
        if type == .screen {
            debugLog("processing buffer \(type) at \(sampleBuffer.presentationTimeStamp.seconds) \(debugInfo) \(debugString)")
        }
        
        assetWriterInput.append(sampleBuffer)
        
        tryWritePendingBuffers()
    }
    
    private func readyInput(forType type: ScreenRecorderSourceType, sampleBuffer: CMSampleBuffer) -> AVAssetWriterInput? {
        guard let writer = writer else {
            debugLog("no writer found \(type) at \(sampleBuffer.presentationTimeStamp.seconds)")
            return nil
        }
        
        let assetWriterInput = switch type {
            case .systemAudio: writer.systemAudioWriterInput
            case .screen: writer.videoWriterInput
            case .mic: writer.micWriterInput
        }
        
        guard let assetWriterInput = assetWriterInput else {
            Log.error("no AssetWriterInput for \(type) at \(sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
            return nil
        }
        
        guard assetWriterInput.isReadyForMoreMediaData else {
            debugLog("assetWriter is not ready for \(type) value: \(assetWriterInput.isReadyForMoreMediaData) time: \(sampleBuffer.presentationTimeStamp.seconds)")
            return nil
        }
        
        return assetWriterInput
    }
    
    private func tryWritePendingBuffers() {
        while !pendingBuffers.isEmpty,
              let pending = pendingBuffers.first {
              
            guard let assetWriterInput = readyInput(forType: pending.type, sampleBuffer: pending.sampleBuffer) else {
                debugLog("Failed to append buffer of \(pending.type) time: \(pending.sampleBuffer.presentationTimeStamp.seconds)")
                break
            }
            
            debugLog("Appending buffer of \(pending.type) time: \(pending.sampleBuffer.presentationTimeStamp.seconds)")
            assetWriterInput.append(pending.sampleBuffer)
            pendingBuffers.removeFirst()
        }
    }
    
    private func calcCurrentFileSize() -> Int {
        return (try? outputScreenChunkURL?.fileSize()) ?? 0
    }
}

extension URL {
    func fileSize() throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        return attributes[.size] as? Int ?? 0
    }
}
