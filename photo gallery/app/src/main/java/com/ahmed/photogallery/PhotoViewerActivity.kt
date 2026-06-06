package com.ahmed.photogallery

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.ContentUris
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.transition.ChangeBounds
import android.transition.ChangeImageTransform
import android.transition.TransitionSet
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
import com.ahmed.photogallery.utils.FavoritesStore
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DataSource
import com.bumptech.glide.load.engine.GlideException
import com.bumptech.glide.request.RequestListener
import com.bumptech.glide.request.target.Target
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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

    // ── Slideshow ─────────────────────────────────────────────────────────────

    private val slideshowHandler = Handler(Looper.getMainLooper())
    private var slideshowRunning = false

    private fun toggleSlideshow() {
        if (slideshowRunning) stopSlideshow() else startSlideshow()
    }

    private fun startSlideshow() {
        if (photos.size < 2) return
        slideshowRunning = true
        b.ivSlideshowIcon.setImageResource(R.drawable.ic_pause)
        toggleUi(false)
        scheduleNextSlide()
    }

    private fun scheduleNextSlide() {
        slideshowHandler.postDelayed({
            if (!slideshowRunning) return@postDelayed
            val next = currentPos + 1
            if (next >= photos.size) { stopSlideshow(); return@postDelayed }
            b.viewPager.setCurrentItem(next, true)
            scheduleNextSlide()
        }, 3000L)
    }

    private fun stopSlideshow() {
        slideshowRunning = false
        slideshowHandler.removeCallbacksAndMessages(null)
        b.ivSlideshowIcon.setImageResource(R.drawable.ic_play)
        toggleUi(true)
    }

    // ── Favorites ─────────────────────────────────────────────────────────────

    private fun toggleFavorite() {
        val photo = photos.getOrNull(currentPos) ?: return
        val nowFav = FavoritesStore.toggle(this, photo.id)
        applyStarIcon(nowFav)
        Toast.makeText(
            this,
            getString(if (nowFav) R.string.added_to_favorites else R.string.removed_from_favorites),
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun applyStarIcon(isFav: Boolean) {
        b.btnFavorite.setImageResource(
            if (isFav) R.drawable.ic_star_filled else R.drawable.ic_star_outline
        )
        b.btnFavorite.imageTintList = ColorStateList.valueOf(
            if (isFav) getColor(R.color.accent) else getColor(android.R.color.white)
        )
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        b = ActivityPhotoViewerBinding.inflate(layoutInflater)
        setContentView(b.root)

        postponeEnterTransition()
        window.sharedElementEnterTransition = TransitionSet().apply {
            addTransition(ChangeBounds())
            addTransition(ChangeImageTransform())
            duration = 280L
            interpolator = DecelerateInterpolator()
        }
        Handler(Looper.getMainLooper()).postDelayed({ startPostponedEnterTransition() }, 500L)

        photos = photosCache
        currentPos = intent.getIntExtra(EXTRA_POS, 0)
        if (photos.isEmpty()) { finish(); return }

        setupPager()

        b.btnBack.setOnClickListener { finish() }
        b.btnFavorite.setOnClickListener { toggleFavorite() }
        b.btnInfo.setOnClickListener { showInfoSheet() }
        b.btnSlideshow.setOnClickListener { toggleSlideshow() }
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

        applyStarIcon(FavoritesStore.isFavorite(this, photos.getOrNull(currentPos)?.id ?: -1L))
        toggleUi(true)
    }

    override fun onStop() {
        super.onStop()
        if (slideshowRunning) stopSlideshow()
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
                        if (slideshowRunning) stopSlideshow()
                        else toggleUi(b.topBar.visibility == View.GONE)
                    }
                }
                return PhotoPageVH(pv)
            }

            override fun onBindViewHolder(h: PhotoPageVH, pos: Int) {
                val photo = photos[pos]
                h.view.transitionName = if (pos == currentPos) "photo_${photo.id}" else null
                Glide.with(h.view)
                    .load(photo.uri)
                    .listener(object : RequestListener<Drawable> {
                        override fun onResourceReady(r: Drawable, model: Any,
                            target: Target<Drawable>?, source: DataSource,
                            isFirstResource: Boolean): Boolean {
                            if (pos == currentPos) startPostponedEnterTransition()
                            return false
                        }
                        override fun onLoadFailed(e: GlideException?, model: Any?,
                            target: Target<Drawable>, isFirstResource: Boolean): Boolean {
                            if (pos == currentPos) startPostponedEnterTransition()
                            return false
                        }
                    })
                    .into(h.view)
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
                applyStarIcon(FavoritesStore.isFavorite(
                    this@PhotoViewerActivity, photos[position].id))
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
