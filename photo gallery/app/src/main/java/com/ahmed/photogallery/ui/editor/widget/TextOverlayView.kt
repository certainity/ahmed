package com.ahmed.photogallery.ui.editor.widget

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import com.ahmed.photogallery.R
import com.ahmed.photogallery.model.TextLayer
import kotlin.math.hypot

class TextOverlayView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    var layers: List<TextLayer> = emptyList()
        set(value) { field = value; invalidate() }

    var selectedId: Long = -1L
        set(value) { field = value; invalidate() }

    var onLayerSelected: ((Long) -> Unit)? = null
    var onLayerMoved: ((id: Long, nx: Float, ny: Float) -> Unit)? = null
    var onLayerMoveCommit: ((id: Long, beforeX: Float, beforeY: Float) -> Unit)? = null

    private var imageRect = RectF()

    fun setImageRect(rect: RectF) { imageRect = rect; invalidate() }

    private val selPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f
        pathEffect = DashPathEffect(floatArrayOf(10f, 5f), 0f)
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bgPaint   = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bounds    = Rect()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (imageRect.isEmpty) return

        layers.forEach { layer ->
            val sx = imageRect.left + layer.x * imageRect.width()
            val sy = imageRect.top  + layer.y * imageRect.height()
            val textPx = layer.sizeFraction * imageRect.width()

            textPaint.apply {
                color = layer.color
                textSize = textPx
                typeface = if (layer.bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            }
            textPaint.getTextBounds(layer.text, 0, layer.text.length, bounds)

            if (layer.hasBackground) {
                bgPaint.color = layer.bgColor
                canvas.drawRoundRect(
                    sx + bounds.left - 12f, sy + bounds.top - 8f,
                    sx + bounds.right + 12f, sy + bounds.bottom + 8f,
                    10f, 10f, bgPaint
                )
            }
            canvas.drawText(layer.text, sx, sy, textPaint)

            if (layer.id == selectedId) {
                selPaint.color = context.getColor(R.color.accent)
                canvas.drawRect(
                    sx + bounds.left - 16f, sy + bounds.top - 12f,
                    sx + bounds.right + 16f, sy + bounds.bottom + 12f,
                    selPaint
                )
            }
        }
    }

    // ── Touch / drag ──────────────────────────────────────────────────────────

    private var dragLayerId  = -1L
    private var dragStartX   = 0f
    private var dragStartY   = 0f
    private var layerBeforeX = 0f
    private var layerBeforeY = 0f

    override fun onTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val hit = findHit(ev.x, ev.y)
                if (hit != null) {
                    dragLayerId  = hit.id
                    dragStartX   = ev.x
                    dragStartY   = ev.y
                    layerBeforeX = hit.x
                    layerBeforeY = hit.y
                    onLayerSelected?.invoke(hit.id)
                } else {
                    dragLayerId = -1L
                    onLayerSelected?.invoke(-1L)
                }
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (dragLayerId != -1L && imageRect.width() > 0f) {
                    val dx = (ev.x - dragStartX) / imageRect.width()
                    val dy = (ev.y - dragStartY) / imageRect.height()
                    val nx = (layerBeforeX + dx).coerceIn(0f, 1f)
                    val ny = (layerBeforeY + dy).coerceIn(0f, 1f)
                    onLayerMoved?.invoke(dragLayerId, nx, ny)
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (dragLayerId != -1L) {
                    onLayerMoveCommit?.invoke(dragLayerId, layerBeforeX, layerBeforeY)
                    dragLayerId = -1L
                }
                return true
            }
        }
        return super.onTouchEvent(ev)
    }

    private fun findHit(sx: Float, sy: Float): TextLayer? {
        if (imageRect.isEmpty) return null
        return layers.minByOrNull { layer ->
            val lx = imageRect.left + layer.x * imageRect.width()
            val ly = imageRect.top  + layer.y * imageRect.height()
            hypot(sx - lx, sy - ly)
        }?.takeIf { layer ->
            val lx = imageRect.left + layer.x * imageRect.width()
            val ly = imageRect.top  + layer.y * imageRect.height()
            val hitRadius = (layer.sizeFraction * imageRect.width() * 2f).coerceAtLeast(60f)
            hypot(sx - lx, sy - ly) < hitRadius
        }
    }
}
