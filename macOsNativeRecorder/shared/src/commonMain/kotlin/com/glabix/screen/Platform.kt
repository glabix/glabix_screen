package com.glabix.screen

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform