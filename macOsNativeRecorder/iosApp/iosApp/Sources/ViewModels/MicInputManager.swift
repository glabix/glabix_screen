//
//  MicInputManager.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI
import Combine
import AVFoundation

class MicInputManager: ObservableObject {
    @ObservedObject var inputSettings: InputSettings = .init()
    @Published var options: [String] = []
    
    init() {
//        options = [inputSettings.micDeviceName].compactMap(\.self)
        
        let devices = readDevices()
        options = devices.map(\.localizedName)
        
    }
    
    func device() -> AVCaptureDevice? {
        return readDevices().first {
            $0.localizedName == inputSettings.micDeviceName
        }
    }
    
    private func readDevices() -> [AVCaptureDevice] {
        var discoverySession: AVCaptureDevice.DiscoverySession
        if #available(macOS 15.0, *) {
            discoverySession = AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone], mediaType: .audio, position: .unspecified)
        } else {
            discoverySession = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInMicrophone, .externalUnknown], mediaType: .audio, position: .unspecified)
        }
        return discoverySession.devices.filter({ !$0.localizedName.contains("CADefaultDeviceAggregate") })
    }
}
