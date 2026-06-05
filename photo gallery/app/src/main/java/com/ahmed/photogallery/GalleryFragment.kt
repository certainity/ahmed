package com.ahmed.photogallery

import android.Manifest
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.ahmed.photogallery.adapter.GalleryAdapter
import com.ahmed.photogallery.databinding.FragmentGalleryBinding
import com.ahmed.photogallery.model.Photo
import com.ahmed.photogallery.utils.MediaStoreUtils
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.resource.bitmap.CenterCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class GalleryFragment : Fragment() {

    private var _b: FragmentGalleryBinding? = null
    private val b get() = _b!!

    private lateinit var adapter: GalleryAdapter
    private var photos = listOf<Photo>()

    companion object {
        private const val PERM_REQUEST = 100
        private const val RECENTS_COUNT = 15
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentGalleryBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecycler()
        b.btnGrantPermission.setOnClickListener { openAppSettings() }
        b.btnCamera.setOnClickListener { launchCamera() }
        b.btnSearch.setOnClickListener { /* search: future feature */ }
        b.btnSeeAll.setOnClickListener { b.recycler.smoothScrollToPosition(0) }
        checkPermissionsAndLoad()
    }

    // ── Permissions ───────────────────────────────────────────────────────────

    private fun checkPermissionsAndLoad() {
        if (hasPermission()) {
            showState(State.LOADING)
            loadPhotos()
        } else {
            requestPermissions(requiredPerms(), PERM_REQUEST)
        }
    }

    private fun hasPermission(): Boolean =
        requiredPerms().all {
            ContextCompat.checkSelfPermission(requireContext(), it) == PackageManager.PERMISSION_GRANTED
        }

    private fun requiredPerms() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
        arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
    else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != PERM_REQUEST) return
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            showState(State.LOADING)
            loadPhotos()
        } else {
            showState(State.NO_PERMISSION)
        }
    }

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", requireContext().packageName, null)
        })
    }

    private fun launchCamera() {
        runCatching { startActivity(Intent(MediaStore.ACTION_IMAGE_CAPTURE)) }
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    fun loadPhotos() {
        viewLifecycleOwner.lifecycleScope.launch {
            showState(State.LOADING)
            photos = MediaStoreUtils.getAllPhotos(requireContext())
            adapter.submitList(photos)
            b.tvPhotoCount.text = "${photos.size}"
            b.tvSectionTitle.text = "All Photos"
            if (photos.isEmpty()) {
                showState(State.EMPTY)
            } else {
                showState(State.CONTENT)
                buildRecentsStrip(photos.take(RECENTS_COUNT))
            }
        }
    }

    private fun buildRecentsStrip(recents: List<Photo>) {
        b.layoutRecents.visibility = View.VISIBLE
        b.layoutSectionHeader.visibility = View.VISIBLE
        b.recentsContainer.removeAllViews()

        val dp = resources.displayMetrics.density
        val size = (80 * dp).toInt()
        val margin = (4 * dp).toInt()
        val radius = (12 * dp).toInt()

        recents.forEach { photo ->
            val iv = ImageView(requireContext()).apply {
                layoutParams = LinearLayout.LayoutParams(size, size).apply { marginEnd = margin }
                scaleType = ImageView.ScaleType.CENTER_CROP
                setBackgroundResource(R.drawable.bg_recents_item)
                clipToOutline = true
                setOnClickListener {
                    PhotoViewerActivity.photosCache = photos
                    startActivity(
                        Intent(requireContext(), PhotoViewerActivity::class.java).apply {
                            putExtra(PhotoViewerActivity.EXTRA_POS, photos.indexOf(photo))
                        }
                    )
                }
            }
            Glide.with(this)
                .load(photo.uri)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .transform(CenterCrop(), RoundedCorners(radius))
                .into(iv)
            b.recentsContainer.addView(iv)
        }
    }

    // ── RecyclerView ──────────────────────────────────────────────────────────

    private fun setupRecycler() {
        adapter = GalleryAdapter(
            onPhotoClick = { _, pos ->
                PhotoViewerActivity.photosCache = photos
                startActivity(
                    Intent(requireContext(), PhotoViewerActivity::class.java).apply {
                        putExtra(PhotoViewerActivity.EXTRA_POS, pos)
                    }
                )
            },
            onSelectionChanged = { count ->
                if (count == 0) {
                    adapter.clearSelection()
                    b.selectionBar.visibility = View.GONE
                } else {
                    b.selectionBar.visibility = View.VISIBLE
                    b.tvSelCount.text = "$count ${getString(R.string.selected)}"
                }
            }
        )
        b.recycler.layoutManager = GridLayoutManager(requireContext(), 3)
        b.recycler.adapter = adapter
        b.recycler.setHasFixedSize(true)

        b.btnSelShare.setOnClickListener { shareSelected() }
        b.btnSelDelete.setOnClickListener { confirmDeleteSelected() }
    }

    private fun shareSelected() {
        val selected = adapter.getSelectedPhotos(photos)
        if (selected.isEmpty()) return
        val uris = ArrayList(selected.map { it.uri })
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "image/*"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "Share"))
    }

    private fun confirmDeleteSelected() {
        val count = adapter.getSelectedCount()
        if (count == 0) return
        AlertDialog.Builder(requireContext())
            .setMessage(getString(R.string.delete_confirm, count))
            .setPositiveButton(R.string.delete) { _, _ -> deleteSelected() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun deleteSelected() {
        val toDelete = adapter.getSelectedPhotos(photos)
        if (toDelete.isEmpty()) return
        viewLifecycleOwner.lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                toDelete.forEach { photo ->
                    runCatching {
                        requireContext().contentResolver.delete(
                            ContentUris.withAppendedId(
                                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, photo.id),
                            null, null)
                    }
                }
            }
            adapter.clearSelection()
            b.selectionBar.visibility = View.GONE
            loadPhotos()
        }
    }

    // ── State management ──────────────────────────────────────────────────────

    private enum class State { LOADING, CONTENT, EMPTY, NO_PERMISSION }

    private fun showState(state: State) {
        b.progress.visibility     = if (state == State.LOADING) View.VISIBLE else View.GONE
        b.recycler.visibility     = if (state == State.CONTENT) View.VISIBLE else View.GONE
        b.layoutEmpty.visibility  = if (state == State.EMPTY) View.VISIBLE else View.GONE
        b.layoutNoPerm.visibility = if (state == State.NO_PERMISSION) View.VISIBLE else View.GONE
        b.selectionBar.visibility = View.GONE
        if (state != State.CONTENT) {
            b.layoutRecents.visibility = View.GONE
            b.layoutSectionHeader.visibility = View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _b = null
    }
}
