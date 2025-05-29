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
        //        var micSettings: [String : Any] = [AVSampleRateKey : rate, AVNumberOfChannelsKey : 2] // reset audioSettings
        //        if ScreenRecorder.isSegmented {
        //            //            micSettings[AVFormatIDKey] = kAudioFormatMPEG4AAC
        //            micSettings = [
        //                AVFormatIDKey: kAudioFormatMPEG4AAC,
        //                // For simplicity, hard-code a common sample rate.
        //                // For a production use case, modify this as necessary to get the desired results given the source content.
        //                AVSampleRateKey: 44_100,
        //                AVNumberOfChannelsKey: 2,
        //                AVEncoderBitRateKey: 160_000
        //            ]
        //        } else {
        //            micSettings[AVFormatIDKey] = kAudioFormatOpus
        //            var bitRate = InputSettings().audioQuality.rawValue * 1000
        //            if rate < 44100 { bitRate = min(64000, bitRate / 2) }
        //            micSettings[AVEncoderBitRateKey] = bitRate
        //        }
        
        let micSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVNumberOfChannelsKey: 2,
            AVSampleRateKey: 48_000.0,
            AVEncoderBitRateKey: 192000
//            AVSampleRateKey: 44_100.0,
//            AVEncoderBitRateKey: 128_000
        ]
        
        let micInput = AVAssetWriterInput(mediaType: .audio, outputSettings: micSettings)
        micInput.expectsMediaDataInRealTime = true
        return micInput
    }
}
