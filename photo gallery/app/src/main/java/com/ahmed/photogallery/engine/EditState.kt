package com.ahmed.photogallery.engine

import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.CropConfig
import com.ahmed.photogallery.model.PhotoFilter

/** Immutable snapshot of all non-destructive edit parameters. */
data class EditState(
    val adjustments: Adjustments = Adjustments(),
    val filter: PhotoFilter? = null,
    val filterIntensity: Float = 1f,   // 0..1
    val cropConfig: CropConfig = CropConfig(),
    val rotation: Int = 0,             // multiples of 90
    val flipHorizontal: Boolean = false,
    val flipVertical: Boolean = false
)
