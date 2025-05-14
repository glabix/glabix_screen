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

class ChunkWriter {
    var writer: ScreenWriter?
    let startTime: CMTime
    var endTime: CMTime
    let chunkIndex: Int
    
    var status: ChunkWriterStatus = .active
    
    private let screenChunkURL: URL?
    private let micChunkURL: URL?
    private let fileManager = FileManager.default
    private let queue = DispatchQueue(label: "com.glabix.screen.chunkWriter")
    
    var isActive: Bool { writer != nil && (status == .active) }
    var isActiveOrFinalizing: Bool { writer != nil && (status == .active || status == .finalizing) }
    var isNotCancelled: Bool { status != .cancelled && status != .cancelling }
    
    init(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration,
        outputDir: URL?,
        captureMicrophone: Bool,
        index: Int,
        startTime: CMTime,
        endTime: CMTime
    ) {
        screenChunkURL = outputDir?.appendingPathComponent("chunk_\(index).mp4")
        micChunkURL = if captureMicrophone {
            outputDir?.appendingPathComponent("chunk_\(index).m4a")
        } else { nil }
        
        self.writer = try? ScreenWriter(
            outputURL: screenChunkURL,
            micOutputURL: micChunkURL,
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration
        )
        
        self.startTime = startTime
        self.endTime = endTime
        self.chunkIndex = index
        
        removeOutputFiles()
        writer?.startSession(atSourceTime: startTime)
    }
    
    func asyncFinalizeOrCancel(endTime: CMTime) {
//        guard status == .active else { return }
        status = if self.startTime > endTime {
            .cancelling
        } else {
            .finalizing
        }
        queue.asyncAfter(deadline: .now() + 0.3) { [weak self] in // wait for next processed samples
            Task { [weak self] in
                debugPrint("(\(self?.chunkIndex ?? -1)) asyncFinalizePendingChunk", self?.status, "end", endTime.seconds, "endTime", endTime.seconds, "now:", CMClock.hostTimeClock.time.seconds)
                await self?.finalizeOrCancel(endTime: endTime)
            }
        }
    }
    
    func finalizeOrCancel(endTime: CMTime) async {
        if self.startTime > endTime {
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
    }
    
    private func cancel() async {
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
}
