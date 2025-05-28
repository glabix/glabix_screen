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
//    private let cameraDevices: CameraCaptureDevices = CameraCaptureDevices()
    
    init() {
        setupObservers()
    }
    
    private func setupObservers() {
        NotificationCenter.default.addObserver(self, selector: #selector(self.audioDeviceWasConnected), name: AVCaptureDevice.wasConnectedNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(self.audioDeviceWasDisconnected), name: AVCaptureDevice.wasDisconnectedNotification, object: nil)
    }
    
    @objc func audioDeviceWasConnected(notification: Notification) {
        handleDeviceUpdated(notification.object)
    }
    
    @objc func audioDeviceWasDisconnected(notification: Notification) {
        handleDeviceUpdated(notification.object)
    }
    
    func handleDeviceUpdated(_ object: Any?) {
        guard let device = object as? AVCaptureDevice else { return }
//        if device.hasMediaType(.video) {
//            Callback.print(Callback.CameraDevices(devices: cameraDevices.callbackDevices()))
//        } else
        if device.hasMediaType(.audio) {
            Callback.print(Callback.MicrophoneDevices(devices: microphoneDevices.callbackDevices()))
        }
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

extension MicrophoneCaptureDevices {
    func getAudioDeviceID(from uid: String) -> AudioDeviceID {
        let deviceID = kAudioObjectUnknown
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var propertySize: UInt32 = 0
        var status = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &propertySize
        )
        
        if status != noErr {
            print("Error getting property data size: \(status)")
            return deviceID
        }
        
        let deviceCount = Int(propertySize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs: [AudioDeviceID] = Array(repeating: kAudioObjectUnknown, count: deviceCount)
        
        status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &propertySize,
            &deviceIDs
        )
        
        if status != noErr {
            print("Error getting property data: \(status)")
            return deviceID
        }
        
        for id in deviceIDs {
            var name: CFString = "" as CFString
            var nameSize = UInt32(MemoryLayout<CFString>.size)
            var address = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceUID,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            
            status = AudioObjectGetPropertyData(
                id,
                &address,
                0,
                nil,
                &nameSize,
                &name
            )
            
            if status == noErr && name as String == uid {
                return id
            }
        }
        
        return deviceID
    }
    
    func setDefaultInputDevice(to deviceUID: String) {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceID = getAudioDeviceID(from: deviceUID)
        guard deviceID != kAudioObjectUnknown else {
            print("Device with UID \(deviceUID) not found.")
            return
        }
        
        let status = AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            UInt32(MemoryLayout.size(ofValue: deviceID)),
            &deviceID
        )
        
        if status != noErr {
            print("Error setting default input device: \(status)")
        } else {
            print("Default input device successfully set to \(deviceUID)")
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
