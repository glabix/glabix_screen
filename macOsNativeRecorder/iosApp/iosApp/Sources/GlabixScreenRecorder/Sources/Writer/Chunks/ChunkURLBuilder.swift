//
//  ChunkURLBuilder.swift
//  iosApp
//
//  Created by Pavel Feklistov on 10.06.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import Foundation

struct ChunkURLBuilder {
    let chunkIndex: Int
    let dirURL: URL?
    
    var screenURL: URL? {
        dirURL?.appendingPathComponent("chunk_\(chunkIndex).mp4")
    }
    
    var micURL: URL? {
        dirURL?.appendingPathComponent("chunk_\(chunkIndex).m4a")
    }
}
