//
//  RecordHandler.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI
import Combine

class RecordHandler: ObservableObject {
    @Published var recording: Bool = false
    @Published var paused: Bool = false
    @AppStorage("micDeviceName") var micDeviceName: String = ""
    
    private let screenRecorder: ScreenRecorder = .init()
    
    private func checkPermissions() throws {
        guard CGPreflightScreenCaptureAccess() else {
            debugPrint("not granted!")
            let result = CGRequestScreenCaptureAccess()
            guard result else {
                debugPrint("NOT ACCEPTED")
                throw RecordingError("No screen capture permission")
            }
            //            if(result == true)
            //            {
            //                print("Screen recording granted, thank you.")
            //                  }
            //            debugPrint("not granted")
            throw RecordingError("No screen capture permission")
        }
    }
    
    func start() throws {
        try checkPermissions()
        
        DispatchQueue.main.async {
            self.recording = true
            self.paused = false
        }
        
        screenRecorder.start()
    }
    
    func configure() async throws {
        try checkPermissions()
        
        try await screenRecorder
            .configureAndInitialize(with: .init(
                displayId: nil,
                resolution: .uhd4k,
                fps: 30,
                cropRect: nil,
                //                    chunksDirectoryPath: nil,
                chunksDirectoryPath: "/Users/pavelfeklistov/Library/Containers/com.glabix.screenMac/Data/Documents/chunks",
                showCursor: true,
                captureSystemAudio: true,
                captureMicrophone: true,
                microphoneUniqueID: nil
//                microphoneUniqueID: "6A08AC30-F752-4660-82B0-F72A00000003"
            ))
    }
    
    func startWithConfig() async throws {
        try checkPermissions()
        
        DispatchQueue.main.async {
            self.recording = true
            self.paused = false
        }
        
        try await screenRecorder
            .start(
                withConfig: .init(
                    displayId: nil,
                    resolution: .uhd4k,
                    fps: 30,
                    cropRect: nil,
//                    chunksDirectoryPath: nil,
                    chunksDirectoryPath: "/Users/pavelfeklistov/Library/Containers/com.glabix.screenMac/Data/Documents/chunks",
                    showCursor: true,
                    captureSystemAudio: true,
                    captureMicrophone: true,
                    microphoneUniqueID: nil//"6A08AC30-F752-4660-82B0-F72A00000003"
                )
            )
        
//        DispatchQueue.main.async {
//            NSWorkspace.shared.open(folder)
//        }
    }
    
    func pause() {
        screenRecorder.chunksManager?.pause()
        self.paused = true
    }
    
    func resume() {
        screenRecorder.chunksManager?.resume()
        self.paused = false
    }
    
    func stop() async throws {
        try await screenRecorder.stop()
        DispatchQueue.main.async {
            self.recording = false
            self.paused = false
        }
        
//        DispatchQueue.main.async {
//            self.url.map {
//                _ = NSWorkspace.shared.open($0)
//            }
//        }
    }
    
    func printAudioInputDevices() {
        screenRecorder.printAudioInputDevices()
    }
    
//    func printVideoInputDevices() {
//        screenRecorder.printVideoInputDevices()
//    }
}
