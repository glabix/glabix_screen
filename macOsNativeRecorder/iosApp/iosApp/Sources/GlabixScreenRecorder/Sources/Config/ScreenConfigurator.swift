//
//  ScreenConfigurator.swift
//  iosApp
//
//  Created by Pavel Feklistov on 21.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import CoreGraphics
import ScreenCaptureKit

class ScreenConfigurator {
    let displaySize: CGSize
    let displayScaleFactor: Int
    
    private let displayID: CGDirectDisplayID
    
    init(displayID: CGDirectDisplayID) {
        self.displayID = displayID
        
        // Get size and pixel scale factor for display
        // Used to compute the highest possible qualitiy
        let displaySize = CGDisplayBounds(displayID).size
        let displayMode = CGDisplayCopyDisplayMode(displayID)
        
        self.displaySize = displaySize
        // The number of physical pixels that represent a logic point on screen, currently 2 for MacBook Pro retina displays
        if let mode = displayMode {
            displayScaleFactor = mode.pixelWidth / mode.width
        } else {
            displayScaleFactor = 1
        }
    }
    
    func display() async throws -> SCDisplay {
        // Create a filter for the specified display
        let sharableContent = try await SCShareableContent.current
        guard let display = sharableContent.displays.first(where: { $0.displayID == displayID }) else {
            throw RecordingError("Can't find display with ID \(displayID) in sharable content")
        }
        return display
    }
}
