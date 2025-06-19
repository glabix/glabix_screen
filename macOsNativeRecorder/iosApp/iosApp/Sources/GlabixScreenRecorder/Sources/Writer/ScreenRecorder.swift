//
//  ScreenRecorder.swift
//  iosApp
//
//  Created by Pavel Feklistov on 13.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation
import ScreenCaptureKit

class ScreenRecorder: NSObject {
    private var chunksManager: ScreenChunksManager?
    
    private var microphoneSession: AVCaptureSession?
    
    private var stream: SCStream?
    
    private let sampleHandlerQueue = DispatchQueue(label: "com.glabix.screen.screenCapture")
    
    private let microphoneDevices: MicrophoneCaptureDevices = MicrophoneCaptureDevices()
    private var sampleBufferStream: AsyncStream<SampleBufferData>?
    var continuation: AsyncStream<SampleBufferData>.Continuation?
//    private let cameraDevices: CameraCaptureDevices = CameraCaptureDevices()
    
    private func setupStream(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) async throws {
        chunksManager = ScreenChunksManager(
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration,
        )
        
        (sampleBufferStream, continuation) = AsyncStream.makeStream(of: SampleBufferData.self)
        if let sampleBufferStream = sampleBufferStream {
            await chunksManager?.startProcessing(sampleBufferStream: sampleBufferStream)
        }
        
        // MARK: SCStream setup
        let display = try await screenConfigurator.display()
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = recordConfiguration.screenCaptureConfig(screenConfigurator: screenConfigurator)
        
        stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
               
        try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleHandlerQueue)
        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleHandlerQueue)
    }
    
    private func setupMicrophoneSession(
        recordConfiguration: RecordConfiguration
    ) {
        guard recordConfiguration.captureMicrophone else { return }

        microphoneSession = AVCaptureSession()
        
        let device = microphoneDevices.deviceOrDefault(uniqueID: recordConfiguration.microphoneUniqueID)
        
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
    
        microphoneSession?.startRunning()
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
    
    func start() async {
        await chunksManager?.startOnNextSample()
        
        Callback.print(Callback.RecordingStarted(outputPath: await chunksManager?.outputDirectoryURL.path()))
    }
    
    func configureAndInitialize(with config: Config) async throws {
        try await configure(with: config)
        await chunksManager?.initializeFirstChunkWriter()
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
                
        setupMicrophoneSession(recordConfiguration: recordConfiguration)

        try await setupStream(screenConfigurator: screenConfigurator, recordConfiguration: recordConfiguration)
        try await stream?.startCapture()
    }
    
    func stop() async {
        await chunksManager?.stop()
        
        try? await stream?.stopCapture()
        microphoneSession?.stopRunning()
    }
    
    func pause() async {
        await chunksManager?.pause()
    }
    
    func resume() async {
        await chunksManager?.resume()
    }
}
