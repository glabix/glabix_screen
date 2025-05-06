//
//  InputSettings.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

class InputSettings: ObservableObject {
    @AppStorage("cameraDeviceName") var cameraDeviceName: String = ""
    @AppStorage("micDeviceName") var micDeviceName: String = ""
    @AppStorage("audioQuality") var audioQuality: AudioQuality = .high
//    var micDeviceName: String? {
//        _micDeviceName.nullIfEmpty()
//    }
}
