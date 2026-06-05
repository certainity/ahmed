package com.ahmed.photogallery.utils

import android.content.ContentValues
import android.content.Context
import android.graphics.*
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object BitmapUtils {

    fun applyColorMatrix(src: Bitmap, cm: ColorMatrix): Bitmap {
        val dst = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        Canvas(dst).drawBitmap(src, 0f, 0f, Paint().apply {
            colorFilter = ColorMatrixColorFilter(cm)
        })
        return dst
    }

    fun applyAdjustments(
        src: Bitmap,
        brightness: Float = 0f,   // -100 .. 100
        contrast: Float = 1f,     // 0.2 .. 2.0
        saturation: Float = 1f,   // 0 .. 2
        warmth: Float = 0f        // -1 .. 1
    ): Bitmap {
        val cm = ColorMatrix()

        val satMat = ColorMatrix().also { it.setSaturation(saturation) }
        cm.postConcat(satMat)

        val t = (1f - contrast) * 128f + brightness
        cm.postConcat(ColorMatrix(floatArrayOf(
            contrast, 0f, 0f, 0f, t,
            0f, contrast, 0f, 0f, t,
            0f, 0f, contrast, 0f, t,
            0f, 0f, 0f, 1f, 0f
        )))

        if (warmth != 0f) {
            cm.postConcat(ColorMatrix(floatArrayOf(
                1f + warmth * 0.22f, 0f, 0f, 0f, warmth * 12f,
                0f, 1f + warmth * 0.04f, 0f, 0f, warmth * 4f,
                0f, 0f, 1f - warmth * 0.22f, 0f, -warmth * 12f,
                0f, 0f, 0f, 1f, 0f
            )))
        }

        return applyColorMatrix(src, cm)
    }

    fun rotate(src: Bitmap, degrees: Float): Bitmap {
        val m = Matrix().also { it.postRotate(degrees) }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    fun flip(src: Bitmap, horizontal: Boolean): Bitmap {
        val m = Matrix().also {
            if (horizontal) it.postScale(-1f, 1f, src.width / 2f, src.height / 2f)
            else it.postScale(1f, -1f, src.width / 2f, src.height / 2f)
        }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    suspend fun saveToGallery(context: Context, bitmap: Bitmap, name: String): Uri? =
        withContext(Dispatchers.IO) {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "$name.jpg")
                put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/PolishGallery")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }
            val uri = context.contentResolver.insert(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
            ) ?: return@withContext null

            runCatching {
                context.contentResolver.openOutputStream(uri)!!.use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear()
                    values.put(MediaStore.Images.Media.IS_PENDING, 0)
                    context.contentResolver.update(uri, values, null, null)
                }
                uri
            }.getOrElse {
                context.contentResolver.delete(uri, null, null)
                null
            }
        }
}
