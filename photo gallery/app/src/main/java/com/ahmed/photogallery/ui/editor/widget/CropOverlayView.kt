package com.ahmed.photogallery.ui.editor.widget

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Draws a draggable crop rectangle over the photo canvas.
 * Place this view on top of the photo ImageView inside a FrameLayout.
 *
 * The crop rect is expressed in VIEW coordinates.  The host activity
 * reads [getNormalizedCrop] to get 0..1 values relative to the image rect.
 */
class CropOverlayView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    // ── Configuration ─────────────────────────────────────────────────────────

    /** 0 = free, -1 = use original image ratio, >0 = locked ratio (w/h). */
    var aspectRatio: Float = 0f
        set(value) { field = value; enforceAspectRatio(); invalidate() }

    var onCropChanged: ((left: Float, top: Float, right: Float, bottom: Float) -> Unit)? = null

    // ── State ─────────────────────────────────────────────────────────────────

    /** The rect where the image is actually drawn (set by the host). */
    private val imageRect = RectF()

    /** Current crop rect in view coordinates. */
    private val crop = RectF()

    private val minSize get() = 80f * resources.displayMetrics.density

    // ── Paints ────────────────────────────────────────────────────────────────

    private val overlayPaint = Paint().apply {
        color = 0xBB000000.toInt()
        style = Paint.Style.FILL
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 2f * resources.displayMetrics.density
    }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x55FFFFFF
        style = Paint.Style.STROKE
        strokeWidth = 1f * resources.displayMetrics.density
    }
    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.FILL
    }

    private val handleSize = 10f * resources.displayMetrics.density
    private val touchSlop  = 28f * resources.displayMetrics.density

    // ── Touch ─────────────────────────────────────────────────────────────────

    private enum class DragMode { NONE, MOVE, TL, TR, BL, BR, T, B, L, R }
    private var dragMode = DragMode.NONE
    private var lastX = 0f; private var lastY = 0f

    // ── Init ──────────────────────────────────────────────────────────────────

    init { setWillNotDraw(false) }

    /** Call whenever the image rect changes (e.g. after layout). */
    fun setImageRect(rect: RectF) {
        imageRect.set(rect)
        crop.set(rect)
        enforceAspectRatio()
        invalidate()
    }

    /** Restore a previously saved crop (normalized 0..1 relative to imageRect). */
    fun restoreCrop(l: Float, t: Float, r: Float, b: Float) {
        crop.set(
            imageRect.left + l * imageRect.width(),
            imageRect.top  + t * imageRect.height(),
            imageRect.left + r * imageRect.width(),
            imageRect.top  + b * imageRect.height()
        )
        invalidate()
    }

    /** Returns the crop as normalized fractions of the image rect. */
    fun getNormalizedCrop(): FloatArray {
        val iw = imageRect.width().coerceAtLeast(1f)
        val ih = imageRect.height().coerceAtLeast(1f)
        return floatArrayOf(
            (crop.left   - imageRect.left) / iw,
            (crop.top    - imageRect.top ) / ih,
            (crop.right  - imageRect.left) / iw,
            (crop.bottom - imageRect.top ) / ih
        )
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    override fun onDraw(canvas: Canvas) {
        if (imageRect.isEmpty) return

        // Dark overlay around crop
        canvas.save()
        canvas.clipOutRect(crop)
        canvas.drawRect(imageRect, overlayPaint)
        canvas.restore()

        // Rule-of-thirds grid
        val thirdW = crop.width()  / 3f
        val thirdH = crop.height() / 3f
        for (i in 1..2) {
            canvas.drawLine(crop.left + thirdW * i, crop.top,
                            crop.left + thirdW * i, crop.bottom, gridPaint)
            canvas.drawLine(crop.left, crop.top + thirdH * i,
                            crop.right, crop.top + thirdH * i, gridPaint)
        }

        // Border
        canvas.drawRect(crop, borderPaint)

        // Corner handles
        val hs = handleSize
        // TL
        canvas.drawRect(crop.left - hs, crop.top - hs, crop.left + hs, crop.top + hs, handlePaint)
        // TR
        canvas.drawRect(crop.right - hs, crop.top - hs, crop.right + hs, crop.top + hs, handlePaint)
        // BL
        canvas.drawRect(crop.left - hs, crop.bottom - hs, crop.left + hs, crop.bottom + hs, handlePaint)
        // BR
        canvas.drawRect(crop.right - hs, crop.bottom - hs, crop.right + hs, crop.bottom + hs, handlePaint)

        // Edge midpoint handles
        val mx = (crop.left + crop.right)  / 2f
        val my = (crop.top  + crop.bottom) / 2f
        val hs2 = hs * 0.7f
        canvas.drawRect(mx - hs2, crop.top - hs2, mx + hs2, crop.top + hs2, handlePaint)
        canvas.drawRect(mx - hs2, crop.bottom - hs2, mx + hs2, crop.bottom + hs2, handlePaint)
        canvas.drawRect(crop.left - hs2, my - hs2, crop.left + hs2, my + hs2, handlePaint)
        canvas.drawRect(crop.right - hs2, my - hs2, crop.right + hs2, my + hs2, handlePaint)
    }

    // ── Touch handling ────────────────────────────────────────────────────────

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                dragMode = hitTest(event.x, event.y)
                lastX = event.x; lastY = event.y
                return dragMode != DragMode.NONE
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastX; val dy = event.y - lastY
                lastX = event.x; lastY = event.y
                drag(dx, dy)
                invalidate()
                notifyChanged()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                dragMode = DragMode.NONE
            }
        }
        return true
    }

    private fun hitTest(x: Float, y: Float): DragMode {
        val s = touchSlop
        val mx = (crop.left + crop.right)  / 2f
        val my = (crop.top  + crop.bottom) / 2f
        fun near(px: Float, py: Float) = abs(x - px) < s && abs(y - py) < s
        return when {
            near(crop.left,  crop.top)    -> DragMode.TL
            near(crop.right, crop.top)    -> DragMode.TR
            near(crop.left,  crop.bottom) -> DragMode.BL
            near(crop.right, crop.bottom) -> DragMode.BR
            near(mx,         crop.top)    -> DragMode.T
            near(mx,         crop.bottom) -> DragMode.B
            near(crop.left,  my)          -> DragMode.L
            near(crop.right, my)          -> DragMode.R
            crop.contains(x, y)           -> DragMode.MOVE
            else                          -> DragMode.NONE
        }
    }

    private fun drag(dx: Float, dy: Float) {
        val img = imageRect
        when (dragMode) {
            DragMode.MOVE -> {
                val newL = (crop.left  + dx).coerceIn(img.left, img.right  - crop.width())
                val newT = (crop.top   + dy).coerceIn(img.top,  img.bottom - crop.height())
                crop.offsetTo(newL, newT)
            }
            DragMode.TL -> resize(dLeft = dx, dTop = dy)
            DragMode.TR -> resize(dRight = dx, dTop = dy)
            DragMode.BL -> resize(dLeft = dx, dBottom = dy)
            DragMode.BR -> resize(dRight = dx, dBottom = dy)
            DragMode.T  -> resize(dTop = dy)
            DragMode.B  -> resize(dBottom = dy)
            DragMode.L  -> resize(dLeft = dx)
            DragMode.R  -> resize(dRight = dx)
            DragMode.NONE -> {}
        }
    }

    private fun resize(dLeft: Float = 0f, dTop: Float = 0f,
                       dRight: Float = 0f, dBottom: Float = 0f) {
        val img = imageRect
        var l = crop.left; var t = crop.top; var r = crop.right; var b = crop.bottom
        l = (l + dLeft ).coerceIn(img.left, r - minSize)
        t = (t + dTop  ).coerceIn(img.top,  b - minSize)
        r = (r + dRight).coerceIn(l + minSize, img.right)
        b = (b + dBottom).coerceIn(t + minSize, img.bottom)
        crop.set(l, t, r, b)
        if (aspectRatio > 0) enforceAspectRatio()
    }

    private fun enforceAspectRatio() {
        if (aspectRatio <= 0f || crop.isEmpty) return
        val cx = crop.centerX(); val cy = crop.centerY()
        val w = max(crop.width(), crop.height() * aspectRatio)
        val h = w / aspectRatio
        // Fit inside imageRect
        val fw = min(w, imageRect.width()); val fh = fw / aspectRatio
        crop.set(cx - fw / 2f, cy - fh / 2f, cx + fw / 2f, cy + fh / 2f)
        // Clamp
        if (crop.left < imageRect.left) crop.offset(imageRect.left - crop.left, 0f)
        if (crop.top  < imageRect.top)  crop.offset(0f, imageRect.top - crop.top)
        if (crop.right  > imageRect.right)  crop.offset(imageRect.right  - crop.right,  0f)
        if (crop.bottom > imageRect.bottom) crop.offset(0f, imageRect.bottom - crop.bottom)
    }

    private fun notifyChanged() {
        val n = getNormalizedCrop()
        onCropChanged?.invoke(n[0], n[1], n[2], n[3])
    }
}
