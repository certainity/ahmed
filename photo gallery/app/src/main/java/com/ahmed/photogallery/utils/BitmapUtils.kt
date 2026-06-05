package com.ahmed.photogallery.utils

import android.content.ContentValues
import android.content.Context
import android.graphics.*
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.ahmed.photogallery.engine.EditState
import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.CropConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.absoluteValue
import kotlin.random.Random

object BitmapUtils {

    // ── Full render pipeline ───────────────────────────────────────────────────

    fun renderPipeline(src: Bitmap, state: EditState): Bitmap {
        var bmp = src

        // 1. Geometric transforms (rotate, flip, straighten angle)
        val needsTransform = state.rotation != 0 || state.flipHorizontal ||
            state.flipVertical || state.cropConfig.angle != 0f
        if (needsTransform) {
            bmp = applyTransforms(bmp, state.rotation, state.flipHorizontal,
                state.flipVertical, state.cropConfig.angle)
        }

        // 2. Crop
        if (!state.cropConfig.isDefault) bmp = applyCrop(bmp, state.cropConfig)

        // 3. Tone / color adjustments
        if (!state.adjustments.isIdentity) bmp = applyAdjustments(bmp, state.adjustments)

        // 4. Preset filter blended at chosen intensity
        state.filter?.colorMatrix?.let { cm ->
            val filtered = applyColorMatrix(bmp, cm)
            bmp = if (state.filterIntensity >= 0.99f) filtered
                  else blendBitmaps(bmp, filtered, state.filterIntensity)
        }

        return bmp
    }

    // ── Geometric operations ───────────────────────────────────────────────────

    fun applyTransforms(src: Bitmap, rotation: Int, flipH: Boolean, flipV: Boolean,
                        straightenAngle: Float = 0f): Bitmap {
        val m = Matrix()
        if (rotation != 0) m.postRotate(rotation.toFloat())
        if (flipH) m.postScale(-1f, 1f, src.width / 2f, src.height / 2f)
        if (flipV) m.postScale(1f, -1f, src.width / 2f, src.height / 2f)
        if (straightenAngle != 0f)
            m.postRotate(straightenAngle, src.width / 2f, src.height / 2f)
        return if (m.isIdentity) src
               else Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    fun applyCrop(src: Bitmap, cfg: CropConfig): Bitmap {
        val l = (cfg.left  * src.width ).toInt().coerceIn(0, src.width  - 1)
        val t = (cfg.top   * src.height).toInt().coerceIn(0, src.height - 1)
        val r = (cfg.right * src.width ).toInt().coerceIn(l + 1, src.width)
        val b = (cfg.bottom* src.height).toInt().coerceIn(t + 1, src.height)
        return Bitmap.createBitmap(src, l, t, r - l, b - t)
    }

    // Legacy rotate/flip for Transform panel (no-state path)
    fun rotate(src: Bitmap, degrees: Float): Bitmap {
        val m = Matrix().also { it.postRotate(degrees) }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    fun flip(src: Bitmap, horizontal: Boolean): Bitmap {
        val cx = src.width / 2f; val cy = src.height / 2f
        val m = Matrix().also {
            if (horizontal) it.postScale(-1f, 1f, cx, cy)
            else it.postScale(1f, -1f, cx, cy)
        }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    // ── Adjustments ───────────────────────────────────────────────────────────

    fun applyAdjustments(src: Bitmap, adj: Adjustments): Bitmap {
        val cm = ColorMatrix()

        // Exposure — multiplicative scale (affects perceived f-stop)
        if (adj.exposure != 0f) {
            val s = if (adj.exposure > 0f) 1f + adj.exposure / 50f else 1f + adj.exposure / 100f
            cm.postConcat(scaleMatrix(s))
        }

        // Brightness — additive offset
        if (adj.brightness != 0f) {
            val b = adj.brightness * 255f / 100f
            cm.postConcat(ColorMatrix(floatArrayOf(
                1f,0f,0f,0f,b,  0f,1f,0f,0f,b,  0f,0f,1f,0f,b,  0f,0f,0f,1f,0f
            )))
        }

        // Contrast — scale around midpoint 128
        if (adj.contrast != 0f) {
            val s = 1f + adj.contrast / 100f
            val o = (1f - s) * 128f
            cm.postConcat(ColorMatrix(floatArrayOf(
                s,0f,0f,0f,o,  0f,s,0f,0f,o,  0f,0f,s,0f,o,  0f,0f,0f,1f,0f
            )))
        }

        // Highlights — brighten/darken the bright range
        if (adj.highlights != 0f) {
            val h = adj.highlights / 100f
            // Positive h → boost the top of the tonal range; negative → crush it.
            // Approximated by a scale biased with a dark-anchored offset.
            val s = 1f + h * 0.4f
            val o = -h * 50f
            cm.postConcat(ColorMatrix(floatArrayOf(
                s,0f,0f,0f,o,  0f,s,0f,0f,o,  0f,0f,s,0f,o,  0f,0f,0f,1f,0f
            )))
        }

        // Shadows — lift or crush the dark range
        if (adj.shadows != 0f) {
            val sv = adj.shadows / 100f
            val lift = sv * 45f
            val s = 1f - sv * 0.15f
            cm.postConcat(ColorMatrix(floatArrayOf(
                s,0f,0f,0f,lift,  0f,s,0f,0f,lift,  0f,0f,s,0f,lift,  0f,0f,0f,1f,0f
            )))
        }

        // Saturation
        if (adj.saturation != 0f) {
            val sat = ColorMatrix()
            sat.setSaturation((1f + adj.saturation / 100f).coerceIn(0f, 3f))
            cm.postConcat(sat)
        }

        // Vibrance (smart saturation — less effect on already-vivid colors)
        // Approximation: partial saturation boost at lower intensity than saturation
        if (adj.vibrance != 0f) {
            val vib = ColorMatrix()
            vib.setSaturation((1f + adj.vibrance / 200f).coerceIn(0f, 2f))
            cm.postConcat(vib)
        }

        // Temperature (warm/cool)
        if (adj.temperature != 0f) {
            val t = adj.temperature / 100f
            cm.postConcat(ColorMatrix(floatArrayOf(
                1f + t*0.22f, 0f, 0f, 0f, t*12f,
                0f, 1f + t*0.04f, 0f, 0f, 0f,
                0f, 0f, 1f - t*0.22f, 0f, -t*12f,
                0f, 0f, 0f, 1f, 0f
            )))
        }

        // Tint (green ↔ magenta)
        if (adj.tint != 0f) {
            val ti = adj.tint / 100f
            cm.postConcat(ColorMatrix(floatArrayOf(
                1f + ti.absoluteValue*0.08f, 0f, 0f, 0f, ti*8f,
                0f, 1f - ti.absoluteValue*0.06f, 0f, 0f, -ti.absoluteValue*4f,
                0f, 0f, 1f + ti.absoluteValue*0.08f, 0f, ti*8f,
                0f, 0f, 0f, 1f, 0f
            )))
        }

        // Fade — lift blacks and compress whites (matte / film look)
        if (adj.fade != 0f) {
            val f = adj.fade / 100f
            val s2 = 1f - f * 0.22f
            val lift2 = f * 38f
            cm.postConcat(ColorMatrix(floatArrayOf(
                s2, 0f, 0f, 0f, lift2,
                0f, s2, 0f, 0f, lift2,
                0f, 0f, s2, 0f, lift2,
                0f, 0f, 0f, 1f, 0f
            )))
        }

        // Apply all ColorMatrix ops in one GPU-friendly pass
        var result = applyColorMatrix(src, cm)

        // Per-pixel post-processing (can't be done with ColorMatrix)
        if (adj.sharpness > 0f) result = applySharpness(result, adj.sharpness / 100f)
        if (adj.vignette   > 0f) result = applyVignette(result, adj.vignette   / 100f)
        if (adj.grain      > 0f) result = applyGrain(result, adj.grain        / 100f)

        return result
    }

    // ── ColorMatrix helpers ────────────────────────────────────────────────────

    fun applyColorMatrix(src: Bitmap, cm: ColorMatrix): Bitmap {
        val dst = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        Canvas(dst).drawBitmap(src, 0f, 0f, Paint().apply {
            colorFilter = ColorMatrixColorFilter(cm)
        })
        return dst
    }

    private fun scaleMatrix(s: Float) = ColorMatrix(floatArrayOf(
        s,0f,0f,0f,0f,  0f,s,0f,0f,0f,  0f,0f,s,0f,0f,  0f,0f,0f,1f,0f
    ))

    // ── Per-pixel effects ──────────────────────────────────────────────────────

    private fun applySharpness(src: Bitmap, strength: Float): Bitmap {
        // Unsharp-mask approximation via 3×3 convolution kernel
        val k = strength.coerceIn(0f, 1f)
        val center = 1f + 4f * k
        val kernel = floatArrayOf(
            0f, -k, 0f,
            -k, center, -k,
            0f, -k, 0f
        )
        return applyConvolution3x3(src, kernel)
    }

    private fun applyConvolution3x3(src: Bitmap, kernel: FloatArray): Bitmap {
        val w = src.width; val h = src.height
        val pixels = IntArray(w * h)
        val out    = IntArray(w * h)
        src.getPixels(pixels, 0, w, 0, 0, w, h)
        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                var r = 0f; var g = 0f; var b = 0f
                for (ky in -1..1) for (kx in -1..1) {
                    val p = pixels[(y + ky) * w + (x + kx)]
                    val kv = kernel[(ky + 1) * 3 + (kx + 1)]
                    r += Color.red(p) * kv
                    g += Color.green(p) * kv
                    b += Color.blue(p) * kv
                }
                out[y * w + x] = Color.argb(
                    Color.alpha(pixels[y * w + x]),
                    r.toInt().coerceIn(0, 255),
                    g.toInt().coerceIn(0, 255),
                    b.toInt().coerceIn(0, 255)
                )
            }
        }
        // copy edge rows/columns unchanged
        for (x in 0 until w) { out[x] = pixels[x]; out[(h-1)*w+x] = pixels[(h-1)*w+x] }
        for (y in 0 until h) { out[y*w] = pixels[y*w]; out[y*w+w-1] = pixels[y*w+w-1] }
        val dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        dst.setPixels(out, 0, w, 0, 0, w, h)
        return dst
    }

    private fun applyVignette(src: Bitmap, strength: Float): Bitmap {
        val dst = src.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(dst)
        val cx = src.width / 2f; val cy = src.height / 2f
        val radius = maxOf(cx, cy) * 1.45f
        val shader = RadialGradient(cx, cy, radius,
            intArrayOf(Color.TRANSPARENT, Color.TRANSPARENT, Color.BLACK),
            floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, src.width.toFloat(), src.height.toFloat(),
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.shader = shader
                alpha = (strength * 210).toInt().coerceIn(0, 255)
            })
        return dst
    }

    private fun applyGrain(src: Bitmap, strength: Float): Bitmap {
        val dst = src.copy(Bitmap.Config.ARGB_8888, true)
        val pixels = IntArray(dst.width * dst.height)
        dst.getPixels(pixels, 0, dst.width, 0, 0, dst.width, dst.height)
        val amp = (strength * 35).toInt().coerceAtLeast(1)
        val rng = Random(System.currentTimeMillis())
        for (i in pixels.indices) {
            val n = rng.nextInt(amp * 2 + 1) - amp
            pixels[i] = Color.argb(
                Color.alpha(pixels[i]),
                (Color.red  (pixels[i]) + n).coerceIn(0, 255),
                (Color.green(pixels[i]) + n).coerceIn(0, 255),
                (Color.blue (pixels[i]) + n).coerceIn(0, 255)
            )
        }
        dst.setPixels(pixels, 0, dst.width, 0, 0, dst.width, dst.height)
        return dst
    }

    // ── Blend ─────────────────────────────────────────────────────────────────

    fun blendBitmaps(base: Bitmap, overlay: Bitmap, alpha: Float): Bitmap {
        val dst = base.copy(Bitmap.Config.ARGB_8888, true)
        Canvas(dst).drawBitmap(overlay, 0f, 0f, Paint().apply {
            this.alpha = (alpha * 255).toInt().coerceIn(0, 255)
        })
        return dst
    }

    // ── Save to gallery ────────────────────────────────────────────────────────

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
