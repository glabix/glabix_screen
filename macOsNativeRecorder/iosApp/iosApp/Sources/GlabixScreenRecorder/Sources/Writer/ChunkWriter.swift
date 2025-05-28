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

final class ChunkWriter {
    private var writer: ScreenWriter?
    var startTime: CMTime?
    var endTime: CMTime?
    let chunkIndex: Int
    var lastScreenSampleBuffer: CMSampleBuffer?
    private var hasAnySampleBufferOf: [ScreenRecorderSourceType: Bool] = [:]
    
    private var status: ChunkWriterStatus = .active
    
    private let screenChunkURL: URL?
    private let micChunkURL: URL?
    private let fileManager = FileManager.default
    
    var isActive: Bool { writer != nil && status == .active }
    var debugStatus: ChunkWriterStatus { status }
    var isActiveOrFinalizing: Bool { writer != nil && (status == .active || status == .finalizing) }
    var isNotCancelled: Bool { status != .cancelled && status != .cancelling }
    var debugInfo: String {
        [
            "(\(chunkIndex))",
            "endTime: \(endTime?.seconds ?? 0)",
            "hasWr?: \(writer != nil)",
            "s: \(status)",
            "buf: \(lastScreenSampleBuffer?.presentationTimeStamp.seconds ?? 0)"
        ]
            .map(\.description)
            .joined(separator: " ")
    }
    
    private let chunkDuration: CMTime
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        outputDir: URL?,
        captureMicrophone: Bool,
        index: Int,
        startTime: CMTime?
    ) {
        let chunkDuration = CMTime(seconds: Double(recordConfiguration.chunkDurationSeconds), preferredTimescale: 1)
        self.chunkDuration = chunkDuration
        screenChunkURL = outputDir?.appendingPathComponent("chunk_\(index).mp4")
        micChunkURL = if captureMicrophone {
            outputDir?.appendingPathComponent("chunk_\(index).m4a")
        } else { nil }
        
        self.writer = try? ScreenWriter(
            outputURL: screenChunkURL,
            micOutputURL: micChunkURL,
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
            chunkIndex: index
        )
        
        self.startTime = startTime
        self.endTime = startTime.map { $0 + chunkDuration }
        self.chunkIndex = index
        
        removeOutputFiles()
        
        if let startTime = startTime {
            writer?.startSession(atSourceTime: startTime)
        }
    }
    
    func startAt(_ startTime: CMTime) {
        self.startTime = startTime
        self.endTime = startTime + chunkDuration
        writer?.startSession(atSourceTime: startTime)
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
            
            try? await Task.sleep(for: .seconds(0.5))
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
                    Log.info("@@@@@@ writing as last screen", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "final at", finalSampleBuffer.presentationTimeStamp.seconds, Log.nowString, chunkIndex: chunkIndex)
                } else {
                    Log.warn("@@@@@@ writing SKIPPED as last screen", lastSampleBuffer.presentationTimeStamp.seconds, "endtime", endTime.seconds, "final at", finalSampleBuffer.presentationTimeStamp.seconds, Log.nowString, chunkIndex: chunkIndex)
                }
            }
        }
        
        
        await writer?.finalize(endTime: endTime)
        writer = nil
        self.lastScreenSampleBuffer = nil
        
        Callback.print(Callback.ChunkFinalized(index: chunkIndex))
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
        if let screenChunkURL = screenChunkURL, fileManager.fileExists(atPath: screenChunkURL.path()) {
            do {
                try fileManager.removeItem(at: screenChunkURL)
            } catch {
                Log.error("can not remove file at \(screenChunkURL.path())", error)
            }
        }
        
        if let micChunkURL = micChunkURL, fileManager.fileExists(atPath: micChunkURL.path()) {
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
                Log.info("(\(chunkIndex)) @@@@@@ writing as first \(type) ", lastSampleBuffer.sampleBuffer.presentationTimeStamp.seconds, "at", startTime.seconds, Log.nowString)
                appendSampleBuffer(additionalSampleBuffer, type: type, lastSampleBuffers: lastSampleBuffers)
            } else {
                Log.warn("(\(chunkIndex)) @@@@@@ writing SKIPPED as first \(type) ", sampleBuffer.presentationTimeStamp.seconds, "at", startTime.seconds, Log.nowString)
            }
        }
        
        let assetWriterInput = switch type {
            case .systemAudio: writer.systemAudioWriterInput
            case .screen: writer.videoWriterInput
            case .mic: writer.micWriterInput
        }
        
        if type == .screen {
            lastScreenSampleBuffer = sampleBuffer
//            Log.print("screen buffer at \(sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
        }
        
        guard let assetWriterInput = assetWriterInput, assetWriterInput.isReadyForMoreMediaData else {
            Log.error("no input or not ready for \(type)", "isReady", assetWriterInput?.isReadyForMoreMediaData ?? "no AssetWriterInput at \(sampleBuffer.presentationTimeStamp.seconds)", chunkIndex: chunkIndex)
            return
        }
        
        if status == .finalizing {
            Log.print("appending to finalizing chunk \(type) at \(sampleBuffer.presentationTimeStamp.seconds) endAt \(endTime?.seconds ?? 0)", chunkIndex: chunkIndex)
        }
        
        assetWriterInput.append(sampleBuffer)
    }
}
