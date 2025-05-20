//
//  CaptureDeviceDiscoverable.swift
//  iosApp
//
//  Created by Pavel Feklistov on 20.05.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation

class CaptureDevicesObserver {
    private let microphoneDevices: MicrophoneCaptureDevices = MicrophoneCaptureDevices()
    private let cameraDevices: CameraCaptureDevices = CameraCaptureDevices()
    
    init() {
        setupObservers()
    }
    
    private func setupObservers() {
        NotificationCenter.default.addObserver(self, selector: #selector(self.audioDeviceWasConnected), name: AVCaptureDevice.wasConnectedNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(self.audioDeviceWasDisconnected), name: AVCaptureDevice.wasDisconnectedNotification, object: nil)
    }
    
    @objc func audioDeviceWasConnected(notification: Notification) {
        Callback.print(Callback.MicrophoneDevices(devices: microphoneDevices.callbackDevices()))
    }
    
    @objc func audioDeviceWasDisconnected(notification: Notification) {
        Callback.print(Callback.CameraDevices(devices: cameraDevices.callbackDevices()))
    }
}

protocol CaptureDeviceDiscoverable {
    var systemPreferredDevice: AVCaptureDevice? { get }
    var discoverySession: AVCaptureDevice.DiscoverySession { get }
}

extension CaptureDeviceDiscoverable {
    func devices() -> [AVCaptureDevice] {
        let devices = discoverySession.devices//.filter({ !$0.localizedName.contains("CADefaultDeviceAggregate") })
        return devices
    }
    
    func callbackDevices() -> [Callback.CaptureDevice] {
        let systemPreferredDeviceID = self.systemPreferredDevice?.uniqueID
        
        return devices().map {
            Callback.CaptureDevice(
                id: $0.uniqueID,
                name: $0.localizedName,
                isDefault: $0.uniqueID == systemPreferredDeviceID
            )
        }
    }
    
    func deviceOrDefault(uniqueID: String?) -> AVCaptureDevice? {
        devices().first(where: { $0.uniqueID == uniqueID }) ?? systemPreferredDevice
    }
    
    func device(localizedName: String?) -> AVCaptureDevice? {
        devices().first(where: { $0.localizedName == localizedName })
    }
}

class MicrophoneCaptureDevices: CaptureDeviceDiscoverable {
    var systemPreferredDevice: AVCaptureDevice? { .default(for: .audio) }
    
    var discoverySession: AVCaptureDevice.DiscoverySession {
        if #available(macOS 14.0, *) {
            AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone], mediaType: .audio, position: .unspecified)
        } else {
            AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInMicrophone, .externalUnknown], mediaType: .audio, position: .unspecified)
        }
    }
}

class CameraCaptureDevices: CaptureDeviceDiscoverable {
    var systemPreferredDevice: AVCaptureDevice? { .default(for: .video) }
    
    var discoverySession: AVCaptureDevice.DiscoverySession {
        if #available(macOS 14.0, *) {
            AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external], mediaType: .video, position: .unspecified)
        } else {
            AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .externalUnknown], mediaType: .video, position: .unspecified)
        }
    }
}
