package com.ahmed.photogallery.ui.editor

import android.graphics.Bitmap
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ahmed.photogallery.engine.*
import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.CropConfig
import com.ahmed.photogallery.model.FrameConfig
import com.ahmed.photogallery.model.OverlayConfig
import com.ahmed.photogallery.model.PhotoFilter
import com.ahmed.photogallery.model.TextLayer
import com.ahmed.photogallery.utils.BitmapUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class EditorViewModel : ViewModel() {

    // ── State ─────────────────────────────────────────────────────────────────

    private val _editState = MutableLiveData(EditState())
    val editState: LiveData<EditState> = _editState

    private val history = EditHistory()

    private val _canUndo = MutableLiveData(false)
    val canUndo: LiveData<Boolean> = _canUndo

    private val _canRedo = MutableLiveData(false)
    val canRedo: LiveData<Boolean> = _canRedo

    private val _preview = MutableLiveData<Bitmap?>()
    val preview: LiveData<Bitmap?> = _preview

    // ── Bitmaps ───────────────────────────────────────────────────────────────

    var sourceBitmap: Bitmap? = null
        private set

    /** Downscaled proxy used for all live previews to keep the UI responsive. */
    var proxyBitmap: Bitmap? = null
        private set

    fun loadBitmap(bmp: Bitmap) {
        sourceBitmap = bmp
        proxyBitmap = downscale(bmp, 1080)
        _preview.value = proxyBitmap
    }

    private fun downscale(bmp: Bitmap, maxDim: Int): Bitmap {
        if (bmp.width <= maxDim && bmp.height <= maxDim) return bmp
        val scale = minOf(maxDim.toFloat() / bmp.width, maxDim.toFloat() / bmp.height)
        return Bitmap.createScaledBitmap(
            bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
    }

    // ── Adjustments ───────────────────────────────────────────────────────────

    /**
     * Called on every slider tick — updates state for live preview without
     * pushing a history entry (the history entry is pushed in commitAdjustments).
     */
    fun previewAdjustments(adj: Adjustments) {
        _editState.value = _editState.value?.copy(adjustments = adj)
        scheduleRender()
    }

    /** Call when the user lifts their finger; pushes the completed change to history. */
    fun commitAdjustments(before: Adjustments, after: Adjustments) {
        if (before == after) return
        history.push(AdjustOperation(before, after))
        updateUndoRedo()
    }

    // ── Filters ───────────────────────────────────────────────────────────────

    fun setFilter(filter: PhotoFilter?) {
        val cur = _editState.value ?: return
        history.push(FilterOperation(cur.filter, cur.filterIntensity, filter, cur.filterIntensity))
        _editState.value = cur.copy(filter = filter)
        updateUndoRedo()
        scheduleRender()
    }

    fun previewFilterIntensity(intensity: Float) {
        _editState.value = _editState.value?.copy(filterIntensity = intensity)
        scheduleRender()
    }

    fun commitFilterIntensity(before: Float, after: Float) {
        if (before == after) return
        val cur = _editState.value ?: return
        history.push(FilterOperation(cur.filter, before, cur.filter, after))
        updateUndoRedo()
    }

    // ── Crop ──────────────────────────────────────────────────────────────────

    fun commitCrop(crop: CropConfig) {
        val cur = _editState.value ?: return
        if (cur.cropConfig == crop) return
        history.push(CropOperation(cur.cropConfig, crop))
        _editState.value = cur.copy(cropConfig = crop)
        updateUndoRedo()
        scheduleRender()
    }

    fun previewCropAngle(angle: Float) {
        _editState.value = _editState.value?.let {
            it.copy(cropConfig = it.cropConfig.copy(angle = angle))
        }
        scheduleRender()
    }

    // ── Transform ─────────────────────────────────────────────────────────────

    fun rotate90() = applyTransform { cur ->
        TransformOperation(cur.rotation, cur.flipHorizontal, cur.flipVertical,
            (cur.rotation + 90) % 360, cur.flipHorizontal, cur.flipVertical)
    }

    fun flipHorizontal() = applyTransform { cur ->
        TransformOperation(cur.rotation, cur.flipHorizontal, cur.flipVertical,
            cur.rotation, !cur.flipHorizontal, cur.flipVertical)
    }

    fun flipVertical() = applyTransform { cur ->
        TransformOperation(cur.rotation, cur.flipHorizontal, cur.flipVertical,
            cur.rotation, cur.flipHorizontal, !cur.flipVertical)
    }

    private fun applyTransform(block: (EditState) -> TransformOperation) {
        val cur = _editState.value ?: return
        val op = block(cur)
        history.push(op)
        _editState.value = op.apply(cur)
        updateUndoRedo()
        scheduleRender()
    }

    // ── Overlay ───────────────────────────────────────────────────────────────

    fun setOverlay(config: OverlayConfig) {
        val cur = _editState.value ?: return
        history.push(OverlayOperation(cur.overlayConfig, config))
        _editState.value = cur.copy(overlayConfig = config)
        updateUndoRedo()
        scheduleRender()
    }

    fun previewOverlayIntensity(intensity: Float) {
        val cur = _editState.value ?: return
        _editState.value = cur.copy(overlayConfig = cur.overlayConfig.copy(intensity = intensity))
        scheduleRender()
    }

    fun commitOverlayIntensity(before: Float, after: Float) {
        if (before == after) return
        val cur = _editState.value ?: return
        history.push(OverlayOperation(cur.overlayConfig.copy(intensity = before), cur.overlayConfig))
        updateUndoRedo()
    }

    // ── Frame ─────────────────────────────────────────────────────────────────

    fun setFrame(config: FrameConfig) {
        val cur = _editState.value ?: return
        history.push(FrameOperation(cur.frameConfig, config))
        _editState.value = cur.copy(frameConfig = config)
        updateUndoRedo()
        scheduleRender()
    }

    fun previewFrameThickness(thickness: Float) {
        val cur = _editState.value ?: return
        _editState.value = cur.copy(frameConfig = cur.frameConfig.copy(thickness = thickness))
        scheduleRender()
    }

    fun commitFrameThickness(before: Float, after: Float) {
        if (before == after) return
        val cur = _editState.value ?: return
        history.push(FrameOperation(cur.frameConfig.copy(thickness = before), cur.frameConfig))
        updateUndoRedo()
    }

    // ── Text layers ───────────────────────────────────────────────────────────

    fun addTextLayer(layer: TextLayer) {
        val cur = _editState.value ?: return
        val after = cur.textLayers + layer
        history.push(TextOperation(cur.textLayers, after))
        _editState.value = cur.copy(textLayers = after)
        updateUndoRedo()
        scheduleRender()
    }

    fun previewTextMove(id: Long, nx: Float, ny: Float) {
        val cur = _editState.value ?: return
        _editState.value = cur.copy(
            textLayers = cur.textLayers.map { if (it.id == id) it.copy(x = nx, y = ny) else it }
        )
    }

    fun commitTextMove(id: Long, beforeX: Float, beforeY: Float) {
        val cur = _editState.value ?: return
        val before = cur.textLayers.map { if (it.id == id) it.copy(x = beforeX, y = beforeY) else it }
        if (before == cur.textLayers) return
        history.push(TextOperation(before, cur.textLayers))
        updateUndoRedo()
        scheduleRender()
    }

    fun updateTextLayer(id: Long, updater: (TextLayer) -> TextLayer) {
        val cur = _editState.value ?: return
        val after = cur.textLayers.map { if (it.id == id) updater(it) else it }
        if (after == cur.textLayers) return
        history.push(TextOperation(cur.textLayers, after))
        _editState.value = cur.copy(textLayers = after)
        updateUndoRedo()
        scheduleRender()
    }

    fun deleteTextLayer(id: Long) {
        val cur = _editState.value ?: return
        val after = cur.textLayers.filter { it.id != id }
        history.push(TextOperation(cur.textLayers, after))
        _editState.value = cur.copy(textLayers = after)
        updateUndoRedo()
        scheduleRender()
    }

    // ── Auto-enhance ──────────────────────────────────────────────────────────

    suspend fun autoEnhance(): Adjustments? {
        val proxy = proxyBitmap ?: return null
        val cur   = _editState.value ?: return null
        val newAdj = withContext(Dispatchers.Default) { BitmapUtils.analyzeAndEnhance(proxy) }
        history.push(AdjustOperation(cur.adjustments, newAdj))
        _editState.value = cur.copy(adjustments = newAdj)
        updateUndoRedo()
        scheduleRender()
        return newAdj
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    fun undo() {
        val cur = _editState.value ?: return
        _editState.value = history.undo(cur)
        updateUndoRedo()
        scheduleRender()
    }

    fun redo() {
        val cur = _editState.value ?: return
        _editState.value = history.redo(cur)
        updateUndoRedo()
        scheduleRender()
    }

    fun reset() {
        _editState.value = EditState()
        history.clear()
        updateUndoRedo()
        scheduleRender()
    }

    private fun updateUndoRedo() {
        _canUndo.value = history.canUndo
        _canRedo.value = history.canRedo
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private var renderJob: Job? = null

    private fun scheduleRender(debounceMs: Long = 40) {
        renderJob?.cancel()
        renderJob = viewModelScope.launch {
            delay(debounceMs)
            val proxy = proxyBitmap ?: return@launch
            val state = _editState.value ?: return@launch
            val result = withContext(Dispatchers.Default) {
                BitmapUtils.renderPipeline(proxy, state)
            }
            _preview.value = result
        }
    }

    /** Full-resolution render for saving — includes text layers baked on top. */
    suspend fun renderForExport(): Bitmap? {
        val src   = sourceBitmap ?: return null
        val state = _editState.value ?: return null
        return withContext(Dispatchers.Default) {
            val base = BitmapUtils.renderPipeline(src, state)
            BitmapUtils.renderTextLayers(base, state.textLayers)
        }
    }

    override fun onCleared() {
        super.onCleared()
        renderJob?.cancel()
    }
}
