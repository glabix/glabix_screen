//
//  ReverseMask.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI

extension View {
    @inlinable
    public func reverseMask<Mask: View>(
        alignment: Alignment = .center,
        @ViewBuilder _ mask: () -> Mask
    ) -> some View {
        self.mask {
            Rectangle()
                .overlay(alignment: alignment) {
                    mask()
                        .blendMode(.destinationOut)
                }
        }
    }
}
