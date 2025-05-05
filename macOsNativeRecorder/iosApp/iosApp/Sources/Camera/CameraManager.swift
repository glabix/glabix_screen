//
//  CameraManager.swift
//  iosApp
//
//  Created by Pavel Feklistov on 14.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AVFoundation
import CoreImage

class CameraStream: NSObject {
    var captureSession: AVCaptureSession = AVCaptureSession()
//    var deviceInput: AVCaptureDeviceInput?
//    var videoOutput: AVCaptureVideoDataOutput?
    
    var sessionQueue = DispatchQueue(label: "video.preview.session")
    
//    private let systemPreferredCamera = AVCaptureDevice.default(for: .video)
    
    private var addToPreviewStream: ((CGImage?) -> Void)?
    
    lazy var previewStream: AsyncStream<CGImage?> = {
        AsyncStream { continuation in
            addToPreviewStream = { cgImage in
                continuation.yield(cgImage)
            }
        }
    }()
    
    private func rotate(by angle: CGFloat, from connection: AVCaptureConnection) {
        guard connection.isVideoRotationAngleSupported(angle) else { return }
        connection.videoRotationAngle = angle
    }
    
    func start(with device: AVCaptureDevice?) {
        closeCamera()
        debugPrint("Start")
//        guard let device = CameraInput().device() else { return }
        
        debugPrint("device", device?.localizedName)
        if let device = device {
            Task {
                await configureSession(device: device)
                await startSession()
            }
        }
    }
    
    private func startSession() async {
        /// Checking authorization
        guard await isAuthorized else { return }
        /// Start the capture session flow of data
        captureSession.startRunning()
    }
    
    private func configureSession(device: AVCaptureDevice) async {
        guard await isAuthorized,
//              let systemPreferredCamera,
              let deviceInput = try? AVCaptureDeviceInput(device: device)
        else {
            print("Not authorized.")
            return
        }
        
        captureSession.beginConfiguration()
        
        defer {
            self.captureSession.commitConfiguration()
        }
        
        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.setSampleBufferDelegate(self, queue: sessionQueue)
        
        guard captureSession.canAddInput(deviceInput) else {
            print("Unable to add device input to capture session.")
            return
        }
        
        guard captureSession.canAddOutput(videoOutput) else {
            print("Unable to add video output to capture session.")
            return
        }
        
        captureSession.addInput(deviceInput)
        captureSession.addOutput(videoOutput)
        
//        videoOutput.connection(with: .video)?.videoRotationAngle = 90

    }
    
//    func recordingCamera(with device: AVCaptureDevice) {
//        captureSession = AVCaptureSession()
//        
//        guard let input = try? AVCaptureDeviceInput(device: device),
//              captureSession.canAddInput(input) else {
//            print("Failed to set up camera")
//            return
//        }
//        captureSession.addInput(input)
//        
//        let videoOutput = AVCaptureVideoDataOutput()
//        videoOutput.setSampleBufferDelegate(self, queue: .global())
//        
//        if captureSession.canAddOutput(videoOutput) {
//            captureSession.addOutput(videoOutput)
//        }
//        
//        captureSession.startRunning()
////        DispatchQueue.main.async { self.startCameraOverlayer() }
//    }
    
    func closeCamera() {
//        if isCameraRunning() {
            //SCContext.previewType = nil
//            if camWindow.isVisible { camWindow.close() }
            captureSession.stopRunning()
        addToPreviewStream?(nil)
//        }
    }
    
    private var isAuthorized: Bool {
        get async {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            
            // Determine if the user previously authorized camera access.
            var isAuthorized = status == .authorized
            
            // If the system hasn't determined the user's authorization status,
            // explicitly prompt them for approval.
            if status == .notDetermined {
                isAuthorized = await AVCaptureDevice.requestAccess(for: .video)
            }
            
            return isAuthorized
        }
    }
}

extension CameraStream: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
//        debugPrint("outp", sampleBuffer.cgImage != nil)
        guard let currentFrame = sampleBuffer.cgImage else { return }
        addToPreviewStream?(currentFrame)
    }
}


extension CMSampleBuffer {
    var cgImage: CGImage? {
        let pixelBuffer: CVPixelBuffer? = CMSampleBufferGetImageBuffer(self)
        
        guard let imagePixelBuffer = pixelBuffer else {
            return nil
        }
        
        return CIImage(cvPixelBuffer: imagePixelBuffer).cgImage
    }
    
}

extension CIImage {
    var cgImage: CGImage? {
        let ciContext = CIContext()
        
        guard let cgImage = ciContext.createCGImage(self, from: self.extent) else {
            return nil
        }
        
        return cgImage
    }
    
}
