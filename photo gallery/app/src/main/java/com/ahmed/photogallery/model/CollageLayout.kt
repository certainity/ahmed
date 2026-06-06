package com.ahmed.photogallery.model

import android.graphics.RectF

data class CollageLayout(val id: String, val name: String, val cells: List<RectF>) {
    companion object {
        val ALL = listOf(
            CollageLayout("2h", "Side by Side", listOf(
                RectF(0f, 0f, 0.5f, 1f),
                RectF(0.5f, 0f, 1f, 1f)
            )),
            CollageLayout("2v", "Stacked", listOf(
                RectF(0f, 0f, 1f, 0.5f),
                RectF(0f, 0.5f, 1f, 1f)
            )),
            CollageLayout("3l", "Big Left", listOf(
                RectF(0f, 0f, 0.6f, 1f),
                RectF(0.6f, 0f, 1f, 0.5f),
                RectF(0.6f, 0.5f, 1f, 1f)
            )),
            CollageLayout("3r", "Big Right", listOf(
                RectF(0f, 0f, 0.4f, 0.5f),
                RectF(0f, 0.5f, 0.4f, 1f),
                RectF(0.4f, 0f, 1f, 1f)
            )),
            CollageLayout("3t", "Big Top", listOf(
                RectF(0f, 0f, 1f, 0.6f),
                RectF(0f, 0.6f, 0.5f, 1f),
                RectF(0.5f, 0.6f, 1f, 1f)
            )),
            CollageLayout("4g", "2×2 Grid", listOf(
                RectF(0f, 0f, 0.5f, 0.5f),
                RectF(0.5f, 0f, 1f, 0.5f),
                RectF(0f, 0.5f, 0.5f, 1f),
                RectF(0.5f, 0.5f, 1f, 1f)
            )),
            CollageLayout("4l", "Big Left 4", listOf(
                RectF(0f, 0f, 0.6f, 1f),
                RectF(0.6f, 0f, 1f, 1f / 3f),
                RectF(0.6f, 1f / 3f, 1f, 2f / 3f),
                RectF(0.6f, 2f / 3f, 1f, 1f)
            )),
            CollageLayout("4r", "Big Right 4", listOf(
                RectF(0f, 0f, 0.4f, 1f / 3f),
                RectF(0f, 1f / 3f, 0.4f, 2f / 3f),
                RectF(0f, 2f / 3f, 0.4f, 1f),
                RectF(0.4f, 0f, 1f, 1f)
            ))
        )
    }
}
