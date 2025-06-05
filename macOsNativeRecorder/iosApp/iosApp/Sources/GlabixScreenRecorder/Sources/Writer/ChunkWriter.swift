//
//  ChunkWriter.swift
//  iosApp
//
//  Created by Pavel Feklistov on 14.05.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

enum ChunkWriterStatus {
    case active
    case cancelling
    case cancelled
    case finalizing
    case finalized
    
    var description: String {
        switch self {
            case .active:
                "active"
            case .cancelling:
                "cancelling"
            case .cancelled:
                "cancelled"
            case .finalizing:
                "finalizing"
            case .finalized:
                "finalized"
        }
    }
}

private struct ChunkURLBuilder {
    let chunkIndex: Int
    let dirURL: URL?
    
    var screenURL: URL? {
        dirURL?.appendingPathComponent("chunk_\(chunkIndex).mp4")
    }
    
    var micURL: URL? {
        dirURL?.appendingPathComponent("chunk_\(chunkIndex).m4a")
    }
}

struct PendingBuffer {
    let type: ScreenRecorderSourceType
    let sampleBuffer: CMSampleBuffer
}

final class ChunkWriter {
    private var writer: ScreenWriter?
    var startTime: CMTime?
    var endTime: CMTime?
    let chunkIndex: Int
    
    private var lastScreenSampleBuffer: CMSampleBuffer?
//    var _firstMicSampleBufferAt: CMTime?
//    var _firstSystemAudioSampleBufferAt: CMTime?
//    var _lastMicSampleBufferAt: CMTime?
//    var _lastMicSampleBufferDuration: CMTime?
//    var _lastSystemAudioSampleBufferAt: CMTime?
//    var _lastSystemAudioSampleBufferDuration: CMTime?
    private var hasAnySampleBufferOf: [ScreenRecorderSourceType: Bool] = [:]
    private var pendingBuffers: [PendingBuffer] = []

    private var status: ChunkWriterStatus = .active
    
    private let outputScreenChunkURL: URL?
    private let outputMicChunkURL: URL?
    private let fileManager = FileManager.default
    
    var isActive: Bool { writer != nil && status == .active }
    var isActiveOrFinalizing: Bool { writer != nil && (status == .active || status == .finalizing) }
    var isNotCancelled: Bool { status != .cancelled && status != .cancelling }
    var debugStatus: ChunkWriterStatus { status }
    var debugInfo: String {
        [
            "(\(chunkIndex))",
            "time: \(startTime?.seconds ?? -1)-\(endTime?.seconds ?? -1)",
            "writer?: \(writer != nil)",
            "stetus: \(status)",
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
        let outputDirectoryURL = recordConfiguration.outputDirectoryURL
        let urlBuilder = ChunkURLBuilder(chunkIndex: index, dirURL: outputDirectoryURL)
        
        outputScreenChunkURL = urlBuilder.screenURL
        outputMicChunkURL = if captureMicrophone {
            urlBuilder.micURL
        } else { nil }
        
        do {
            self.writer = try ScreenWriter(
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
        
        removeOutputFiles()
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
    
    func updateStatusOnFinalizeOrCancel(endTime: CMTime) {
        Log.print("(\(chunkIndex)) updateStatusOnFinalizeOrCancel at \(endTime.seconds)", Log.nowString)
        
        self.endTime = endTime
        
        if shouldCancel(atEndTime: endTime) {
            status = .cancelling
        } else {
            status = .finalizing
        }
    }
    
    func finalizeOrCancelWithDelay(endTime: CMTime, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) async {
        Log.print("(\(chunkIndex)) finalizeOrCancelWithDelay at \(endTime.seconds)", Log.nowString)
        
        if shouldCancel(atEndTime: endTime) {
            status = .cancelling
        } else {
            status = .finalizing
            self.endTime = endTime
            
            try? await Task.sleep(for: .seconds(0.3))
        }
        
        await finalizeOrCancel(endTime: endTime, lastSampleBuffers: lastSampleBuffers)
    }
    
    private func finalizeOrCancel(endTime: CMTime, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) async {
        if shouldCancel(atEndTime: endTime) {
            await cancel()
        } else {
            await finalize(endTime: endTime, lastSampleBuffers: lastSampleBuffers)
        }
    }
    
    private func finalize(endTime: CMTime, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) async {
        status = .finalized
        self.endTime = endTime
        
        Log.print("chunk writer finalized pending \(pendingBuffers.count) at \(endTime.seconds) glob \(lastSampleBuffers[.screen]?.chunkIndex) \(lastSampleBuffers[.screen]?.sampleBuffer.presentationTimeStamp.seconds) \(lastScreenSampleBuffer?.presentationTimeStamp.seconds ?? 0)", chunkIndex: chunkIndex)
        if let lastSampleBuffer = lastScreenSampleBuffer ?? lastSampleBuffers[.screen]?.sampleBuffer {
            if let finalSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(from: lastSampleBuffer, at: endTime) {
                if finalSampleBuffer.presentationTimeStamp != lastSampleBuffer.presentationTimeStamp {
                    appendSampleBuffer(finalSampleBuffer, type: .screen, lastSampleBuffers: lastSampleBuffers)
                    Log.print("writing as last screen time:", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "final at", finalSampleBuffer.presentationTimeStamp.seconds, chunkIndex: chunkIndex)
                } else {
                    Log.warn("writing SKIPPED as last screen time:", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "final at", finalSampleBuffer.presentationTimeStamp.seconds, chunkIndex: chunkIndex)
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
    
    private func removeOutputFiles() {
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
    
    func appendSampleBuffer(_ sampleBuffer: CMSampleBuffer?, type: ScreenRecorderSourceType, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) {
        guard let sampleBuffer = sampleBuffer else {
            Log.error("\(type) sample buffer is nil", chunkIndex: chunkIndex)
            return
        }
        
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
                Log.print("(\(chunkIndex)) writing as first \(type) time:", lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", startTime.seconds, Log.nowString)
                appendSampleBuffer(additionalSampleBuffer, type: type, lastSampleBuffers: lastSampleBuffers)
            } else {
                Log.warn("(\(chunkIndex)) writing SKIPPED as first \(type) time:", lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", startTime.seconds, Log.nowString)
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
            pendingBuffers.append(PendingBuffer(type: type, sampleBuffer: sampleBuffer))
            return
        }
        
//        if status == .finalizing {
//            Log.print("appending to finalizing chunk \(type) at \(timestamp?.seconds ?? 0) endAt \(endTime?.seconds ?? 0) diff \(CMClock.hostTimeClock.time.seconds - sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
//        }
        
//        Log.print("processing buffer \(type) at \(sampleBuffer.presentationTimeStamp.seconds) \(debugInfo)", chunkIndex: chunkIndex)
        
        assetWriterInput.append(sampleBuffer)
        
        tryWritePendingBuffers()
    }
    
    private func readyInput(forType type: ScreenRecorderSourceType, sampleBuffer: CMSampleBuffer) -> AVAssetWriterInput? {
        guard let writer = writer else {
            Log.error("no writer found \(type)", chunkIndex: chunkIndex)
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
            Log.error("assetWriter is not ready for \(type)", "value:", assetWriterInput.isReadyForMoreMediaData, chunkIndex: chunkIndex)
            return nil
        }
        
        return assetWriterInput
    }
    
    private func tryWritePendingBuffers() {
        while !pendingBuffers.isEmpty,
              let pending = pendingBuffers.first {
              
            guard let assetWriterInput = readyInput(forType: pending.type, sampleBuffer: pending.sampleBuffer) else {
                Log.warn("Failed to append buffer of \(pending.type)", chunkIndex: chunkIndex)
                break
            }
            
            Log.info("Appending buffer of \(pending.type)", chunkIndex: chunkIndex)
            assetWriterInput.append(pending.sampleBuffer)
            pendingBuffers.removeFirst()
        }
    }
    
    func calcCurrentFileSize() -> Int {
        return (try? outputScreenChunkURL?.fileSize()) ?? 0
    }
}

extension URL {
    func fileSize() throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        return attributes[.size] as? Int ?? 0
    }
}
