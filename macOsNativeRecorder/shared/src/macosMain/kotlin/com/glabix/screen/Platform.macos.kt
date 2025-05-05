package com.glabix.screen

class IOSPlatform: Platform {
    override val name: String = "macos from kotlin"
}

actual fun getPlatform(): Platform = IOSPlatform()