package com.ahmed.photogallery.model

/**
 * Non-destructive adjustment parameters. All values default to the identity
 * (no effect). Bipolar values range -100..100; unipolar values 0..100.
 */
data class Adjustments(
    val brightness: Float = 0f,    // -100..100
    val exposure: Float = 0f,      // -100..100
    val contrast: Float = 0f,      // -100..100
    val highlights: Float = 0f,    // -100..100
    val shadows: Float = 0f,       // -100..100
    val saturation: Float = 0f,    // -100..100
    val vibrance: Float = 0f,      // -100..100
    val temperature: Float = 0f,   // -100..100  (warmth)
    val tint: Float = 0f,          // -100..100  (green <-> magenta)
    val sharpness: Float = 0f,     // 0..100
    val vignette: Float = 0f,      // 0..100
    val grain: Float = 0f,         // 0..100
    val fade: Float = 0f           // 0..100
) {
    val isIdentity: Boolean
        get() = brightness == 0f && exposure == 0f && contrast == 0f &&
            highlights == 0f && shadows == 0f && saturation == 0f &&
            vibrance == 0f && temperature == 0f && tint == 0f &&
            sharpness == 0f && vignette == 0f && grain == 0f && fade == 0f
}
