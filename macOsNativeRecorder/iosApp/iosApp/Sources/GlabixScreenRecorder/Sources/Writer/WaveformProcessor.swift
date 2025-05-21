//
//  WaveformProcessor.swift
//  iosApp
//
//  Created by Pavel Feklistov on 21.05.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

class WaveformProcessor: NSObject {
    let micOutput: AVCaptureAudioDataOutput
    
    private var amplitudes: [[Float]] = []
    private var lastSaveTime = Date()
    private let updateInterval: TimeInterval = 0.1 // 100ms интервалы
    private let queue = DispatchQueue(label: "com.glabix.screen.screenCapture.waveform")
    
    override init() {
        micOutput = AVCaptureAudioDataOutput()
        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM, // PCM формат
            AVSampleRateKey: 8000,                // Низкая частота дискретизации
            AVNumberOfChannelsKey: 1,             // Моно
            AVLinearPCMBitDepthKey: 16,           // Глубина 16 бит
            AVLinearPCMIsFloatKey: false,         // Целочисленный формат
            AVLinearPCMIsNonInterleaved: false    // Смешанный формат
        ]
        micOutput.audioSettings = audioSettings
        
        super.init()
        
        micOutput.setSampleBufferDelegate(self, queue: queue)
    }
    
    func process(_ sampleBuffer: CMSampleBuffer) {
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        let length = CMBlockBufferGetDataLength(blockBuffer)
        var data = [Int16](repeating: 0, count: length / MemoryLayout<Int16>.size)
        
        CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: &data)
        
        let frames = data.map { Float($0)/Float(Int16.max) }
        amplitudes.append(frames)
        
        Callback.print(Callback.MicrophoneWaveform(amplitudes: frames))
        
        let currentTime = Date()
        if currentTime.timeIntervalSince(lastSaveTime) >= updateInterval {
            amplitudes.removeAll()
            lastSaveTime = currentTime
        }
    }
}

extension WaveformProcessor: AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        process(sampleBuffer)
    }
}
