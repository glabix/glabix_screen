//
//  StreamOutput.swift
//  iosApp
//
//  Created by Pavel Feklistov on 13.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import ScreenCaptureKit

enum ScreenRecorderSourceType {
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
                
                chunksManager?.processSampleBuffer(sampleBuffer, type: .screen)
            case .audio:
                chunksManager?.processSampleBuffer(sampleBuffer, type: .systemAudio)
            case .microphone:
                break
            @unknown default:
                break
        }
    }
}

extension ScreenRecorder: AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        chunksManager?.processSampleBuffer(sampleBuffer, type: .mic)
    }
}

