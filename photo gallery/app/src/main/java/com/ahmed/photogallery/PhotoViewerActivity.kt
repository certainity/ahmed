package com.ahmed.photogallery

import android.content.ContentUris
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.widget.ViewPager2
import com.ahmed.photogallery.databinding.ActivityPhotoViewerBinding
import com.ahmed.photogallery.model.Photo
import com.bumptech.glide.Glide
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PhotoViewerActivity : AppCompatActivity() {

    private lateinit var b: ActivityPhotoViewerBinding
    private var photos = listOf<Photo>()
    private var currentPos = 0

    companion object {
        const val EXTRA_POS = "extra_pos"
        // Photos are passed via static cache to avoid TransactionTooLargeException
        var photosCache: List<Photo> = emptyList()
    }

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

    private fun setupPager() {
        b.photoView.visibility = View.GONE
        b.viewPager.visibility = View.VISIBLE

        val pagerAdapter = object :
            androidx.recyclerview.widget.RecyclerView.Adapter<PhotoPageVH>() {

            override fun onCreateViewHolder(parent: android.view.ViewGroup, vt: Int): PhotoPageVH {
                val pv = com.github.chrisbanes.photoview.PhotoView(parent.context).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(-1, -1)
                    // When zoomed in, lock ViewPager2 so PhotoView can pan freely
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
                    true // result handled in onActivityResult
                } else {
                    contentResolver.delete(photo.uri, null, null) > 0
                }
            }.getOrDefault(false)
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && deleted) {
            val newPhotos = photos.toMutableList().also { it.removeAt(currentPos) }
            PhotoViewerActivity.photosCache = newPhotos
            if (newPhotos.isEmpty()) { finish(); return }
            photos = newPhotos
            currentPos = currentPos.coerceAtMost(newPhotos.size - 1)
            b.viewPager.adapter?.notifyDataSetChanged()
            updateCounter(currentPos)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 42 && resultCode == RESULT_OK) {
            // Photo deleted via system dialog on API 30+
            val newPhotos = photos.toMutableList().also { it.removeAt(currentPos) }
            PhotoViewerActivity.photosCache = newPhotos
            if (newPhotos.isEmpty()) { finish(); return }
            photos = newPhotos
            currentPos = currentPos.coerceAtMost(newPhotos.size - 1)
            b.viewPager.adapter?.notifyDataSetChanged()
            updateCounter(currentPos)
        }
    }

    private fun updateCounter(pos: Int) {
        b.tvCounter.text = "${pos + 1} / ${photos.size}"
        b.tvCounter.visibility = if (photos.size > 1) View.VISIBLE else View.GONE
    }

    private fun toggleUi(show: Boolean) {
        val vis = if (show) View.VISIBLE else View.GONE
        b.topBar.visibility = vis
        b.bottomBar.visibility = vis
    }

    inner class PhotoPageVH(val view: com.github.chrisbanes.photoview.PhotoView) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(view)
}
