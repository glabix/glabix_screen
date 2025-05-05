//
//  AppDelegate.swift
//  iosApp
//
//  Created by Pavel Feklistov on 14.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
//    @Environment(\.openWindow) private var openWindow
    var overlayWindow: NSWindow?
//    @Binding var cameraWindow: NSWindow?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
//        openWindow("main")
        debugPrint("Windows", NSApplication.shared.windows)
        if let window = NSApplication.shared.windows.first {
            window.delegate = self
        }
        
//        NSApplication.shared.windows.forEach { window in
//            window.collectionBehavior = [.canJoinAllSpaces]
//            window.makeKeyAndOrderFront(nil)
//            window.orderFrontRegardless()
//            window.level = .statusBar
//            debugPrint("OK", window.title)
//        }
        
//        createOverlay()
    }
    
//    func applicationShouldHandleReopen(
//        _ sender: NSApplication,
//       hasVisibleWindows: Bool
//    ) -> Bool {
//        debugPrint("hasVisibleWindows", hasVisibleWindows)
//        return !hasVisibleWindows
//    }
    
//    func applicationWillTerminate(_ notification: Notification) {
//        debugPrint("WILL TERM", NSApplication.shared.windows.count)
//        NSApplication.shared.windows.forEach { window in
//            window.close()
//        }
//    }
    
    func createOverlay() {
        guard overlayWindow == nil else { return }
        // create window
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 300, height: 200),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        
        //                window.styleMask = [
        //                    .titled,
        //                    .closable,
        //                    .resizable,
        //                    .fullSizeContentView
        //                ]
        
        // set content to custom View
        let contentView = OverlayContentView()
        window.contentView = NSHostingView(rootView: contentView)
        
        window.isOpaque = false
        window.backgroundColor = .clear
        
        window.level = .floating
        //        window.level = .statusBar
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        
        window.collectionBehavior = [.canJoinAllSpaces]
        
        window.sharingType = .none
        debugPrint("scre", window.screen)
        if let screen  = window.screen {
            var frame = window.frame
            frame.size = screen.frame.size
            window.setFrame(frame, display: true)
        }
        
        self.overlayWindow = window
    }
    
//    func windowShouldClose(_ sender: NSWindow) -> Bool {
//        NSApp.hide(nil)
//        return false
//    }
}

struct WindowAccessor: NSViewRepresentable {
    @Binding
    var window: NSWindow?
    
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            self.window = view.window
        }
        return view
    }
    
    func updateNSView(_ nsView: NSView, context: Context) {}
}

enum WindowId: String, Identifiable {
    case main
    case camera
    
    var id: String { self.rawValue }
}
