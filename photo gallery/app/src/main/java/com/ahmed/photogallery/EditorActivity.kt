package com.ahmed.photogallery

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.SeekBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.ahmed.photogallery.adapter.FilterAdapter
import com.ahmed.photogallery.databinding.ActivityEditorBinding
import com.ahmed.photogallery.model.Filters
import com.ahmed.photogallery.model.PhotoFilter
import com.ahmed.photogallery.utils.BitmapUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class EditorActivity : AppCompatActivity() {

    private lateinit var b: ActivityEditorBinding

    private var original: Bitmap? = null
    private var working: Bitmap? = null   // original with current transforms applied
    private var displayed: Bitmap? = null // working + filter + adjustments
    private var thumb: Bitmap? = null

    private var currentFilter: PhotoFilter? = null
    private var brightness = 0f
    private var contrast = 1f
    private var saturation = 1f
    private var warmth = 0f

    companion object {
        const val EXTRA_URI = "extra_uri"
        private const val THUMB_SIZE = 120
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityEditorBinding.inflate(layoutInflater)
        setContentView(b.root)

        val uriStr = intent.getStringExtra(EXTRA_URI) ?: run { finish(); return }
        loadBitmap(Uri.parse(uriStr))
        setupTabs()
        setupSeekBars()
        setupButtons()
    }

    // ── Load ──────────────────────────────────────────────────────────────────

    private fun loadBitmap(uri: Uri) {
        lifecycleScope.launch {
            b.loading.visibility = View.VISIBLE
            val bmp = withContext(Dispatchers.IO) {
                runCatching {
                    contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
                }.getOrNull()
            }
            if (bmp == null) { finish(); return@launch }
            original = bmp
            working = bmp
            thumb = Bitmap.createScaledBitmap(bmp, THUMB_SIZE, THUMB_SIZE, true)
            b.ivPhoto.setImageBitmap(bmp)
            b.loading.visibility = View.GONE
            setupFilterList()
        }
    }

    // ── Filters ───────────────────────────────────────────────────────────────

    private fun setupFilterList() {
        val adapter = FilterAdapter(Filters.getAll(), thumb) { filter ->
            currentFilter = filter
            applyEdits()
        }
        b.rvFilters.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        b.rvFilters.adapter = adapter
    }

    // ── Tabs ──────────────────────────────────────────────────────────────────

    private fun setupTabs() {
        val tabs = listOf(b.btnFilter, b.btnAdjust, b.btnTransform)
        val panels = listOf(b.rvFilters, b.panelAdjust, b.panelTransform)

        fun select(idx: Int) {
            tabs.forEachIndexed { i, tv ->
                tv.alpha = if (i == idx) 1f else 0.45f
            }
            panels.forEachIndexed { i, panel ->
                panel.visibility = if (i == idx) View.VISIBLE else View.GONE
            }
        }

        b.btnFilter.setOnClickListener { select(0) }
        b.btnAdjust.setOnClickListener { select(1) }
        b.btnTransform.setOnClickListener { select(2) }
        select(0)
    }

    // ── Seekbars ──────────────────────────────────────────────────────────────

    private fun setupSeekBars() {
        b.seekBrightness.progress = 50
        b.seekContrast.progress = 50
        b.seekSaturation.progress = 50
        b.seekWarmth.progress = 50

        b.seekBrightness.setOnSeekBarChangeListener(onSeek { p ->
            brightness = lerp(p, -100f, 100f)
            b.valBrightness.text = brightness.toInt().toString()
            applyEdits()
        })
        b.seekContrast.setOnSeekBarChangeListener(onSeek { p ->
            contrast = lerp(p, 0.2f, 2f)
            b.valContrast.text = ((contrast - 1f) * 100).toInt().toString()
            applyEdits()
        })
        b.seekSaturation.setOnSeekBarChangeListener(onSeek { p ->
            saturation = lerp(p, 0f, 2f)
            b.valSaturation.text = ((saturation - 1f) * 100).toInt().toString()
            applyEdits()
        })
        b.seekWarmth.setOnSeekBarChangeListener(onSeek { p ->
            warmth = lerp(p, -1f, 1f)
            b.valWarmth.text = (warmth * 100).toInt().toString()
            applyEdits()
        })
    }

    private fun lerp(progress: Int, min: Float, max: Float) =
        min + (progress / 100f) * (max - min)

    private fun onSeek(block: (Int) -> Unit) = object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) { if (fromUser) block(p) }
        override fun onStartTrackingTouch(sb: SeekBar) {}
        override fun onStopTrackingTouch(sb: SeekBar) {}
    }

    // ── Apply edits ───────────────────────────────────────────────────────────

    private fun applyEdits() {
        val src = working ?: return
        lifecycleScope.launch {
            b.loading.visibility = View.VISIBLE
            val result = withContext(Dispatchers.Default) {
                var bmp = BitmapUtils.applyAdjustments(src, brightness, contrast, saturation, warmth)
                currentFilter?.colorMatrix?.let { bmp = BitmapUtils.applyColorMatrix(bmp, it) }
                bmp
            }
            displayed = result
            b.ivPhoto.setImageBitmap(result)
            b.loading.visibility = View.GONE
            b.tvHint.visibility = View.VISIBLE
        }
    }

    // ── Buttons ───────────────────────────────────────────────────────────────

    private fun setupButtons() {
        b.btnBack.setOnClickListener { finish() }

        b.btnReset.setOnClickListener {
            brightness = 0f; contrast = 1f; saturation = 1f; warmth = 0f
            b.seekBrightness.progress = 50; b.seekContrast.progress = 50
            b.seekSaturation.progress = 50; b.seekWarmth.progress = 50
            b.valBrightness.text = "0"; b.valContrast.text = "0"
            b.valSaturation.text = "0"; b.valWarmth.text = "0"
            currentFilter = null
            working = original
            b.ivPhoto.setImageBitmap(original)
            displayed = original
            setupFilterList()
        }

        b.btnSave.setOnClickListener { save() }

        b.btnRotate.setOnClickListener {
            val bmp = (displayed ?: working) ?: return@setOnClickListener
            val rotated = BitmapUtils.rotate(bmp, 90f)
            working = rotated; displayed = rotated
            b.ivPhoto.setImageBitmap(rotated)
        }

        b.btnFlipH.setOnClickListener {
            val bmp = (displayed ?: working) ?: return@setOnClickListener
            val flipped = BitmapUtils.flip(bmp, horizontal = true)
            working = flipped; displayed = flipped
            b.ivPhoto.setImageBitmap(flipped)
        }

        b.btnFlipV.setOnClickListener {
            val bmp = (displayed ?: working) ?: return@setOnClickListener
            val flipped = BitmapUtils.flip(bmp, horizontal = false)
            working = flipped; displayed = flipped
            b.ivPhoto.setImageBitmap(flipped)
        }

        // Long-press to compare with original; release to restore edit
        b.ivPhoto.setOnLongClickListener {
            b.ivPhoto.setImageBitmap(original)
            b.tvHint.visibility = View.GONE
            true
        }
        b.ivPhoto.setOnTouchListener { _, event ->
            if (event.action == android.view.MotionEvent.ACTION_UP ||
                event.action == android.view.MotionEvent.ACTION_CANCEL
            ) {
                val cur = displayed ?: working ?: original
                if (b.ivPhoto.drawable != null) b.ivPhoto.setImageBitmap(cur)
            }
            false
        }
    }

    private fun save() {
        val bmp = displayed ?: working ?: return
        lifecycleScope.launch {
            b.loading.visibility = View.VISIBLE
            val uri = BitmapUtils.saveToGallery(
                this@EditorActivity, bmp, "edited_${System.currentTimeMillis()}"
            )
            b.loading.visibility = View.GONE
            val msg = if (uri != null) "Saved to gallery!" else "Save failed"
            Toast.makeText(this@EditorActivity, msg, Toast.LENGTH_SHORT).show()
        }
    }
}
