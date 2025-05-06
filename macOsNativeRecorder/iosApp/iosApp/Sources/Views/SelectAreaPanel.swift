//
//  SelectAreaPanel.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

struct SelectAreaPanel: View {
    @Binding var areaRect: CGRect?
    @State private var path: Path?
    @State private var currentDraggingId = UUID()
    
    var drawGesture: some Gesture {
        
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                let start = value.startLocation
                let end = value.location
                let rectangle: CGRect = .init(
                    origin: end,
                    size: .init(
                        width: start.x - end.x,
                        height: start.y - end.y
                    )
                )
                path = .init {
                    $0.addRect(rectangle)
                }
            }
            .onEnded { _ in
                areaRect = path?.boundingRect
            }
    }
    
    var body: some View {
        Color.black.opacity(0.2)
            .gesture(drawGesture)
            .reverseMask { path ?? .init() }
            .onKeyPress(.return) {
                debugPrint("ESC2")
                return .handled
            }
        
//        Text("Let's listen to keyboard events!")
//            .padding()
//            .onKeyPress(.return) {
//                /// Doesn't get called since the Text element isn't focused.
//                print("Return key pressed!")
//                return .handled
//            }
//        Image(systemName: "star.circle")
//            .resizable()
//            .scaledToFit()
//            .padding(400)
        
        path?.stroke(Color.white, lineWidth: 2)
    }
}
