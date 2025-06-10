//
//  MicInput.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

struct MicInput {
    static func build() throws -> AVAssetWriterInput {
        let micSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVNumberOfChannelsKey: 2,
            AVSampleRateKey: 48_000.0,
            AVEncoderBitRateKey: 192000
        ]
        
        let micInput = AVAssetWriterInput(mediaType: .audio, outputSettings: micSettings)
        micInput.expectsMediaDataInRealTime = true
        return micInput
    }
}
