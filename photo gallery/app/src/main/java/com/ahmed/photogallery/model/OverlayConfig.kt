package com.ahmed.photogallery.model

enum class OverlayType(val label: String) {
    NONE("None"),
    SUNSET("Sunset"),
    NEON("Neon"),
    GOLDEN("Golden"),
    OCEAN("Ocean"),
    DUSK("Dusk"),
    ROSE("Rose")
}

data class OverlayConfig(
    val type: OverlayType = OverlayType.NONE,
    val intensity: Float = 0.5f
)
