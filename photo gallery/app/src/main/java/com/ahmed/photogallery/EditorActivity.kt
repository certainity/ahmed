package com.ahmed.photogallery

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.ahmed.photogallery.adapter.FilterAdapter
import com.ahmed.photogallery.databinding.ActivityEditorBinding
import com.ahmed.photogallery.databinding.ItemAdjRowBinding
import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.AspectRatio
import com.ahmed.photogallery.model.CropConfig
import com.ahmed.photogallery.model.FrameConfig
import com.ahmed.photogallery.model.FrameType
import com.ahmed.photogallery.model.Filters
import com.ahmed.photogallery.model.OverlayConfig
import com.ahmed.photogallery.model.OverlayType
import com.ahmed.photogallery.model.TextLayer
import com.ahmed.photogallery.ui.editor.EditorViewModel
import com.ahmed.photogallery.utils.BitmapUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class EditorActivity : AppCompatActivity() {

    private lateinit var b: ActivityEditorBinding
    private val vm: EditorViewModel by viewModels()

    companion object {
        const val EXTRA_URI = "extra_uri"
    }

    private var adjBeforeSlide: Adjustments? = null
    private var intensityBeforeSlide = 1f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityEditorBinding.inflate(layoutInflater)
        setContentView(b.root)

        val uriStr = intent.getStringExtra(EXTRA_URI) ?: run { finish(); return }
        loadBitmap(Uri.parse(uriStr))
        setupTabs()
        setupAdjustPanel()
        setupCropPanel()
        setupTransformPanel()
        setupOverlayPanel()
        setupFramePanel()
        setupTextPanel()
        setupTopBar()
        observeViewModel()
    }

    // ── Bitmap loading ────────────────────────────────────────────────────────

    private fun loadBitmap(uri: Uri) {
        lifecycleScope.launch {
            b.loading.visibility = View.VISIBLE
            val bmp: Bitmap? = withContext(Dispatchers.IO) {
                runCatching {
                    contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
                }.getOrNull()
            }
            if (bmp == null) { finish(); return@launch }
            vm.loadBitmap(bmp)
            val thumb = withContext(Dispatchers.Default) {
                Bitmap.createScaledBitmap(bmp, 100, 100, true)
            }
            setupFilterList(thumb)
            b.loading.visibility = View.GONE
        }
    }

    // ── ViewModel observation ─────────────────────────────────────────────────

    private fun observeViewModel() {
        vm.preview.observe(this) { bmp ->
            bmp ?: return@observe
            b.ivPhoto.setImageBitmap(bmp)
            b.loading.visibility = View.GONE
            if (currentTab != Tab.CROP && currentTab != Tab.TEXT) b.tvHint.visibility = View.VISIBLE
        }
        vm.canUndo.observe(this) { can -> b.btnUndo.alpha = if (can) 1f else 0.35f }
        vm.canRedo.observe(this) { can -> b.btnRedo.alpha = if (can) 1f else 0.35f }
        vm.editState.observe(this) { state ->
            if (currentTab == Tab.TEXT) {
                b.textOverlay.layers = state.textLayers
            }
        }
    }

    // ── Top bar ───────────────────────────────────────────────────────────────

    private fun setupTopBar() {
        b.btnBack.setOnClickListener { finish() }
        b.btnUndo.setOnClickListener { vm.undo() }
        b.btnRedo.setOnClickListener { vm.redo() }

        b.btnReset.setOnClickListener {
            vm.reset()
            b.seekIntensity.progress = 100
            b.valIntensity.text = "100"
            b.seekStraighten.progress = 45
            b.valStraighten.text = "0°"
            adjRows.forEach { row ->
                row.seek.progress = if (row.bipolar) 100 else 0
                row.value.text = "0"
            }
            overlayChips.forEachIndexed { i, chip ->
                chip.background = getDrawable(if (i == 0) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
            }
            b.seekOverlayIntensity.progress = 50
            b.valOverlayIntensity.text = "50"
            frameChips.forEachIndexed { i, chip ->
                chip.background = getDrawable(if (i == 0) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
            }
            b.seekFrameThickness.progress = 6
            b.valFrameThickness.text = "6"
            b.tvHint.visibility = View.GONE
        }

        b.btnSave.setOnClickListener { save() }

        b.ivPhoto.setOnLongClickListener {
            vm.sourceBitmap?.let { b.ivPhoto.setImageBitmap(it) }
            b.tvHint.visibility = View.GONE
            true
        }
        b.ivPhoto.setOnTouchListener { _, ev ->
            if (ev.action == MotionEvent.ACTION_UP || ev.action == MotionEvent.ACTION_CANCEL) {
                vm.preview.value?.let { b.ivPhoto.setImageBitmap(it) }
                if (currentTab != Tab.CROP) b.tvHint.visibility = View.VISIBLE
            }
            false
        }
    }

    // ── Filter panel ──────────────────────────────────────────────────────────

    private fun setupFilterList(thumb: Bitmap) {
        val adapter = FilterAdapter(Filters.getAll(), thumb) { filter ->
            vm.setFilter(filter)
        }
        b.rvFilters.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        b.rvFilters.adapter = adapter

        b.seekIntensity.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onStartTrackingTouch(sb: SeekBar) {
                intensityBeforeSlide = vm.editState.value?.filterIntensity ?: 1f
            }
            override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                if (!fromUser) return
                b.valIntensity.text = p.toString()
                vm.previewFilterIntensity(p / 100f)
            }
            override fun onStopTrackingTouch(sb: SeekBar) {
                vm.commitFilterIntensity(intensityBeforeSlide, sb.progress / 100f)
            }
        })
    }

    // ── Adjust panel ──────────────────────────────────────────────────────────

    data class AdjRow(val label: TextView, val seek: SeekBar, val value: TextView,
                      val bipolar: Boolean, val getter: Adjustments.() -> Float,
                      val setter: Adjustments.(Float) -> Adjustments)

    private val adjRows = mutableListOf<AdjRow>()

    private fun setupAdjustPanel() {
        data class Def(val res: Int, val bipolar: Boolean,
                       val getter: Adjustments.() -> Float,
                       val setter: Adjustments.(Float) -> Adjustments)

        val defs = listOf(
            Def(R.string.adj_exposure,    true,  { exposure    }, { copy(exposure    = it) }),
            Def(R.string.adj_brightness,  true,  { brightness  }, { copy(brightness  = it) }),
            Def(R.string.adj_contrast,    true,  { contrast    }, { copy(contrast    = it) }),
            Def(R.string.adj_highlights,  true,  { highlights  }, { copy(highlights  = it) }),
            Def(R.string.adj_shadows,     true,  { shadows     }, { copy(shadows     = it) }),
            Def(R.string.adj_saturation,  true,  { saturation  }, { copy(saturation  = it) }),
            Def(R.string.adj_vibrance,    true,  { vibrance    }, { copy(vibrance    = it) }),
            Def(R.string.adj_temperature, true,  { temperature }, { copy(temperature = it) }),
            Def(R.string.adj_tint,        true,  { tint        }, { copy(tint        = it) }),
            Def(R.string.adj_sharpness,   false, { sharpness   }, { copy(sharpness   = it) }),
            Def(R.string.adj_vignette,    false, { vignette    }, { copy(vignette    = it) }),
            Def(R.string.adj_grain,       false, { grain       }, { copy(grain       = it) }),
            Def(R.string.adj_fade,        false, { fade        }, { copy(fade        = it) }),
        )

        val container = b.panelAdjust.getChildAt(0) as ViewGroup

        // Auto-enhance button at top
        val dp = resources.displayMetrics.density
        val autoBtn = android.widget.Button(this, null, 0, R.style.Widget_PG_Button_Pill).apply {
            setText(R.string.auto_enhance)
            backgroundTintList = null
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, (36 * dp).toInt()
            ).also { lp ->
                lp.gravity = android.view.Gravity.CENTER_HORIZONTAL
                lp.topMargin = (12 * dp).toInt()
                lp.bottomMargin = (6 * dp).toInt()
            }
            setOnClickListener { runAutoEnhance() }
        }
        container.addView(autoBtn, 0)

        defs.forEachIndexed { idx, def ->
            val rowView = container.getChildAt(idx + 1) ?: return@forEachIndexed
            val rb = ItemAdjRowBinding.bind(rowView)
            rb.adjLabel.setText(def.res)
            rb.adjSeek.max = if (def.bipolar) 200 else 100
            rb.adjSeek.progress = if (def.bipolar) 100 else 0
            rb.adjValue.text = "0"

            val row = AdjRow(rb.adjLabel, rb.adjSeek, rb.adjValue,
                def.bipolar, def.getter, def.setter)
            adjRows.add(row)

            rb.adjSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                private var beforeAdj = Adjustments()
                override fun onStartTrackingTouch(sb: SeekBar) {
                    beforeAdj = vm.editState.value?.adjustments ?: Adjustments()
                    adjBeforeSlide = beforeAdj
                }
                override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    val v = if (def.bipolar) (p - 100).toFloat() else p.toFloat()
                    rb.adjValue.text = v.toInt().toString()
                    val cur = vm.editState.value?.adjustments ?: Adjustments()
                    vm.previewAdjustments(def.setter(cur, v))
                }
                override fun onStopTrackingTouch(sb: SeekBar) {
                    val after = vm.editState.value?.adjustments ?: Adjustments()
                    vm.commitAdjustments(adjBeforeSlide ?: beforeAdj, after)
                }
            })
        }
    }

    // ── Crop panel ────────────────────────────────────────────────────────────

    private var currentAspectRatio = AspectRatio.FREE

    private fun setupCropPanel() {
        AspectRatio.values().forEachIndexed { i, ar ->
            val chip = TextView(this).apply {
                text = ar.label
                textSize = 12f
                setPadding(36, 14, 36, 14)
                setTextColor(getColor(R.color.white))
                background = getDrawable(R.drawable.chip_default_bg)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).also { it.marginEnd = 12 }
            }
            chip.setOnClickListener { selectAspectRatio(ar, i) }
            b.chipGroup.addView(chip)
        }
        selectAspectRatio(AspectRatio.FREE, 0)

        b.seekStraighten.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                if (!fromUser) return
                val angle = (p - 45).toFloat()
                b.valStraighten.text = "${angle.toInt()}°"
                vm.previewCropAngle(angle)
            }
            override fun onStartTrackingTouch(sb: SeekBar) {}
            override fun onStopTrackingTouch(sb: SeekBar) {}
        })

        b.btnApplyCrop.setOnClickListener {
            val n = b.cropOverlay.getNormalizedCrop()
            val angle = (b.seekStraighten.progress - 45).toFloat()
            vm.commitCrop(CropConfig(n[0], n[1], n[2], n[3], angle, currentAspectRatio))
        }
    }

    private fun selectAspectRatio(ar: AspectRatio, index: Int) {
        currentAspectRatio = ar
        for (i in 0 until b.chipGroup.childCount) {
            (b.chipGroup.getChildAt(i) as? TextView)?.background =
                getDrawable(R.drawable.chip_default_bg)
        }
        (b.chipGroup.getChildAt(index) as? TextView)?.background =
            getDrawable(R.drawable.chip_selected_bg)

        b.cropOverlay.aspectRatio = when (ar) {
            AspectRatio.ORIGINAL -> vm.sourceBitmap?.let {
                it.width.toFloat() / it.height.toFloat()
            } ?: 0f
            else -> ar.ratio
        }
    }

    // ── Overlay panel ─────────────────────────────────────────────────────────

    private val overlayChips = mutableListOf<TextView>()
    private var overlayIntensityBeforeSlide = 0.5f

    private fun setupOverlayPanel() {
        OverlayType.values().forEachIndexed { i, type ->
            val chip = makeChip(type.label, i == 0)
            chip.setOnClickListener { selectOverlayType(type, i) }
            overlayChips.add(chip)
            b.overlayChipGroup.addView(chip)
        }

        b.seekOverlayIntensity.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onStartTrackingTouch(sb: SeekBar) {
                overlayIntensityBeforeSlide = vm.editState.value?.overlayConfig?.intensity ?: 0.5f
            }
            override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                if (!fromUser) return
                b.valOverlayIntensity.text = p.toString()
                vm.previewOverlayIntensity(p / 100f)
            }
            override fun onStopTrackingTouch(sb: SeekBar) {
                vm.commitOverlayIntensity(overlayIntensityBeforeSlide, sb.progress / 100f)
            }
        })
    }

    private fun selectOverlayType(type: OverlayType, index: Int) {
        overlayChips.forEachIndexed { i, chip ->
            chip.background = getDrawable(if (i == index) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
        }
        val cur = vm.editState.value?.overlayConfig ?: OverlayConfig()
        vm.setOverlay(cur.copy(type = type))
    }

    // ── Frame panel ───────────────────────────────────────────────────────────

    private val frameChips = mutableListOf<TextView>()
    private var frameThicknessBeforeSlide = 0.06f

    private fun setupFramePanel() {
        FrameType.values().forEachIndexed { i, type ->
            val chip = makeChip(type.label, i == 0)
            chip.setOnClickListener { selectFrameType(type, i) }
            frameChips.add(chip)
            b.frameChipGroup.addView(chip)
        }

        b.seekFrameThickness.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onStartTrackingTouch(sb: SeekBar) {
                frameThicknessBeforeSlide = vm.editState.value?.frameConfig?.thickness ?: 0.06f
            }
            override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                if (!fromUser) return
                b.valFrameThickness.text = p.toString()
                vm.previewFrameThickness(p / 100f)
            }
            override fun onStopTrackingTouch(sb: SeekBar) {
                vm.commitFrameThickness(frameThicknessBeforeSlide, sb.progress / 100f)
            }
        })
    }

    private fun selectFrameType(type: FrameType, index: Int) {
        frameChips.forEachIndexed { i, chip ->
            chip.background = getDrawable(if (i == index) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
        }
        val cur = vm.editState.value?.frameConfig ?: FrameConfig()
        vm.setFrame(cur.copy(type = type))
    }

    // ── Text panel ────────────────────────────────────────────────────────────

    private var textSelectedId = -1L
    private var textSizeBeforeSlide = 0.08f
    private var textBoldOn = false
    private var textBgOn = false

    private val textColors = listOf(
        Color.WHITE, Color.BLACK,
        Color.parseColor("#FF4444"), Color.parseColor("#FFDD00"),
        Color.parseColor("#2BD9FE"), Color.parseColor("#FF6B6B"),
        Color.parseColor("#4AFF8C"), Color.parseColor("#FF8C00")
    )
    private var activeTextColor = Color.WHITE
    private val colorSwatches = mutableListOf<ImageView>()

    private fun setupTextPanel() {
        b.btnAddText.setOnClickListener { showAddTextDialog() }
        b.btnDeleteText.setOnClickListener {
            if (textSelectedId != -1L) {
                vm.deleteTextLayer(textSelectedId)
                selectTextLayer(-1L)
            }
        }

        // Color swatches
        textColors.forEachIndexed { i, color ->
            val swatch = ImageView(this).apply {
                val dp = resources.displayMetrics.density
                val size = (32 * dp).toInt()
                layoutParams = LinearLayout.LayoutParams(size, size).also { lp ->
                    lp.marginEnd = (8 * dp).toInt()
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(color)
                }
                setOnClickListener {
                    activeTextColor = color
                    colorSwatches.forEachIndexed { j, sv ->
                        (sv.background as GradientDrawable).setStroke(
                            if (j == i) (3 * resources.displayMetrics.density).toInt() else 0,
                            getColor(R.color.accent)
                        )
                    }
                    if (textSelectedId != -1L)
                        vm.updateTextLayer(textSelectedId) { it.copy(color = color) }
                }
            }
            colorSwatches.add(swatch)
            b.textColorGroup.addView(swatch)
        }
        // Highlight first swatch
        (colorSwatches.firstOrNull()?.background as? GradientDrawable)
            ?.setStroke((3 * resources.displayMetrics.density).toInt(), getColor(R.color.accent))

        // Size slider
        b.seekTextSize.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onStartTrackingTouch(sb: SeekBar) {
                textSizeBeforeSlide = vm.editState.value?.textLayers
                    ?.find { it.id == textSelectedId }?.sizeFraction ?: 0.08f
            }
            override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                if (!fromUser) return
                b.valTextSize.text = p.toString()
                val frac = (p / 100f * 0.20f).coerceAtLeast(0.02f)
                if (textSelectedId != -1L)
                    vm.updateTextLayer(textSelectedId) { it.copy(sizeFraction = frac) }
            }
            override fun onStopTrackingTouch(sb: SeekBar) {}
        })

        // Bold toggle
        b.chipTextBold.setOnClickListener {
            textBoldOn = !textBoldOn
            b.chipTextBold.background = getDrawable(
                if (textBoldOn) R.drawable.chip_selected_bg else R.drawable.chip_default_bg
            )
            if (textSelectedId != -1L)
                vm.updateTextLayer(textSelectedId) { it.copy(bold = textBoldOn) }
        }

        // Background toggle
        b.chipTextBg.setOnClickListener {
            textBgOn = !textBgOn
            b.chipTextBg.background = getDrawable(
                if (textBgOn) R.drawable.chip_selected_bg else R.drawable.chip_default_bg
            )
            if (textSelectedId != -1L)
                vm.updateTextLayer(textSelectedId) { it.copy(hasBackground = textBgOn) }
        }

        // TextOverlayView callbacks
        b.textOverlay.onLayerSelected = { id -> selectTextLayer(id) }
        b.textOverlay.onLayerMoved    = { id, nx, ny -> vm.previewTextMove(id, nx, ny) }
        b.textOverlay.onLayerMoveCommit = { id, bx, by -> vm.commitTextMove(id, bx, by) }
    }

    private fun selectTextLayer(id: Long) {
        textSelectedId = id
        b.textOverlay.selectedId = id
        b.btnDeleteText.visibility = if (id != -1L) View.VISIBLE else View.GONE

        val layer = vm.editState.value?.textLayers?.find { it.id == id }
        if (layer != null) {
            val sizeProgress = ((layer.sizeFraction / 0.20f) * 100).toInt().coerceIn(1, 100)
            b.seekTextSize.progress = sizeProgress
            b.valTextSize.text = sizeProgress.toString()
            textBoldOn = layer.bold
            textBgOn   = layer.hasBackground
            b.chipTextBold.background = getDrawable(if (textBoldOn) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
            b.chipTextBg.background   = getDrawable(if (textBgOn) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
            activeTextColor = layer.color
        }
    }

    private fun showAddTextDialog() {
        val et = EditText(this).apply {
            hint = getString(R.string.text_hint)
            inputType = InputType.TYPE_CLASS_TEXT
            setPadding(48, 32, 48, 16)
        }
        AlertDialog.Builder(this)
            .setTitle("Add Text")
            .setView(et)
            .setPositiveButton(R.string.save) { _, _ ->
                val t = et.text.toString().trim()
                if (t.isNotEmpty()) {
                    val frac = (b.seekTextSize.progress / 100f * 0.20f).coerceAtLeast(0.04f)
                    vm.addTextLayer(TextLayer(
                        text = t, x = 0.5f, y = 0.45f,
                        sizeFraction = frac, color = activeTextColor,
                        bold = textBoldOn, hasBackground = textBgOn
                    ))
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun positionTextOverlay() {
        b.ivPhoto.post {
            val d = b.ivPhoto.drawable ?: return@post
            val iw = d.intrinsicWidth.toFloat()
            val ih = d.intrinsicHeight.toFloat()
            if (iw <= 0 || ih <= 0) return@post
            val vw = b.ivPhoto.width.toFloat()
            val vh = b.ivPhoto.height.toFloat()
            val scale = minOf(vw / iw, vh / ih)
            val dw = iw * scale; val dh = ih * scale
            val ox = (vw - dw) / 2f; val oy = (vh - dh) / 2f
            b.textOverlay.setImageRect(RectF(ox, oy, ox + dw, oy + dh))
            b.textOverlay.layers = vm.editState.value?.textLayers ?: emptyList()
            b.textOverlay.selectedId = textSelectedId
        }
    }

    // ── Auto-enhance ──────────────────────────────────────────────────────────

    private fun runAutoEnhance() {
        b.loading.visibility = View.VISIBLE
        lifecycleScope.launch {
            val newAdj = vm.autoEnhance()
            if (newAdj != null) updateAdjRows(newAdj)
            b.loading.visibility = View.GONE
        }
    }

    private fun updateAdjRows(adj: Adjustments) {
        adjRows.forEachIndexed { _, row ->
            val v = row.getter(adj)
            row.seek.progress = if (row.bipolar) (v + 100).toInt().coerceIn(0, 200) else v.toInt().coerceIn(0, 100)
            row.value.text = v.toInt().toString()
        }
    }

    private fun makeChip(label: String, selected: Boolean): TextView = TextView(this).apply {
        text = label
        textSize = 12f
        setPadding(28, 10, 28, 10)
        setTextColor(getColor(R.color.white))
        background = getDrawable(if (selected) R.drawable.chip_selected_bg else R.drawable.chip_default_bg)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).also { it.marginEnd = 12 }
    }

    // ── Transform panel ───────────────────────────────────────────────────────

    private fun setupTransformPanel() {
        b.btnRotate.setOnClickListener { vm.rotate90() }
        b.btnFlipH.setOnClickListener  { vm.flipHorizontal() }
        b.btnFlipV.setOnClickListener  { vm.flipVertical() }
    }

    // ── Tabs ──────────────────────────────────────────────────────────────────

    private enum class Tab { FILTER, ADJUST, CROP, TRANSFORM, OVERLAY, FRAME, TEXT }
    private var currentTab = Tab.FILTER

    private fun setupTabs() {
        b.btnFilter.setOnClickListener    { selectTab(Tab.FILTER) }
        b.btnAdjust.setOnClickListener    { selectTab(Tab.ADJUST) }
        b.btnCrop.setOnClickListener      { selectTab(Tab.CROP) }
        b.btnTransform.setOnClickListener { selectTab(Tab.TRANSFORM) }
        b.btnOverlay.setOnClickListener   { selectTab(Tab.OVERLAY) }
        b.btnFrame.setOnClickListener     { selectTab(Tab.FRAME) }
        b.btnText.setOnClickListener      { selectTab(Tab.TEXT) }
        selectTab(Tab.FILTER)
    }

    private fun selectTab(tab: Tab) {
        currentTab = tab
        listOf(b.btnFilter, b.btnAdjust, b.btnCrop, b.btnTransform, b.btnOverlay, b.btnFrame, b.btnText)
            .forEachIndexed { i, tv ->
                val active = tab.ordinal == i
                tv.setBackgroundResource(
                    if (active) R.drawable.tab_pill_indicator else R.drawable.tab_pill_inactive
                )
                tv.setTextColor(getColor(if (active) R.color.white else R.color.text_secondary))
            }
        listOf(b.panelFilter, b.panelAdjust, b.panelCrop, b.panelTransform, b.panelOverlay, b.panelFrame, b.panelText)
            .forEachIndexed { i, pv -> pv.visibility = if (tab.ordinal == i) View.VISIBLE else View.GONE }

        val inCrop = tab == Tab.CROP
        val inText = tab == Tab.TEXT
        b.cropOverlay.visibility = if (inCrop) View.VISIBLE else View.GONE
        b.textOverlay.visibility = if (inText) View.VISIBLE else View.GONE
        b.tvHint.visibility = if (inCrop || inText) View.GONE else View.VISIBLE
        if (inCrop) positionCropOverlay()
        if (inText) positionTextOverlay()
    }

    private fun positionCropOverlay() {
        b.ivPhoto.post {
            val d = b.ivPhoto.drawable ?: return@post
            val iw = d.intrinsicWidth.toFloat()
            val ih = d.intrinsicHeight.toFloat()
            if (iw <= 0 || ih <= 0) return@post
            val vw = b.ivPhoto.width.toFloat()
            val vh = b.ivPhoto.height.toFloat()
            val scale = minOf(vw / iw, vh / ih)
            val dw = iw * scale; val dh = ih * scale
            val ox = (vw - dw) / 2f; val oy = (vh - dh) / 2f
            b.cropOverlay.setImageRect(RectF(ox, oy, ox + dw, oy + dh))
            val cfg = vm.editState.value?.cropConfig
            if (cfg != null && !cfg.isDefault)
                b.cropOverlay.restoreCrop(cfg.left, cfg.top, cfg.right, cfg.bottom)
        }
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    private fun save() {
        b.loading.visibility = View.VISIBLE
        lifecycleScope.launch {
            val bmp = vm.renderForExport()
            val uri = if (bmp != null)
                BitmapUtils.saveToGallery(this@EditorActivity, bmp,
                    "polished_${System.currentTimeMillis()}")
            else null
            b.loading.visibility = View.GONE
            Toast.makeText(this@EditorActivity,
                if (uri != null) R.string.saved else R.string.save_failed,
                Toast.LENGTH_SHORT).show()
        }
    }
}
