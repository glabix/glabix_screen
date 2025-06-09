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
        
        Task {
            await screenRecorder.start()
            DispatchQueue.main.async {
                self.recording = true
                self.paused = false
            }
        }
    }
    
    func configure() async throws {
        try checkPermissions()
        clearOutputDirectory()
        
        try await screenRecorder
            .configureAndInitialize(with: .appDevelopment)
    }
    
    private func clearOutputDirectory() {
        let fileManager = FileManager.default
        let directoryURL = URL(fileURLWithPath: Config.appDevelopment.chunksDirectoryPath)
        
        do {
            try fileManager.createDirectory(atPath: directoryURL.path, withIntermediateDirectories: true, attributes: nil)
            let files = try fileManager.contentsOfDirectory(atPath: directoryURL.path())
            
            for file in files {
                let filePath = directoryURL.appendingPathComponent(file).absoluteURL
                try fileManager.removeItem(at: filePath)
            }
        } catch let error {
            Log.error(error)
        }
    }
    
    func pause() {
        Task {
            await screenRecorder.chunksManager?.pause()
            DispatchQueue.main.async {
                self.paused = true
            }
        }
    }
    
    func resume() {
        Task {
            await screenRecorder.chunksManager?.resume()
            DispatchQueue.main.async {
                self.paused = false
            }
        }
    }
    
    func stop() {
        Task {
            await screenRecorder.stop()
            DispatchQueue.main.async {
                self.recording = false
                self.paused = false
            }
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
