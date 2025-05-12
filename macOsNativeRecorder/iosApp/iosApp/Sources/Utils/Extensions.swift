//
//  Extensions.swift
//  iosApp
//
//  Created by Pavel Feklistov on 22.04.2025.
//  Copyright © 2025 orgName. All rights reserved.
//

import Foundation

extension String {
    func nullIfEmpty() -> String? {
        return isEmpty ? nil : self
    }
}
