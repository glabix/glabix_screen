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
}

final class ChunkWriter {
    private var writer: ScreenWriter?
    var startTime: CMTime?
    var endTime: CMTime?
    let chunkIndex: Int
    
    private var status: ChunkWriterStatus = .active
    
    private let screenChunkURL: URL?
    private let micChunkURL: URL?
    private let fileManager = FileManager.default
    
    var isActive: Bool { writer != nil && status == .active }
    var debugStatus: ChunkWriterStatus { status }
    var isActiveOrFinalizing: Bool { writer != nil && (status == .active || status == .finalizing) }
    var isNotCancelled: Bool { status != .cancelled && status != .cancelling }
    var debugInfo: [Any] {
        [chunkIndex, endTime?.seconds ?? 0, "hasWr?", writer != nil, "s:", status]
    }
    
    private static let chunkDuration: CMTime = CMTime(seconds: 2, preferredTimescale: 1)
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        outputDir: URL?,
        captureMicrophone: Bool,
        index: Int,
        startTime: CMTime?
    ) {
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
        self.endTime = startTime.map { $0 + ChunkWriter.chunkDuration }
        self.chunkIndex = index
        
        removeOutputFiles()
        
        if let startTime = startTime {
            writer?.startSession(atSourceTime: startTime)
        }
    }
    
    func startAt(_ startTime: CMTime) {
        self.startTime = startTime
        self.endTime = startTime + ChunkWriter.chunkDuration
        writer?.startSession(atSourceTime: startTime)
    }
    
    func updateStatusOnFinalizeOrCancel(endTime: CMTime) {
        guard let startTime = startTime else { return }
        
        self.endTime = endTime
        
        if startTime > endTime {
            status = .cancelling
        } else {
            status = .finalizing
        }
    }
    
    func finalizeOrCancelWithDelay(endTime: CMTime) async {
        guard let startTime = startTime else { return }
        
//        guard status == .active else { return }
        if startTime > endTime {
            status = .cancelling
        } else {
            status = .finalizing
            try? await Task.sleep(for: .seconds(0.5))
        }
        
        await finalizeOrCancel(endTime: endTime)
    }
    
    func finalizeOrCancel(endTime: CMTime) async {
        guard let startTime = startTime else { return }
        
        if startTime > endTime {
            await cancel()
        } else {
            await finalize(endTime: endTime)
        }
    }
    
    private func finalize(endTime: CMTime) async {
        status = .finalized
        self.endTime = endTime
        
        await writer?.finalize(endTime: endTime)
        writer = nil
        
        ScreenRecorderService.printCallback("chunk writer finalized #\(chunkIndex) at \(endTime.seconds)")
        Callback.print(Callback.ChunkFinalized(index: chunkIndex))
    }
    
    private func cancel() async {
        guard let endTime = endTime else { return }
        status = .cancelled
        
        await writer?.finalize(endTime: endTime)
        writer = nil
        
        removeOutputFiles()
        ScreenRecorderService.printCallback("chunk writer cancelled #\(chunkIndex) at \(endTime.seconds)")
    }
    
    private func removeOutputFiles() {
        try? screenChunkURL.map { try fileManager.removeItem(at: $0) }
        try? micChunkURL.map { try fileManager.removeItem(at: $0) }
    }
    
    func appendSampleBuffer(_ sampleBuffer: CMSampleBuffer?, type: ScreenRecorderSourceType) {
        guard let sampleBuffer = sampleBuffer else {
            debugPrint("(\(chunkIndex)) \(type) sample buffer is nil")
            return
        }
        
        guard let writer = writer else {
            debugPrint("(\(chunkIndex)) no writer found \(type)")
            return
        }
        
        let assetWriterInput = switch type {
            case .systemAudio: writer.systemAudioWriterInput
            case .screen: writer.videoWriterInput
            case .mic: writer.micWriterInput
        }
        
        guard let assetWriterInput = assetWriterInput, assetWriterInput.isReadyForMoreMediaData else {
            debugPrint("(\(chunkIndex)) no input or not ready for \(type)", "isReady", assetWriterInput?.isReadyForMoreMediaData ?? "no AssetWriterInput at \(sampleBuffer.presentationTimeStamp.seconds)")
            return
        }
        
        assetWriterInput.append(sampleBuffer)
    }
}
