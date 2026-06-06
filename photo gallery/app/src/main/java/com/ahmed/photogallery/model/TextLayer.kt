package com.ahmed.photogallery.model

import android.graphics.Color

data class TextLayer(
    val id: Long = System.nanoTime(),
    val text: String = "",
    val x: Float = 0.5f,       // normalized 0-1 relative to image width
    val y: Float = 0.5f,       // normalized 0-1 relative to image height
    val sizeFraction: Float = 0.08f,  // fraction of image width
    val color: Int = Color.WHITE,
    val bold: Boolean = false,
    val hasBackground: Boolean = false,
    val bgColor: Int = 0x99000000.toInt()
)
