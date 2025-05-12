//
//  CameraContentView.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

struct CameraContentView: View {
    @State private var currentDate = Date.now
    let timer = Timer.publish(every: 0.01, on: .main, in: .common).autoconnect()

    @ObservedObject var viewModel: CameraViewModel
    
    var body: some View {
//        let _ = currentDate.timeIntervalSince1970
        VStack {
            ZStack {
                CameraView(
                    image: $viewModel.currentFrame
                )
            }
            Text(">\(currentDate.timeIntervalSince1970)")
        }
        .onReceive(timer) { _ in
            currentDate = Date.now
        }
    }
}
