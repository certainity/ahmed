package com.ahmed.photogallery

import android.content.ContentUris
import android.content.Intent
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityOptionsCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.ahmed.photogallery.adapter.GalleryAdapter
import com.ahmed.photogallery.databinding.ActivityAlbumDetailBinding
import com.ahmed.photogallery.model.GalleryItem
import com.ahmed.photogallery.model.Photo
import com.ahmed.photogallery.utils.MediaStoreUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AlbumDetailActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BUCKET_ID = "bucket_id"
        const val EXTRA_ALBUM_NAME = "album_name"
    }

    private lateinit var b: ActivityAlbumDetailBinding
    private lateinit var adapter: GalleryAdapter
    private var photos = listOf<Photo>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityAlbumDetailBinding.inflate(layoutInflater)
        setContentView(b.root)

        val bucketId = intent.getLongExtra(EXTRA_BUCKET_ID, -1L)
        val albumName = intent.getStringExtra(EXTRA_ALBUM_NAME) ?: "Album"

        b.tvAlbumTitle.text = albumName
        b.btnBack.setOnClickListener { finish() }

        adapter = GalleryAdapter(
            onPhotoClick = { _, pos, sharedView ->
                PhotoViewerActivity.photosCache = photos
                val intent = Intent(this, PhotoViewerActivity::class.java).apply {
                    putExtra(PhotoViewerActivity.EXTRA_POS, pos)
                }
                val options = ActivityOptionsCompat.makeSceneTransitionAnimation(
                    this, sharedView, sharedView.transitionName ?: "photo_transition"
                )
                startActivity(intent, options.toBundle())
            },
            onSelectionChanged = { count ->
                if (count == 0) adapter.clearSelection()
            }
        )

        val layoutManager = GridLayoutManager(this, 3)
        layoutManager.spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
            override fun getSpanSize(position: Int) =
                if (adapter.getItemViewType(position) == GalleryAdapter.TYPE_HEADER) 3 else 1
        }
        b.recycler.layoutManager = layoutManager
        b.recycler.adapter = adapter
        b.recycler.setHasFixedSize(false)

        lifecycleScope.launch {
            b.progress.visibility = View.VISIBLE
            photos = withContext(Dispatchers.IO) { loadAlbumPhotos(bucketId) }
            adapter.submitList(photos.map { GalleryItem.PhotoItem(it) })
            b.tvPhotoCount.text = "${photos.size} photos"
            b.progress.visibility = View.GONE
            b.recycler.visibility = View.VISIBLE
        }
    }

    private fun loadAlbumPhotos(bucketId: Long): List<Photo> {
        val result = mutableListOf<Photo>()
        val collection = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q)
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        else MediaStore.Images.Media.EXTERNAL_CONTENT_URI

        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME
        )

        contentResolver.query(
            collection, projection,
            "${MediaStore.Images.Media.BUCKET_ID} = ?",
            arrayOf(bucketId.toString()),
            "${MediaStore.Images.Media.DATE_ADDED} DESC"
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            val bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
            while (cursor.moveToNext()) {
                val id = cursor.getLong(idCol)
                result.add(Photo(
                    id = id,
                    uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id),
                    displayName = cursor.getString(nameCol) ?: "",
                    size = cursor.getLong(sizeCol),
                    dateAdded = cursor.getLong(dateCol),
                    bucketName = cursor.getString(bucketCol) ?: ""
                ))
            }
        }
        return result
    }
}
