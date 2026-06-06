package com.ahmed.photogallery.model

enum class FrameType(val label: String) {
    NONE("None"),
    THIN_WHITE("White"),
    THICK_WHITE("Thick"),
    BLACK("Black"),
    POLAROID("Polaroid"),
    SHADOW("Shadow")
}

data class FrameConfig(
    val type: FrameType = FrameType.NONE,
    val thickness: Float = 0.06f
)
