package com.ahmed.photogallery.model

data class CropConfig(
    val left: Float = 0f,    // normalized 0..1
    val top: Float = 0f,
    val right: Float = 1f,
    val bottom: Float = 1f,
    val angle: Float = 0f,   // straighten degrees, -45..45
    val aspectRatio: AspectRatio = AspectRatio.FREE
) {
    val isDefault: Boolean
        get() = left == 0f && top == 0f && right == 1f && bottom == 1f && angle == 0f
}

enum class AspectRatio(val label: String, val ratio: Float) {
    FREE("Free", 0f),
    ORIGINAL("Original", -1f),
    SQUARE("1:1", 1f),
    FOUR_THREE("4:3", 4f / 3f),
    THREE_FOUR("3:4", 3f / 4f),
    SIXTEEN_NINE("16:9", 16f / 9f),
    NINE_SIXTEEN("9:16", 9f / 16f)
}
