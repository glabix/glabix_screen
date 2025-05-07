//
//  RecordResolution.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 04.05.2025.
//

import Foundation

enum RecordResolution: String, Codable {
    case fhd2k // 1920x1080
    case qhd // 2560x1440
    case qhdPlus // 3200x1800
    case uhd4k // 3840x2160
    case uhd5k // 5120x2880
    case uhd8k // 7680x4320
    
    var recordMode: RecordMode {
        return switch self {
            case .fhd2k, .qhd, .qhdPlus, .uhd4k: .h264_sRGB
//            case .uhd5k: .hevc_displayP3
            case .uhd5k, .uhd8k: .h264_sRGB
        }
    }
    
//    static let ratio = 4096.0/2304.0
    
    private var maxWidth: Int {
        return switch self {
            case .fhd2k:
                1920
            case .qhd:
                2560
            case .qhdPlus:
                3200
            case .uhd4k:
                3840
            case .uhd5k:
                5120
            case .uhd8k:
                7680
        }
    }
    
    var maxSize: CGSize {
        return CGSize(width: maxWidth, height: maxWidth)
    }
}
