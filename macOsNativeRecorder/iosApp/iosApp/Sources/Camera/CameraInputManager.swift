//
//  CameraInputManager.swift
//  iosApp
//
//  Created by Pavel Feklistov on 14.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI
import CoreImage
import AVFoundation

struct CameraInput {
    @AppStorage("cameraDeviceName") var cameraDeviceName: String = ""
    
    func device() -> AVCaptureDevice? {
        //        AVCaptureDeviceInput(device: systemPreferredCamera)
        return readDevices().first {
            $0.localizedName == cameraDeviceName
        }
    }
    
    func readDevices() -> [AVCaptureDevice] {
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .externalUnknown],
            mediaType: .video,
            position: .unspecified
        )
        return discoverySession.devices
    }
}

class CameraViewModel: ObservableObject {
    @Published var options: [String] = []
    @Published var currentFrame: CGImage?
    @AppStorage("cameraDeviceName") var cameraDeviceName: String = ""
    @Published var size: CGSize = .init(width: 240, height: 240)
    private let cameraInput = CameraInput()
    private let stream = CameraStream()
    
    init() {
        let devices = cameraInput.readDevices()
        options = devices.map(\.localizedName)
        
//        if let device = cameraInput.device() {
//            stream.start(with: device)
//        }
//     
//        Task {
//            await handleCameraPreviews()
//        }
        
//        $cameraDeviceName
//        cameraManager.startWithDevice()
    }
    
    func updateWithCurrentDevice() {
        stream.closeCamera()
//        stream.start(with: cameraInput.device())
    }
    
    
    
    func handleCameraPreviews() async {
        for await image in stream.previewStream {
            Task { @MainActor in
                currentFrame = image
            }
        }
    }
}
