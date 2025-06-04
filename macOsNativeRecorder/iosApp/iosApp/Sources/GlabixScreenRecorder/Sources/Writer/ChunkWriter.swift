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

final class ChunkWriter {
    private var writer: ScreenWriter?
    var startTime: CMTime?
    var endTime: CMTime?
    let chunkIndex: Int
    
    var outputDirectoryURL: URL?
    private var lastScreenSampleBuffer: CMSampleBuffer?
//    var _firstMicSampleBufferAt: CMTime?
//    var _firstSystemAudioSampleBufferAt: CMTime?
//    var _lastMicSampleBufferAt: CMTime?
//    var _lastMicSampleBufferDuration: CMTime?
//    var _lastSystemAudioSampleBufferAt: CMTime?
//    var _lastSystemAudioSampleBufferDuration: CMTime?
    private var hasAnySampleBufferOf: [ScreenRecorderSourceType: Bool] = [:]
    
    private var status: ChunkWriterStatus = .active
    
    private let tempScreenChunkURL: URL?
    private let tempMicChunkURL: URL?
    private let fileManager = FileManager.default
    
    var isActive: Bool { writer != nil && status == .active }
    var debugStatus: ChunkWriterStatus { status }
    var isActiveOrFinalizing: Bool { writer != nil && (status == .active || status == .finalizing) }
    var isNotCancelled: Bool { status != .cancelled && status != .cancelling }
    var debugInfo: String {
        [
            "(\(chunkIndex))",
            "endTime: \(endTime?.seconds ?? 0)",
            "writer?: \(writer != nil)",
            "stetus: \(status)",
            "lastScreenAt: \(lastScreenSampleBuffer?.presentationTimeStamp.seconds ?? 0)"
        ]
            .map(\.description)
            .joined(separator: " ")
    }
    
    private let chunkDuration: CMTime
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        tempDirectoryURL: URL?,
        outputDirectoryURL: URL?,
        captureMicrophone: Bool,
        index: Int,
        startTime: CMTime?
    ) {
        self.outputDirectoryURL = outputDirectoryURL
        let urlBuilder = ChunkURLBuilder(chunkIndex: index, dirURL: tempDirectoryURL)
        let chunkDuration = CMTime(seconds: Double(recordConfiguration.chunkDurationSeconds), preferredTimescale: 1)
        self.chunkDuration = chunkDuration
        tempScreenChunkURL = urlBuilder.screenURL
        tempMicChunkURL = if captureMicrophone {
            urlBuilder.micURL
        } else { nil }
        
        self.writer = try? ScreenWriter(
            screenOutputURL: tempScreenChunkURL,
            micOutputURL: tempMicChunkURL,
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
            chunkIndex: index
        )
        
        self.chunkIndex = index
        
        removeOutputFiles()
        
        startAt(startTime)
    }
    
    func startAt(_ startTime: CMTime?) {
        guard let startTime = startTime else { return }
        self.startTime = startTime
        self.endTime = startTime + chunkDuration
        Log.info("before session start", Log.nowString, chunkIndex: chunkIndex)
        writer?.startSession(atSourceTime: startTime)
        Log.info("after session start", Log.nowString, chunkIndex: chunkIndex)
    }
    
    func updateStatusOnFinalizeOrCancel(endTime: CMTime) {
        Log.print("(\(chunkIndex)) updateStatusOnFinalizeOrCancel at \(endTime.seconds)", Log.nowString)
        guard let startTime = startTime else { return }
        
        self.endTime = endTime
        
        if startTime > endTime {
            status = .cancelling
        } else {
            status = .finalizing
        }
    }
    
    func finalizeOrCancelWithDelay(endTime: CMTime, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) async {
        Log.print("(\(chunkIndex)) finalizeOrCancelWithDelay at \(endTime.seconds)", Log.nowString)
        guard let startTime = startTime else { return }
        
//        guard status == .active else { return }
        if startTime > endTime {
            status = .cancelling
        } else {
            status = .finalizing
            self.endTime = endTime
            
            try? await Task.sleep(for: .seconds(0.3))
        }
        
        await finalizeOrCancel(endTime: endTime, lastSampleBuffers: lastSampleBuffers)
    }
    
    private func finalizeOrCancel(endTime: CMTime, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) async {
        guard let startTime = startTime else { return }
        
        if startTime > endTime {
            await cancel()
        } else {
            await finalize(endTime: endTime, lastSampleBuffers: lastSampleBuffers)
        }
    }
    
    private func finalize(endTime: CMTime, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) async {
        status = .finalized
        self.endTime = endTime
        
        Log.print("chunk writer finalized #\(chunkIndex) at \(endTime.seconds) glob \(lastSampleBuffers[.screen]?.chunkIndex) \(lastSampleBuffers[.screen]?.sampleBuffer.presentationTimeStamp.seconds) \(lastScreenSampleBuffer?.presentationTimeStamp.seconds) \(Log.nowString)", chunkIndex: chunkIndex)
        if let lastSampleBuffer = lastScreenSampleBuffer ?? lastSampleBuffers[.screen]?.sampleBuffer {
//            if lastScreenSampleBuffer == nil,
//               let startTime = startTime,
//               let firstSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(from: lastSampleBuffer, at: startTime)
//            {
//                if firstSampleBuffer.presentationTimeStamp != lastSampleBuffer.presentationTimeStamp {
//                    appendSampleBuffer(firstSampleBuffer, type: .screen)
//                    Log.info("@@@@@@ writing as first screen SINGLE", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "first at", firstSampleBuffer.presentationTimeStamp.seconds, Log.nowString, chunkIndex: chunkIndex)
//                } else {
//                    Log.info("@@@@@@ writing SKIPPED as first screen SINGLE", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "first at", firstSampleBuffer.presentationTimeStamp.seconds, Log.nowString, chunkIndex: chunkIndex)
//                }
//            }
            
            if let finalSampleBuffer = SampleBufferBuilder.buildAdditionalSampleBuffer(from: lastSampleBuffer, at: endTime) {
                if finalSampleBuffer.presentationTimeStamp != lastSampleBuffer.presentationTimeStamp {
                    appendSampleBuffer(finalSampleBuffer, type: .screen, lastSampleBuffers: lastSampleBuffers)
                    Log.print("writing as last screen time:", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "final at", finalSampleBuffer.presentationTimeStamp.seconds, Log.nowString, chunkIndex: chunkIndex)
                } else {
                    Log.warn("writing SKIPPED as last screen time:", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "final at", finalSampleBuffer.presentationTimeStamp.seconds, Log.nowString, chunkIndex: chunkIndex)
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
        
        
        await writer?.finalize(endTime: endTime)
        writer = nil
        self.lastScreenSampleBuffer = nil
        
        let outputURLBuilder = ChunkURLBuilder(chunkIndex: chunkIndex, dirURL: outputDirectoryURL)
        let outputScreenChunkURL = outputURLBuilder.screenURL
        if let atURL = tempScreenChunkURL, let toURL = outputScreenChunkURL {
            do {
                try fileManager.moveItem(at: atURL, to: toURL)
            } catch {
                Log.error("can't move output screen chunk file to \(outputDirectoryURL)")
            }
        }
        
        let outputMicChunkURL = outputURLBuilder.micURL
        if let atURL = tempMicChunkURL, let toURL = outputMicChunkURL {
            do {
                try fileManager.moveItem(at: atURL, to: toURL)
            } catch {
                Log.error("can't move output mic chunk file to \(outputDirectoryURL)")
            }
        }
        
        Callback.print(Callback.ChunkFinalized(
            index: chunkIndex,
            screenFile: outputScreenChunkURL.map {
                Callback.ChunkFile(path: $0.path(), size: calculateFileSize($0))
            },
            micFile: outputMicChunkURL.map {
                Callback.ChunkFile(path: $0.path(), size: calculateFileSize($0))
            }
        ))
    }
    
    private func cancel() async {
        guard let endTime = endTime else { return }
        status = .cancelled
        
        await writer?.finalize(endTime: endTime)
        writer = nil
        lastScreenSampleBuffer = nil
        
        removeOutputFiles()
        Log.print("chunk writer cancelled #\(chunkIndex) at \(endTime.seconds) \(Log.nowString)")
    }
    
    private func removeOutputFiles() {
        if let screenChunkURL = tempScreenChunkURL, fileManager.fileExists(atPath: screenChunkURL.path()) {
            do {
                try fileManager.removeItem(at: screenChunkURL)
            } catch {
                Log.error("can not remove file at \(screenChunkURL.path())", error)
            }
        }
        
        if let micChunkURL = tempMicChunkURL, fileManager.fileExists(atPath: micChunkURL.path()) {
            do {
                try fileManager.removeItem(at: micChunkURL)
            } catch {
                Log.error("can not remove file at \(micChunkURL.path())", error)
            }
        }
    }
    
    func appendSampleBuffer(_ sampleBuffer: CMSampleBuffer?, type: ScreenRecorderSourceType, lastSampleBuffers: [ScreenRecorderSourceType: LastSampleBuffer]) {
//        let timestamp = sampleBuffer?.presentationTimeStamp
        guard let sampleBuffer = sampleBuffer else {
            Log.error("\(type) sample buffer is nil", chunkIndex: chunkIndex)
            return
        }
        
        guard let writer = writer else {
            Log.error("no writer found \(type)", chunkIndex: chunkIndex)
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
        
        let assetWriterInput = switch type {
            case .systemAudio: writer.systemAudioWriterInput
            case .screen: writer.videoWriterInput
            case .mic: writer.micWriterInput
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
        
//        if type == .systemAudio {
//            Log.print("\(type) buffer at \(sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
//        }
        
        guard let assetWriterInput = assetWriterInput, assetWriterInput.isReadyForMoreMediaData else {
            Log.error("no input or not ready for \(type)", "isReady", assetWriterInput?.isReadyForMoreMediaData ?? "no AssetWriterInput at \(sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
            return
        }
        
        if status == .finalizing {
//            Log.print("appending to finalizing chunk \(type) at \(timestamp?.seconds ?? 0) endAt \(endTime?.seconds ?? 0) diff \(CMClock.hostTimeClock.time.seconds - sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
        }
        
        assetWriterInput.append(sampleBuffer)
    }
    
    func calculateFileSize(_ url: URL) -> Int? {
        try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
    }
}
