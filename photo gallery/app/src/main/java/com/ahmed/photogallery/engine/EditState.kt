package com.ahmed.photogallery.engine

import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.CropConfig
import com.ahmed.photogallery.model.FrameConfig
import com.ahmed.photogallery.model.OverlayConfig
import com.ahmed.photogallery.model.PhotoFilter
import com.ahmed.photogallery.model.TextLayer

/** Immutable snapshot of all non-destructive edit parameters. */
data class EditState(
    val adjustments: Adjustments = Adjustments(),
    val filter: PhotoFilter? = null,
    val filterIntensity: Float = 1f,
    val cropConfig: CropConfig = CropConfig(),
    val rotation: Int = 0,
    val flipHorizontal: Boolean = false,
    val flipVertical: Boolean = false,
    val overlayConfig: OverlayConfig = OverlayConfig(),
    val frameConfig: FrameConfig = FrameConfig(),
    val textLayers: List<TextLayer> = emptyList()
)
