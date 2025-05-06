//
//  SystemAudioInput.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

struct SystemAudioInput {
    static func build() throws -> AVAssetWriterInput {
        //        var audioSettings: [String : Any] = [AVSampleRateKey : audioRate, AVNumberOfChannelsKey : 2] // reset audioSettings
        //        //        audioSettings[AVFormatIDKey] = kAudioFormatMPEG4AAC
        //        audioSettings[AVFormatIDKey] = kAudioFormatOpus
        //        //        var bitRate = InputSettings().audioQuality.rawValue * 1000
        //        //        if rate < 44100 { bitRate = min(64000, bitRate / 2) }
        //        //        audioSettings[AVEncoderBitRateKey] = bitRate
        
        let audioSettings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC,
                                    AVNumberOfChannelsKey: 2,
                                          AVSampleRateKey: 48_000.0,
                                          AVEncoderBitRateKey: 192000
//                                      AVEncoderBitRateKey: 128_000
        ]
        
        let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
        audioInput.expectsMediaDataInRealTime = true
        return audioInput
    }
}
