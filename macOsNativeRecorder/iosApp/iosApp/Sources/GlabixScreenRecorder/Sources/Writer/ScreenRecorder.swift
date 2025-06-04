//
//  ScreenRecorder.swift
//  iosApp
//
//  Created by Pavel Feklistov on 13.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation
import CoreGraphics
import ScreenCaptureKit
import VideoToolbox
import Combine

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

class ScreenRecorder: NSObject {
    var chunksManager: ScreenChunksManager?
    
    private var microphoneSession: AVCaptureSession?
    
    private var stream: SCStream?
    
    private let sampleHandlerQueue = DispatchQueue(label: "com.glabix.screen.screenCapture")
    
    private let microphoneDevices: MicrophoneCaptureDevices = MicrophoneCaptureDevices()
//    private let cameraDevices: CameraCaptureDevices = CameraCaptureDevices()
    
    private func setupStream(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) async throws {
        chunksManager = ScreenChunksManager(
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
        )
        
        // MARK: SCStream setup
        let display = try await screenConfigurator.display()
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = recordConfiguration.screenCaptureConfig(screenConfigurator: screenConfigurator)
        
        stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
               
        try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleHandlerQueue)
        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleHandlerQueue)
    }
    
    func printAudioInputDevices() {
//        let auth = AVCaptureDevice.authorizationStatus(for: .audio)
//        print("auth: \(auth)")
//        
//        AVCaptureDevice.requestAccess(for: .audio) { (isSuccess) in
//            print("isSuccess: \(isSuccess)")
//        }
        
        Callback.print(Callback.MicrophoneDevices(devices: microphoneDevices.callbackDevices()))
    }
    
//    func printVideoInputDevices() {
//        Callback.print(Callback.CameraDevices(devices: cameraDevices.callbackDevices()))
//    }
    
    private func configureMicrophoneCapture(uniqueID: String?) {
        microphoneSession = AVCaptureSession()
        
        let device = microphoneDevices.deviceOrDefault(uniqueID: uniqueID)
        
        guard let microphone = device else { return}
        Log.info("selected microphone", microphone.uniqueID, microphone.modelID, microphone.localizedName)
        
        do {
            let micInput = try AVCaptureDeviceInput(device: microphone)
            microphoneSession?.addInput(micInput)
            
            let micOutput = AVCaptureAudioDataOutput()
            
            micOutput.setSampleBufferDelegate(self, queue: sampleHandlerQueue)
            microphoneSession?.addOutput(micOutput)
        } catch {
            Log.error("Error setting up microphone capture: \(error)")
        }
    }
    
    func start() {
        chunksManager?.startOnNextSample()
        Callback.print(Callback.RecordingStarted(outputPath: chunksManager?.outputDirectoryURL.path()))
    }
    
    func configureAndInitialize(with config: Config) async throws {
        try await configure(with: config)
        chunksManager?.initializeFirstChunkWriter()
    }
    
    private func configure(with config: Config) async throws {
        let availableContent = try await SCShareableContent.current
//        print("Available displays: \(availableContent.displays.map { "\($0.displayID)" }.joined(separator: ", "))")
        guard let display = availableContent.displays.first(where: { $0.displayID == config.displayId ?? CGMainDisplayID() }) else {
            throw NSError(domain: "GlabixScreenRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Display not found"])
        }
        
        //        let displayID = CGMainDisplayID()
        //        debugPrint("displayId", displayID.description, displayID)
        
        let screenConfigurator = ScreenConfigurator(displayID: display.displayID)
        let recordConfiguration = RecordConfiguration(config: config)
                
        try await setupStream(screenConfigurator: screenConfigurator, recordConfiguration: recordConfiguration)
        
        if config.captureMicrophone {
            configureMicrophoneCapture(uniqueID: config.microphoneUniqueID)
            microphoneSession?.startRunning()
        }
        
        // Start capturing, wait for stream to start
        try await stream?.startCapture()
    }
    
    func stop() async throws {
        await chunksManager?.stop()
        
        try await stream?.stopCapture()
        microphoneSession?.stopRunning()
    }
}
