//
//  FloatingPanel.swift
//  iosApp
//
//  Created by Pavel Feklistov on 21.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

class FloatingPanel<Content: View>: NSPanel {
    @Binding var isPresented: Bool

    init(
        @ViewBuilder view: () -> Content,
        contentRect: NSRect,
        isPresented: Binding<Bool>) {
            self._isPresented = isPresented
    
            super.init(
                contentRect: contentRect,
                styleMask: [.utilityWindow],
//                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
                
            isFloatingPanel = true
            level = .floating
//            level = .statusBar
                            
//            collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            collectionBehavior = [.canJoinAllSpaces]
            animationBehavior = .utilityWindow
            isMovableByWindowBackground = false

            hidesOnDeactivate = true
            contentView = NSHostingView(rootView: view())
            backgroundColor = .clear
    }
    
    override func resignMain() {
        super.resignMain()
        close()
    }

    override func close() {
        super.close()
        isPresented = false
    }
    
    override var canBecomeKey: Bool {
        return true
    }
     
    override var canBecomeMain: Bool {
        return true
    }
}
