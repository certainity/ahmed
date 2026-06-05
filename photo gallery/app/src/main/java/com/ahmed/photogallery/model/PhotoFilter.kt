package com.ahmed.photogallery.model

import android.graphics.ColorMatrix

data class PhotoFilter(
    val name: String,
    val colorMatrix: ColorMatrix?
)

object Filters {
    fun getAll(): List<PhotoFilter> = listOf(
        PhotoFilter("Normal", null),
        PhotoFilter("Vivid", vivid()),
        PhotoFilter("Cool", cool()),
        PhotoFilter("Warm", warm()),
        PhotoFilter("Fade", fade()),
        PhotoFilter("B&W", grayscale()),
        PhotoFilter("Sepia", sepia()),
        PhotoFilter("Vintage", vintage()),
        PhotoFilter("Cinema", cinema()),
        PhotoFilter("Matte", matte())
    )

    private fun vivid() = ColorMatrix().also { m ->
        val sat = ColorMatrix().also { it.setSaturation(1.8f) }
        val contrast = ColorMatrix(floatArrayOf(
            1.2f, 0f, 0f, 0f, -15f,
            0f, 1.2f, 0f, 0f, -15f,
            0f, 0f, 1.2f, 0f, -15f,
            0f, 0f, 0f, 1f, 0f
        ))
        m.postConcat(sat)
        m.postConcat(contrast)
    }

    private fun cool() = ColorMatrix(floatArrayOf(
        0.82f, 0f, 0f, 0f, 0f,
        0f, 0.96f, 0f, 0f, 5f,
        0f, 0f, 1.25f, 0f, 12f,
        0f, 0f, 0f, 1f, 0f
    ))

    private fun warm() = ColorMatrix(floatArrayOf(
        1.25f, 0f, 0f, 0f, 12f,
        0f, 1.05f, 0f, 0f, 5f,
        0f, 0f, 0.78f, 0f, -12f,
        0f, 0f, 0f, 1f, 0f
    ))

    private fun fade() = ColorMatrix(floatArrayOf(
        0.78f, 0f, 0f, 0f, 35f,
        0f, 0.78f, 0f, 0f, 35f,
        0f, 0f, 0.78f, 0f, 35f,
        0f, 0f, 0f, 1f, 0f
    ))

    private fun grayscale() = ColorMatrix().also { it.setSaturation(0f) }

    private fun sepia() = ColorMatrix(floatArrayOf(
        0.393f, 0.769f, 0.189f, 0f, 0f,
        0.349f, 0.686f, 0.168f, 0f, 0f,
        0.272f, 0.534f, 0.131f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f
    ))

    private fun vintage() = ColorMatrix().also { m ->
        val s = sepia()
        val fade = ColorMatrix(floatArrayOf(
            0.88f, 0f, 0f, 0f, 22f,
            0f, 0.88f, 0f, 0f, 16f,
            0f, 0f, 0.88f, 0f, 10f,
            0f, 0f, 0f, 1f, 0f
        ))
        m.postConcat(s)
        m.postConcat(fade)
    }

    private fun cinema() = ColorMatrix(floatArrayOf(
        1.1f, 0f, 0.12f, 0f, 6f,
        0f, 1.02f, 0.08f, 0f, 0f,
        0.04f, 0.1f, 1.18f, 0f, -12f,
        0f, 0f, 0f, 1f, 0f
    ))

    private fun matte() = ColorMatrix(floatArrayOf(
        0.88f, 0f, 0f, 0f, 28f,
        0f, 0.84f, 0f, 0f, 32f,
        0f, 0f, 0.88f, 0f, 28f,
        0f, 0f, 0f, 1f, 0f
    ))
}
