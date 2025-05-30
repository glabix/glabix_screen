//
//  Command.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 06.05.2025.
//

struct Command: Codable {
    let action: CommandAction
    let config: Config?
    let startConfig: StartConfig?
}

struct WaveformCommand: Codable {
    let action: WaveformCommandAction
    let config: WaveformConfig?
}
