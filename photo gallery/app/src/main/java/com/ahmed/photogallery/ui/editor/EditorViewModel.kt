package com.ahmed.photogallery.ui.editor

import android.graphics.Bitmap
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ahmed.photogallery.engine.*
import com.ahmed.photogallery.model.Adjustments
import com.ahmed.photogallery.model.CropConfig
import com.ahmed.photogallery.model.PhotoFilter
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

    /** Full-resolution render for saving. Call from a coroutine. */
    suspend fun renderForExport(): Bitmap? {
        val src   = sourceBitmap ?: return null
        val state = _editState.value ?: return null
        return withContext(Dispatchers.Default) { BitmapUtils.renderPipeline(src, state) }
    }

    override fun onCleared() {
        super.onCleared()
        renderJob?.cancel()
    }
}
