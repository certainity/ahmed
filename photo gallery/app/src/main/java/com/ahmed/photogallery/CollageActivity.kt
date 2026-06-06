package com.ahmed.photogallery

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.ahmed.photogallery.databinding.ActivityCollageBinding
import com.ahmed.photogallery.model.CollageLayout
import com.ahmed.photogallery.utils.BitmapUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CollageActivity : AppCompatActivity() {

    private lateinit var b: ActivityCollageBinding
    private var bitmaps = listOf<Bitmap>()
    private var selectedLayout = CollageLayout.ALL.first()

    companion object {
        private const val EXTRA_URIS = "extra_uris"

        fun start(context: Context, uris: List<Uri>) {
            context.startActivity(Intent(context, CollageActivity::class.java).apply {
                putParcelableArrayListExtra(EXTRA_URIS, ArrayList(uris))
            })
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityCollageBinding.inflate(layoutInflater)
        setContentView(b.root)

        val uris = intent.getParcelableArrayListExtra<Uri>(EXTRA_URIS)
        if (uris.isNullOrEmpty()) { finish(); return }

        b.btnBack.setOnClickListener { finish() }
        b.btnSaveCollage.setOnClickListener { saveCollage() }

        loadBitmaps(uris)
    }

    private fun loadBitmaps(uris: List<Uri>) {
        b.progressCollage.visibility = View.VISIBLE
        lifecycleScope.launch {
            bitmaps = withContext(Dispatchers.IO) {
                uris.mapNotNull { uri ->
                    runCatching {
                        contentResolver.openInputStream(uri)?.use { stream ->
                            val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
                            BitmapFactory.decodeStream(stream, null, opts)
                        }
                    }.getOrNull()
                }
            }
            if (bitmaps.isEmpty()) { finish(); return@launch }
            b.progressCollage.visibility = View.GONE
            buildLayoutPicker(uris.size)
            renderPreview()
        }
    }

    private fun buildLayoutPicker(photoCount: Int) {
        val dp = resources.displayMetrics.density
        val size   = (60 * dp).toInt()
        val margin = (8 * dp).toInt()

        CollageLayout.ALL.forEach { layout ->
            val thumb = LayoutThumbView(this, layout).apply {
                layoutParams = LinearLayout.LayoutParams(size, size).apply { marginEnd = margin }
                setOnClickListener {
                    selectedLayout = layout
                    refreshThumbStates()
                    renderPreview()
                }
            }
            b.layoutPickerContainer.addView(thumb)
        }

        // Default: pick the first layout whose cell count matches photo count, else first
        selectedLayout = CollageLayout.ALL.firstOrNull { it.cells.size == photoCount }
            ?: CollageLayout.ALL.first()
        refreshThumbStates()
    }

    private fun refreshThumbStates() {
        for (i in 0 until b.layoutPickerContainer.childCount) {
            val v = b.layoutPickerContainer.getChildAt(i) as? LayoutThumbView ?: continue
            v.isSelected = v.layout == selectedLayout
            v.invalidate()
        }
    }

    private fun renderPreview() {
        if (bitmaps.isEmpty()) return
        lifecycleScope.launch {
            val result = withContext(Dispatchers.Default) {
                BitmapUtils.renderCollage(bitmaps, selectedLayout)
            }
            b.ivCollagePreview.setImageBitmap(result)
        }
    }

    private fun saveCollage() {
        if (bitmaps.isEmpty()) return
        b.btnSaveCollage.isEnabled = false
        lifecycleScope.launch {
            val result = withContext(Dispatchers.Default) {
                BitmapUtils.renderCollage(bitmaps, selectedLayout, 1440)
            }
            val uri = BitmapUtils.saveToGallery(
                this@CollageActivity, result, "Collage_${System.currentTimeMillis()}"
            )
            b.btnSaveCollage.isEnabled = true
            if (uri != null) {
                Toast.makeText(this@CollageActivity, getString(R.string.saved), Toast.LENGTH_SHORT).show()
                finish()
            } else {
                Toast.makeText(this@CollageActivity, getString(R.string.save_failed), Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ── Layout thumbnail view ──────────────────────────────────────────────────

    private inner class LayoutThumbView(context: Context, val layout: CollageLayout) : View(context) {
        private val bgPaint   = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF2A3340.toInt() }
        private val bgSelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1E6BFF.toInt() }
        private val cellPaint  = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1E2A3A.toInt() }
        private val cellSelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xBB2BD9FE.toInt() }
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF2BD9FE.toInt()
            style = Paint.Style.STROKE
            strokeWidth = 1.5f
        }
        private val tmp = RectF()

        override fun onDraw(canvas: Canvas) {
            val w = width.toFloat()
            val h = height.toFloat()
            canvas.drawRoundRect(0f, 0f, w, h, 8f, 8f,
                if (isSelected) bgSelPaint else bgPaint)
            layout.cells.forEach { cell ->
                tmp.set(cell.left * w + 2f, cell.top * h + 2f, cell.right * w - 2f, cell.bottom * h - 2f)
                canvas.drawRoundRect(tmp, 3f, 3f, if (isSelected) cellSelPaint else cellPaint)
            }
            if (isSelected) {
                canvas.drawRoundRect(1f, 1f, w - 1f, h - 1f, 8f, 8f, strokePaint)
            }
        }
    }
}
