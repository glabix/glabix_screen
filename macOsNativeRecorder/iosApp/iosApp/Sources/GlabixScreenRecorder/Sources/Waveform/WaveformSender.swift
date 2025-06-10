//
//  WaveformSender.swift
//  iosApp
//
//  Created by Pavel Feklistov on 10.06.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import Foundation

class WaveformSender {
    lazy var fileURL: URL = {
        let tempDirectoryURL = FileManager.default.temporaryDirectory
        let tempFileURL = tempDirectoryURL.appendingPathComponent("numbers.txt")
        return tempFileURL
    }()
    
    func callback(values: [Float]) {
        Callback.print(Callback.MicrophoneWaveform(amplitudes: values))
    }
    
    func write(values: [Float]) {
        if !FileManager.default.fileExists(atPath: fileURL.path) {
            FileManager.default.createFile(atPath: fileURL.path, contents: nil, attributes: nil)
        }

        let numberString = values.map(\.description).joined(separator: ",")
        do {
            try numberString.write(to: fileURL, atomically: true, encoding: .utf8)
        } catch {
            Log.error("Не удалось записать в файл: \(error)")
        }
    }
}
