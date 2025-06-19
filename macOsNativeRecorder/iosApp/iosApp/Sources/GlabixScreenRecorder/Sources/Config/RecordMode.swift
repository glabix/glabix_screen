//
//  RecordMode.swift
//  iosApp
//
//  Created by Pavel Feklistov on 13.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

enum RecordMode {
    case h264_sRGB
    case hevc_displayP3

    // I haven't gotten HDR recording working yet.
    // The commented out code is my best attempt, but still results in "blown out whites".
    //
    // Any tips are welcome!
    // - Tom
//    case hevc_displayP3_HDR
}

// Extension properties for values that differ per record mode
extension RecordMode {
    var preset: AVOutputSettingsPreset {
        switch self {
            case .h264_sRGB: return .preset3840x2160
            case .hevc_displayP3: return .hevc7680x4320
                //        case .hevc_displayP3_HDR: return .hevc7680x4320
        }
    }
    
    var videoCodecType: CMFormatDescription.MediaSubType {
        switch self {
            case .h264_sRGB: return .h264
            case .hevc_displayP3: return .hevc
                //        case .hevc_displayP3_HDR: return .hevc
        }
    }
    
    var videoColorProperties: NSDictionary {
        switch self {
            case .h264_sRGB:
                return [
                    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
                ]
            case .hevc_displayP3:
                return [
                    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                    AVVideoColorPrimariesKey: AVVideoColorPrimaries_P3_D65,
                    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
                ]
                //        case .hevc_displayP3_HDR:
                //            return [
                //                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_2100_HLG,
                //                AVVideoColorPrimariesKey: AVVideoColorPrimaries_P3_D65,
                //                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020,
                //            ]
        }
    }
    
    var videoProfileLevel: CFString? {
        switch self {
            case .h264_sRGB:
                return nil
            case .hevc_displayP3:
                return nil
                //        case .hevc_displayP3_HDR:
                //            return kVTProfileLevel_HEVC_Main10_AutoLevel
        }
    }
}
