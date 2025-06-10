//
//  SampleBufferData.swift
//  iosApp
//
//  Created by Pavel Feklistov on 10.06.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

struct SampleBufferData: @unchecked Sendable {
    let type: ScreenRecorderSourceType
    let sampleBuffer: CMSampleBuffer
    
    var timestamp: CMTime {
        sampleBuffer.presentationTimeStamp
    }
}
