package com.ahmed.photogallery.engine

import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.CropConfig
import com.ahmed.photogallery.model.FrameConfig
import com.ahmed.photogallery.model.OverlayConfig
import com.ahmed.photogallery.model.PhotoFilter

/** A reversible edit that can be pushed onto the undo stack. */
interface EditOperation {
    fun apply(state: EditState): EditState
    fun revert(state: EditState): EditState
}

data class AdjustOperation(val before: Adjustments, val after: Adjustments) : EditOperation {
    override fun apply(s: EditState) = s.copy(adjustments = after)
    override fun revert(s: EditState) = s.copy(adjustments = before)
}

data class FilterOperation(
    val beforeFilter: PhotoFilter?,
    val beforeIntensity: Float,
    val afterFilter: PhotoFilter?,
    val afterIntensity: Float
) : EditOperation {
    override fun apply(s: EditState) = s.copy(filter = afterFilter, filterIntensity = afterIntensity)
    override fun revert(s: EditState) = s.copy(filter = beforeFilter, filterIntensity = beforeIntensity)
}

data class CropOperation(val before: CropConfig, val after: CropConfig) : EditOperation {
    override fun apply(s: EditState) = s.copy(cropConfig = after)
    override fun revert(s: EditState) = s.copy(cropConfig = before)
}

data class TransformOperation(
    val beforeRot: Int, val beforeFlipH: Boolean, val beforeFlipV: Boolean,
    val afterRot: Int,  val afterFlipH: Boolean,  val afterFlipV: Boolean
) : EditOperation {
    override fun apply(s: EditState) = s.copy(rotation = afterRot, flipHorizontal = afterFlipH, flipVertical = afterFlipV)
    override fun revert(s: EditState) = s.copy(rotation = beforeRot, flipHorizontal = beforeFlipH, flipVertical = beforeFlipV)
}

data class OverlayOperation(val before: OverlayConfig, val after: OverlayConfig) : EditOperation {
    override fun apply(s: EditState) = s.copy(overlayConfig = after)
    override fun revert(s: EditState) = s.copy(overlayConfig = before)
}

data class FrameOperation(val before: FrameConfig, val after: FrameConfig) : EditOperation {
    override fun apply(s: EditState) = s.copy(frameConfig = after)
    override fun revert(s: EditState) = s.copy(frameConfig = before)
}
