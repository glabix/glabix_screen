//
//  RecordConfiguration.swift
//  iosApp
//
//  Created by Pavel Feklistov on 21.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import ScreenCaptureKit

struct RecordConfiguration {
    private let config: Config
    
    var recordResolution: RecordResolution { config.resolution }
    var cropRect: CGRect? { config.cropRect.map { .init(x: $0.x, y: $0.y, width: $0.width, height: $0.height) } }
    var chunksDirectoryPath: String? { config.chunksDirectoryPath }
    var captureMicrophone: Bool { config.captureMicrophone }
    var chunkDurationSeconds: Int { config.chunkDurationSeconds }
    
    init(config: Config) {
        self.config = config
    }
    
    func screenCaptureConfig(screenConfigurator: ScreenConfigurator) -> SCStreamConfiguration {
        let configuration = SCStreamConfiguration()
        // Increase the depth of the frame queue to ensure high fps at the expense of increasing
        // the memory footprint of WindowServer.
        configuration.queueDepth = 6 // 4 minimum, or it becomes very stuttery
        configuration.capturesAudio = config.captureSystemAudio
        if #available(macOS 15.0, *) {
            configuration.captureMicrophone = false
        } else {
            // Fallback on earlier versions
        }
        
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(config.fps))
        configuration.showsCursor = config.showCursor
        
        //        configuration.captureMicrophone = true
        
        //        configuration.microphoneCaptureDeviceID = await MicInputManager().device()?.uniqueID
        //        configuration.microphoneCaptureDeviceID = AVCaptureDevice.default(for: .audio)?.uniqueID
        //        debugPrint("mic", MicInputDetector().device()?.uniqueID, "def", AVCaptureDevice.default(for: .audio)?.uniqueID, AVCaptureDevice.default(for: .audio)?.localizedName)
        
        let displayScaleFactor = screenConfigurator.displayScaleFactor
        let displaySize = screenConfigurator.displaySize
        
        // Make sure to take displayScaleFactor into account
        // otherwise, image is scaled up and gets blurry
        if let cropRect = cropRect {
            // ScreenCaptureKit uses top-left of screen as origin
            configuration.sourceRect = cropRect
            configuration.width = Int(cropRect.width) * displayScaleFactor
            configuration.height = Int(cropRect.height) * displayScaleFactor
        } else {
            configuration.width = Int(displaySize.width) * displayScaleFactor
            configuration.height = Int(displaySize.height) * displayScaleFactor
        }
        
        // Set pixel format an color space, see CVPixelBuffer.h
        switch config.resolution.recordMode {
            case .h264_sRGB:
                configuration.pixelFormat = kCVPixelFormatType_32BGRA // 'BGRA'
                configuration.colorSpaceName = CGColorSpace.sRGB
            case .hevc_displayP3:
                configuration.pixelFormat = kCVPixelFormatType_ARGB2101010LEPacked // 'l10r'
                configuration.colorSpaceName = CGColorSpace.displayP3
                //        case .hevc_displayP3_HDR:
                //            configuration.pixelFormat = kCVPixelFormatType_ARGB2101010LEPacked // 'l10r'
                //            configuration.colorSpaceName = CGColorSpace.displayP3
        }
        return configuration
    }
}
