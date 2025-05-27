//
//  CommandAction.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

enum CommandAction: String, Codable {
    case configure
    case start
    case startWithConfig
    case stop
    case pause
    case resume
    case printAudioInputDevices
//    case printVideoInputDevices
}

enum WaveformCommandAction: String, Codable {
    case start
    case stop
}
