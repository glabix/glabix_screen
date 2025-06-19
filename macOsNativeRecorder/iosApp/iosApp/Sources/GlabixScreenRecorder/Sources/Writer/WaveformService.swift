//
//  WaveformService.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 09.06.2025.
//

import AVFoundation

class WaveformService: NSObject {
    private let microphoneDevices: MicrophoneCaptureDevices = MicrophoneCaptureDevices()
    private var microphoneSession: AVCaptureSession?
    let waveformProcessor: WaveformProcessor = WaveformProcessor()
    private let queue = DispatchQueue(label: "com.glabix.screen.waveform")
    
    func start(config: WaveformConfig) {
        microphoneSession = AVCaptureSession()
        
        let device = microphoneDevices.deviceOrDefault(uniqueID: config.microphoneUniqueID)
        
        guard let microphone = device else { return}
        Log.info("selected microphone", microphone.uniqueID, microphone.modelID, microphone.localizedName)
        
        do {
            let micInput = try AVCaptureDeviceInput(device: microphone)
            microphoneSession?.addInput(micInput)
            
            waveformProcessor.micOutput.map {
                microphoneSession?.addOutput($0)
            }
            
            microphoneSession?.startRunning()
        } catch {
            Log.error("Error setting up microphone capture: \(error)")
        }
    }
    
    func stop() {
        microphoneSession?.stopRunning()
    }
}
