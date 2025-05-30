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
        
        screenRecorder.start(withConfig: .development)
    }
    
    func configure() async throws {
        try checkPermissions()
        
        try await screenRecorder
            .configureAndInitialize(with: .development)
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
