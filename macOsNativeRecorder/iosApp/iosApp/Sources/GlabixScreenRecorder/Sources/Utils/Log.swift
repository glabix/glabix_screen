//
//  Log.swift
//  GlabixScreenRecorder
//
//  Created by Pavel Feklistov on 27.05.2025.
//

import AVFoundation

class Log {
    static var nowString: String { "now: \(CMClock.hostTimeClock.time.seconds)" }
    
    private static func print(_ items: [Any], prefix: String?, chunkIndex: Int?) {
        prefix.map { Swift.print($0, terminator: " ") }
        if chunkIndex != -1 {
            Swift.print("(\(chunkIndex?.description ?? "n/a"))", terminator: " ")
        }
        items.forEach {
            Swift.print($0, terminator: " ")
        }
        Swift.print("")
    }
    
    static func print(_ items: Any...) {
        print(items, prefix: nil, chunkIndex: -1)
    }
    
    static func print(_ items: Any..., chunkIndex: Int? = -1) {
        print(items, prefix: nil, chunkIndex: chunkIndex)
    }
    
    static func error(_ items: Any..., chunkIndex: Int? = -1) {
        print(items, prefix: "💀", chunkIndex: chunkIndex)
    }
    
    static func warn(_ items: Any..., chunkIndex: Int? = -1) {
        print(items, prefix: "⚠️", chunkIndex: chunkIndex)
    }
    
    static func info(_ items: Any..., chunkIndex: Int? = -1) {
        print(items, prefix: "ℹ️", chunkIndex: chunkIndex)
    }
    
    static func success(_ items: Any..., chunkIndex: Int? = -1) {
        print(items, prefix: "✅", chunkIndex: chunkIndex)
    }
}
