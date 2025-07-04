//
//  StreamOutput.swift
//  iosApp
//
//  Created by Pavel Feklistov on 13.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import ScreenCaptureKit

enum ScreenRecorderSourceType: CaseIterable {
    case systemAudio, screen, mic
}

extension ScreenRecorder: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard sampleBuffer.isValid else { return }
        
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }
        
        switch type {
            case .screen:
                guard let attachmentsArray = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                      let attachments = attachmentsArray.first
                else { return }
                
                // Validate the status of the frame. If it isn't `.complete`, return
                guard let statusRawValue = attachments[SCStreamFrameInfo.status] as? Int,
                      let status = SCFrameStatus(rawValue: statusRawValue),
                      status == .complete
                else { return }

                continuation?.yield(SampleBufferData(type: .screen, sampleBuffer: sampleBuffer))
            case .audio:
                continuation?.yield(SampleBufferData(type: .systemAudio, sampleBuffer: sampleBuffer))
            case .microphone:
                break
            @unknown default:
                break
        }
        
        if type == .audio {
//            Log.info("system audio buffer at \(sampleBuffer.presentationTimeStamp.seconds)")
        }
    }
}

extension ScreenRecorder: AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        continuation?.yield(SampleBufferData(type: .mic, sampleBuffer: sampleBuffer))
    }
}

