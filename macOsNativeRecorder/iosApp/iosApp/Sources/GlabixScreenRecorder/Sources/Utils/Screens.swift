//
//  Screens.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import AppKit

struct Screens {
    static func getScreens() -> [NSScreen]{
        return NSScreen.screens
    }
    
    static func mainOrFirst() -> NSScreen? {
        return NSScreen.main ?? getScreens().first
    }
}
