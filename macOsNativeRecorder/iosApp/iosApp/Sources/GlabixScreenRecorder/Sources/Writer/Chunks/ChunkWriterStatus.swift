//
//  ChunkWriterStatus.swift
//  iosApp
//
//  Created by Pavel Feklistov on 10.06.2025.
//  Copyright © 2025 orgName. All rights reserved.
//


enum ChunkWriterStatus {
    case active
    case cancelling
    case cancelled
    case finalizing
    case finalized
    
    var description: String {
        switch self {
            case .active:
                "active"
            case .cancelling:
                "cancelling"
            case .cancelled:
                "cancelled"
            case .finalizing:
                "finalizing"
            case .finalized:
                "finalized"
        }
    }
}