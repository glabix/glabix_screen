//
//  VideoInput.swift
//  iosApp
//
//  Created by Pavel Feklistov on 18.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import ScreenCaptureKit

struct VideoInput {
    let screenConfigurator: ScreenConfigurator
    let recordConfiguration: RecordConfiguration
    
    func build() throws -> AVAssetWriterInput {
        let recordResolution = recordConfiguration.recordResolution
        let recordMode = recordResolution.recordMode
        
        // AVAssetWriterInput supports maximum resolution of 4096x2304 for H.264
        // Downsize to fit a larger display back into in 4K
        let videoSize = downsizedVideoSize(
            source: recordConfiguration.cropRect?.size ?? screenConfigurator.displaySize,
            scaleFactor: screenConfigurator.displayScaleFactor,
            resolution: recordResolution
        )
        
        // Use the preset as large as possible, size will be reduced to screen size by computed videoSize
        guard let assistant = AVOutputSettingsAssistant(preset: recordMode.preset) else {
            throw RecordingError("Can't create AVOutputSettingsAssistant")
        }
        assistant.sourceVideoFormat = try CMVideoFormatDescription(videoCodecType: recordMode.videoCodecType, width: videoSize.width, height: videoSize.height)
        
        guard var outputSettings = assistant.videoSettings else {
            throw RecordingError("AVOutputSettingsAssistant has no videoSettings")
        }
        outputSettings[AVVideoWidthKey] = videoSize.width
        outputSettings[AVVideoHeightKey] = videoSize.height
        
        // Configure video color properties and compression properties based on RecordMode
        // See AVVideoSettings.h and VTCompressionProperties.h
        outputSettings[AVVideoColorPropertiesKey] = recordMode.videoColorProperties
        if let videoProfileLevel = recordMode.videoProfileLevel {
            var compressionProperties: [String: Any] = outputSettings[AVVideoCompressionPropertiesKey] as? [String: Any] ?? [:]
            compressionProperties[AVVideoProfileLevelKey] = videoProfileLevel
            outputSettings[AVVideoCompressionPropertiesKey] = compressionProperties as NSDictionary
        }
        
        // Create AVAssetWriter input for video, based on the output settings from the Assistant
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
        videoInput.expectsMediaDataInRealTime = true
        return videoInput
    }
    
    private func downsizedVideoSize(source: CGSize, scaleFactor: Int, resolution: RecordResolution) -> (width: Int, height: Int) {
        let maxSize = resolution.maxSize
        let w = source.width * Double(scaleFactor)
        let h = source.height * Double(scaleFactor)
        let r = max(w / maxSize.width, h / maxSize.height)
        
        return r > 1
        ? (width: Int(w / r), height: Int(h / r))
        : (width: Int(w), height: Int(h))
    }
}
