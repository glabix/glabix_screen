//
//  AudioMixer.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

class AudioMixer {
    private let engine = AVAudioEngine()
    private let systemAudioNode = AVAudioPlayerNode()
    private let mixerNode = AVAudioMixerNode()
    private var assetWriter: AVAssetWriter?
    private var audioInput: AVAssetWriterInput?
    
    init() {
        setupAudioEngine()
    }
    
    private func setupAudioEngine() {
        // Attach nodes
        engine.attach(systemAudioNode)
        engine.attach(mixerNode)
        
        // Connect nodes
        engine.connect(systemAudioNode, to: mixerNode, format: nil)
        engine.connect(engine.inputNode, to: mixerNode, format: nil)
        engine.connect(mixerNode, to: engine.mainMixerNode, format: nil)
        
        // Install tap on mixed output
        let outputFormat = engine.mainMixerNode.outputFormat(forBus: 0)
        mixerNode.installTap(
            onBus: 0,
            bufferSize: 1024,
            format: outputFormat
        ) { [weak self] buffer, when in
            self?.handleMixedAudio(buffer, presentationTime: when)
        }
        
        try? engine.start()
    }
}

extension AudioMixer {
    func processSystemAudio(_ sampleBuffer: CMSampleBuffer) {
        guard let pcmBuffer = convertToPCM(sampleBuffer) else { return }
        
        systemAudioNode.scheduleBuffer(
            pcmBuffer,
            at: nil,
            options: .interruptsAtLoop
        )
        
        if !systemAudioNode.isPlaying {
            systemAudioNode.play()
        }
    }
    
    private func convertToPCM(_ sample: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard let formatDescription = sample.formatDescription else { return nil }
        let format = AVAudioFormat(cmAudioFormatDescription: formatDescription)
        guard let pcmBuffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(sample.numSamples)
              )
        else { return nil }
        
        CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sample,
            at: 0,
            frameCount: Int32(sample.numSamples),
            into: pcmBuffer.mutableAudioBufferList
        )
        
        return pcmBuffer
    }
}

extension AudioMixer {
    func setupMicrophoneInput() {
        let inputFormat = engine.inputNode.inputFormat(forBus: 0)
        
        debugPrint("format", inputFormat)
        debugPrint("chans", inputFormat.channelCount)
        
        engine.inputNode.installTap(
            onBus: 0,
            bufferSize: 1024,
            format: inputFormat
        ) { [weak self] buffer, when in
            self?.mixerNode.volume = 1.0 // Route to mixer
        }
    }
}

extension AudioMixer {
    private func handleMixedAudio(_ buffer: AVAudioPCMBuffer, presentationTime: AVAudioTime) {
        guard let writer = assetWriter,
              writer.status == .writing,
              audioInput?.isReadyForMoreMediaData == true
        else { return }
        
        let sampleBuffer = convertToCMSampleBuffer(
            pcmBuffer: buffer,
            presentationTime: presentationTime
        )
        
        audioInput?.append(sampleBuffer)
    }
    
    private func convertToCMSampleBuffer(
        pcmBuffer: AVAudioPCMBuffer,
        presentationTime: AVAudioTime
    ) -> CMSampleBuffer {
        var format: CMFormatDescription?
        CMAudioFormatDescriptionCreate(
            allocator: kCFAllocatorDefault,
            asbd: pcmBuffer.format.streamDescription,
            layoutSize: 0,
            layout: nil,
            magicCookieSize: 0,
            magicCookie: nil,
            extensions: nil,
            formatDescriptionOut: &format
        )
        
        var sampleBuffer: CMSampleBuffer?
        CMSampleBufferCreate(
            allocator: kCFAllocatorDefault,
            dataBuffer: nil,
            dataReady: false,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: format,
            sampleCount: CMItemCount(pcmBuffer.frameLength),
            sampleTimingEntryCount: 0,
            sampleTimingArray: nil,
            sampleSizeEntryCount: 0,
            sampleSizeArray: nil,
            sampleBufferOut: &sampleBuffer
        )
        
        CMSampleBufferSetDataBufferFromAudioBufferList(
            sampleBuffer!,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: 0,
            bufferList: pcmBuffer.audioBufferList
        )
        
        return sampleBuffer!
    }
}
