package com.ahmed.photogallery

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.viewpager2.widget.ViewPager2
import com.ahmed.photogallery.databinding.ActivityPhotoViewerBinding
import com.ahmed.photogallery.model.Photo
import com.bumptech.glide.Glide

class PhotoViewerActivity : AppCompatActivity() {

    private lateinit var b: ActivityPhotoViewerBinding
    private var photos = listOf<Photo>()
    private var currentPos = 0

    companion object {
        const val EXTRA_URI = "extra_uri"
        const val EXTRA_NAME = "extra_name"
        const val EXTRA_PHOTOS = "extra_photos"
        const val EXTRA_POS = "extra_pos"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        b = ActivityPhotoViewerBinding.inflate(layoutInflater)
        setContentView(b.root)

        photos = intent.getParcelableArrayListExtra<Photo>(EXTRA_PHOTOS) ?: emptyList()
        currentPos = intent.getIntExtra(EXTRA_POS, 0)

        if (photos.isEmpty()) {
            val uri = intent.getStringExtra(EXTRA_URI) ?: run { finish(); return }
            Glide.with(this).load(uri).into(b.photoView)
            b.tvCounter.visibility = View.GONE
        } else {
            setupPager()
        }

        b.btnBack.setOnClickListener { finish() }

        b.btnEdit.setOnClickListener {
            val photo = photos.getOrNull(currentPos)
            val uri = photo?.uri?.toString() ?: intent.getStringExtra(EXTRA_URI) ?: return@setOnClickListener
            startActivity(Intent(this, EditorActivity::class.java).apply {
                putExtra(EditorActivity.EXTRA_URI, uri)
            })
        }

        b.btnShare.setOnClickListener {
            val photo = photos.getOrNull(currentPos)
            val uri = photo?.uri ?: return@setOnClickListener
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "image/*"
                putExtra(Intent.EXTRA_STREAM, uri)
            }, "Share"))
        }

        toggleUi(true)
        b.photoView.setOnPhotoTapListener { _, _, _ -> toggleUi(b.topBar.visibility == View.GONE) }
    }

    private fun setupPager() {
        b.viewPager.visibility = View.VISIBLE
        b.photoView.visibility = View.GONE

        val adapter = object : androidx.recyclerview.widget.RecyclerView.Adapter<PhotoPageVH>() {
            override fun onCreateViewHolder(parent: android.view.ViewGroup, vt: Int): PhotoPageVH {
                val pv = com.github.chrisbanes.photoview.PhotoView(parent.context).apply {
                    layoutParams = android.view.ViewGroup.LayoutParams(-1, -1)
                }
                return PhotoPageVH(pv)
            }
            override fun onBindViewHolder(h: PhotoPageVH, pos: Int) {
                Glide.with(h.view).load(photos[pos].uri).into(h.view)
            }
            override fun getItemCount() = photos.size
        }

        b.viewPager.adapter = adapter
        b.viewPager.setCurrentItem(currentPos, false)
        updateCounter(currentPos)

        b.viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                currentPos = position
                updateCounter(position)
            }
        })
    }

    private fun updateCounter(pos: Int) {
        b.tvCounter.text = "${pos + 1} / ${photos.size}"
    }

    private fun toggleUi(show: Boolean) {
        val vis = if (show) View.VISIBLE else View.GONE
        b.topBar.visibility = vis
        b.bottomBar.visibility = vis
        b.tvCounter.visibility = if (show && photos.size > 1) View.VISIBLE else View.GONE
    }

    inner class PhotoPageVH(val view: com.github.chrisbanes.photoview.PhotoView) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(view)
}
