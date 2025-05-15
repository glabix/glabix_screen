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

class ScreenRecorder: NSObject {
    var chunksManager: ScreenChunksManager?
    
    private var microphoneSession: AVCaptureSession?
    
    private var stream: SCStream?
    
    private let screenCaptureQueue = DispatchQueue(label: "com.glabix.screen.screenCapture")
    
    private func setupStream(
        screenConfigurator: ScreenConfigurator,
        recordConfiguration: RecordConfiguration
    ) async throws {
        chunksManager = ScreenChunksManager(
            screenConfigurator: screenConfigurator,
            recordConfiguration: recordConfiguration
        )
        
        // MARK: SCStream setup
        let display = try await screenConfigurator.display()
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = recordConfiguration.screenCaptureConfig(screenConfigurator: screenConfigurator)
        
        stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
               
        try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: screenCaptureQueue)
        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: screenCaptureQueue)
    }
    
    private func inputDevices() -> [AVCaptureDevice] {
        var discoverySession: AVCaptureDevice.DiscoverySession
        if #available(macOS 15.0, *) {
            discoverySession = AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone], mediaType: .audio, position: .unspecified)
        } else {
            discoverySession = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInMicrophone, .externalUnknown], mediaType: .audio, position: .unspecified)
        }
        let devices = discoverySession.devices//.filter({ !$0.localizedName.contains("CADefaultDeviceAggregate") })
        return devices
    }
    
    func printAudioInputDevices() {
        let defaultAudioInputDevice = AVCaptureDevice.default(for: .audio)
        
        let devices = inputDevices()
        let devicesData = devices.map {
            Callback.MicrophoneDevice(
                id: $0.uniqueID,
                name: $0.localizedName,
                isDefault: $0.uniqueID == defaultAudioInputDevice?.uniqueID
            )
        }
        Callback.print(devicesData)
    }
    
    private func configureMicrophoneCapture(uniqueID: String?) {
        microphoneSession = AVCaptureSession()
        
        let devices = inputDevices()
        
        guard let microphone: AVCaptureDevice = devices.first(where: { $0.uniqueID == uniqueID }) ?? AVCaptureDevice.default(for: .audio) else {
            return
        }
        print("selected microphone", microphone.uniqueID, microphone.modelID, microphone.localizedName)
        
        do {
            let micInput = try AVCaptureDeviceInput(device: microphone)
            microphoneSession?.addInput(micInput)
            
            let micOutput = AVCaptureAudioDataOutput()
            micOutput.setSampleBufferDelegate(self, queue: screenCaptureQueue)
            microphoneSession?.addOutput(micOutput)
        } catch {
            print("Error setting up microphone capture: \(error)")
        }
    }
    
    func start(config: Config) async throws {
        let availableContent = try await SCShareableContent.current
        print("Available displays: \(availableContent.displays.map { "\($0.displayID)" }.joined(separator: ", "))")
        
        guard let display = availableContent.displays.first(where: { $0.displayID == config.displayId ?? CGMainDisplayID() }) else {
            throw NSError(domain: "GlabixScreenRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Display not found"])
        }
        
//        let displayID = CGMainDisplayID()
//        debugPrint("displayId", displayID.description, displayID)
        
        let screenConfigurator = ScreenConfigurator(displayID: display.displayID)
        let recordConfiguration = RecordConfiguration(config: config)
        
        try await setupStream(screenConfigurator: screenConfigurator, recordConfiguration: recordConfiguration)
        print("config.captureMicrophone", config.captureMicrophone)
        if config.captureMicrophone {
            configureMicrophoneCapture(uniqueID: config.microphoneUniqueID)
        }
        
        // Start capturing, wait for stream to start
        microphoneSession?.startRunning()
        try await stream?.startCapture()
        
        Callback.print(Callback.RecordingStarted(path: chunksManager?.outputDirectory?.path()))
    }
    
    func stop() async throws {
//        screenCaptureQueue.async { [weak self] in
            // Stop capturing, wait for stream to stop
        try await stream?.stopCapture()
        microphoneSession?.stopRunning()
            
        await chunksManager?.stop()
        
        
//        }
    }
}
