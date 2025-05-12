//
//  CameraView.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

struct CameraView: View {
    
    @Binding var image: CGImage?
    
    var body: some View {
//        GeometryReader { geometry in
            if let image = image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
//                    .scaledToFit()
                    .clipShape(.circle)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
//                    .frame(width: geometry.size.width,
//                           height: geometry.size.height)
            } else {
                ContentUnavailableView("No camera feed", systemImage: "xmark.circle.fill")
//                    .frame(width: geometry.size.width,
//                           height: geometry.size.height)
            }
//        }
    }
    
}
