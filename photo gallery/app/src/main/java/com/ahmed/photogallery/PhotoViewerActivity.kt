package com.ahmed.photogallery

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.ContentUris
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GestureDetectorCompat
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.widget.ViewPager2
import com.ahmed.photogallery.databinding.ActivityPhotoViewerBinding
import com.ahmed.photogallery.model.Photo
import com.bumptech.glide.Glide
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

class PhotoViewerActivity : AppCompatActivity() {

    private lateinit var b: ActivityPhotoViewerBinding
    private var photos = listOf<Photo>()
    private var currentPos = 0

    companion object {
        const val EXTRA_POS = "extra_pos"
        var photosCache: List<Photo> = emptyList()
    }

    // ── Swipe-down dismiss ────────────────────────────────────────────────────

    private var swipeStartY = 0f
    private var isDismissing = false

    private val gestureDetector by lazy {
        GestureDetectorCompat(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(
                e1: MotionEvent?, e2: MotionEvent,
                velocityX: Float, velocityY: Float
            ): Boolean {
                if (velocityY > 1200 && abs(velocityY) > abs(velocityX) * 1.5f && !isDismissing) {
                    animateDismiss()
                    return true
                }
                return false
            }
        })
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.pointerCount == 1) gestureDetector.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }

    private fun animateDismiss() {
        isDismissing = true
        val h = b.root.height.toFloat()
        AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(b.root, "translationY", 0f, h * 0.6f),
                ObjectAnimator.ofFloat(b.root, "alpha", 1f, 0f)
            )
            duration = 240
            interpolator = DecelerateInterpolator()
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(a: android.animation.Animator) {
                    finish()
                    overridePendingTransition(0, 0)
                }
            })
            start()
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        b = ActivityPhotoViewerBinding.inflate(layoutInflater)
        setContentView(b.root)

        photos = photosCache
        currentPos = intent.getIntExtra(EXTRA_POS, 0)
        if (photos.isEmpty()) { finish(); return }

        setupPager()

        b.btnBack.setOnClickListener { finish() }
        b.btnInfo.setOnClickListener { showInfoSheet() }
        b.btnEdit.setOnClickListener {
            photos.getOrNull(currentPos)?.let { photo ->
                startActivity(Intent(this, EditorActivity::class.java).apply {
                    putExtra(EditorActivity.EXTRA_URI, photo.uri.toString())
                })
            }
        }
        b.btnShare.setOnClickListener {
            photos.getOrNull(currentPos)?.let { photo ->
                startActivity(
                    Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "image/*"
                        putExtra(Intent.EXTRA_STREAM, photo.uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }, "Share")
                )
            }
        }
        b.btnDelete.setOnClickListener { deleteCurrentPhoto() }
        toggleUi(true)
    }

    // ── Pager ─────────────────────────────────────────────────────────────────

    private fun setupPager() {
        b.photoView.visibility = View.GONE
        b.viewPager.visibility = View.VISIBLE

        val pagerAdapter = object :
            androidx.recyclerview.widget.RecyclerView.Adapter<PhotoPageVH>() {

            override fun onCreateViewHolder(parent: android.view.ViewGroup, vt: Int): PhotoPageVH {
                val pv = com.github.chrisbanes.photoview.PhotoView(parent.context).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(-1, -1)
                    setOnMatrixChangeListener {
                        b.viewPager.isUserInputEnabled = scale <= 1.05f
                    }
                    setOnPhotoTapListener { _, _, _ ->
                        toggleUi(b.topBar.visibility == View.GONE)
                    }
                }
                return PhotoPageVH(pv)
            }

            override fun onBindViewHolder(h: PhotoPageVH, pos: Int) {
                Glide.with(h.view).load(photos[pos].uri).into(h.view)
            }

            override fun getItemCount() = photos.size
        }

        b.viewPager.adapter = pagerAdapter
        b.viewPager.setCurrentItem(currentPos, false)
        updateCounter(currentPos)

        b.viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                currentPos = position
                updateCounter(position)
            }
        })
    }

    // ── Photo info sheet ──────────────────────────────────────────────────────

    private fun showInfoSheet() {
        val photo = photos.getOrNull(currentPos) ?: return
        val sheet = BottomSheetDialog(this, R.style.Theme_PolishGallery)
        val view = layoutInflater.inflate(R.layout.sheet_photo_info, null)
        sheet.setContentView(view)

        val dateFmt = SimpleDateFormat("MMM d, yyyy  HH:mm", Locale.getDefault())
        val dateStr = dateFmt.format(Date(photo.dateAdded * 1000L))

        view.findViewById<android.widget.TextView>(R.id.tvInfoName).text = photo.displayName
        view.findViewById<android.widget.TextView>(R.id.tvInfoSize).text = formatSize(photo.size)
        view.findViewById<android.widget.TextView>(R.id.tvInfoDate).text = dateStr
        view.findViewById<android.widget.TextView>(R.id.tvInfoAlbum).text = photo.bucketName

        sheet.show()
    }

    private fun formatSize(bytes: Long): String {
        if (bytes <= 0) return "—"
        val df = DecimalFormat("#.#")
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${df.format(bytes / 1024.0)} KB"
            else -> "${df.format(bytes / (1024.0 * 1024.0))} MB"
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    private fun deleteCurrentPhoto() {
        val photo = photos.getOrNull(currentPos) ?: return
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setMessage(getString(R.string.delete_confirm, 1))
            .setPositiveButton(R.string.delete) { _, _ ->
                lifecycleScope.launch { performDelete(photo) }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private suspend fun performDelete(photo: Photo) {
        val deleted = withContext(Dispatchers.IO) {
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val pi = MediaStore.createDeleteRequest(contentResolver,
                        listOf(ContentUris.withAppendedId(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, photo.id)))
                    startIntentSenderForResult(pi.intentSender, 42, null, 0, 0, 0)
                    true
                } else {
                    contentResolver.delete(photo.uri, null, null) > 0
                }
            }.getOrDefault(false)
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && deleted) {
            refreshAfterDelete()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 42 && resultCode == RESULT_OK) refreshAfterDelete()
    }

    private fun refreshAfterDelete() {
        val newPhotos = photos.toMutableList().also { it.removeAt(currentPos) }
        photosCache = newPhotos
        if (newPhotos.isEmpty()) { finish(); return }
        photos = newPhotos
        currentPos = currentPos.coerceAtMost(newPhotos.size - 1)
        b.viewPager.adapter?.notifyDataSetChanged()
        updateCounter(currentPos)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun updateCounter(pos: Int) {
        b.tvCounter.text = "${pos + 1} / ${photos.size}"
        b.tvCounter.visibility = if (photos.size > 1) View.VISIBLE else View.GONE
    }

    private fun toggleUi(show: Boolean) {
        val vis = if (show) View.VISIBLE else View.GONE
        b.topBar.visibility    = vis
        b.bottomBar.visibility = vis
    }

    inner class PhotoPageVH(val view: com.github.chrisbanes.photoview.PhotoView) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(view)
}
