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
    
    func start() async throws {
        try checkPermissions()
        
        DispatchQueue.main.async { [weak self] in
            self?.recording = true
        }
        
        try await screenRecorder.startFullScreen()
        
//        DispatchQueue.main.async {
//            NSWorkspace.shared.open(folder)
//        }
    }
    
    func stop() async throws {
        try await screenRecorder.stop()
        DispatchQueue.main.async {
            self.recording = false
        }
        
//        DispatchQueue.main.async {
//            self.url.map {
//                _ = NSWorkspace.shared.open($0)
//            }
//        }
    }
}
