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
import androidx.core.app.ActivityOptionsCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.ahmed.photogallery.adapter.GalleryAdapter
import com.ahmed.photogallery.databinding.FragmentGalleryBinding
import com.ahmed.photogallery.model.GalleryItem
import com.ahmed.photogallery.model.Photo
import com.ahmed.photogallery.utils.MediaStoreUtils
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.resource.bitmap.CenterCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar
import java.util.Locale

class GalleryFragment : Fragment() {

    private var _b: FragmentGalleryBinding? = null
    private val b get() = _b!!

    private lateinit var adapter: GalleryAdapter
    private var photos = listOf<Photo>()

    companion object {
        private const val PERM_REQUEST  = 100
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
        b.swipeRefresh.setOnRefreshListener { loadPhotos() }
        b.swipeRefresh.setColorSchemeColors(
            requireContext().getColor(R.color.accent)
        )
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
            if (!b.swipeRefresh.isRefreshing) showState(State.LOADING)
            photos = MediaStoreUtils.getAllPhotos(requireContext())

            val items = buildGalleryItems(photos)
            adapter.submitList(items)

            b.tvPhotoCount.text = "${photos.size}"
            b.tvSectionTitle.text = "All Photos"
            b.swipeRefresh.isRefreshing = false

            if (photos.isEmpty()) {
                showState(State.EMPTY)
            } else {
                showState(State.CONTENT)
                buildRecentsStrip(photos.take(RECENTS_COUNT))
            }
        }
    }

    // ── Date grouping ─────────────────────────────────────────────────────────

    private fun buildGalleryItems(photos: List<Photo>): List<GalleryItem> {
        val now = System.currentTimeMillis()
        val todayStart    = startOfDay(now)
        val yesterdayStart = todayStart - 86_400_000L
        val weekStart      = todayStart - 7 * 86_400_000L
        val thisYear       = Calendar.getInstance().get(Calendar.YEAR)

        val items = mutableListOf<GalleryItem>()
        var lastLabel = ""

        photos.forEach { photo ->
            val ms = photo.dateAdded * 1000L
            val label = when {
                ms >= todayStart     -> "Today"
                ms >= yesterdayStart -> "Yesterday"
                ms >= weekStart      -> "This Week"
                else -> {
                    val cal = Calendar.getInstance().apply { timeInMillis = ms }
                    val month = cal.getDisplayName(Calendar.MONTH, Calendar.LONG, Locale.getDefault()) ?: ""
                    val year  = cal.get(Calendar.YEAR)
                    if (year == thisYear) month else "$month $year"
                }
            }
            if (label != lastLabel) {
                items.add(GalleryItem.DateHeader(label))
                lastLabel = label
            }
            items.add(GalleryItem.PhotoItem(photo))
        }
        return items
    }

    private fun startOfDay(ms: Long): Long = Calendar.getInstance().run {
        timeInMillis = ms
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0);      set(Calendar.MILLISECOND, 0)
        timeInMillis
    }

    // ── Recents strip ─────────────────────────────────────────────────────────

    private fun buildRecentsStrip(recents: List<Photo>) {
        b.layoutRecents.visibility = View.VISIBLE
        b.layoutSectionHeader.visibility = View.VISIBLE
        b.recentsContainer.removeAllViews()

        val dp     = resources.displayMetrics.density
        val size   = (80 * dp).toInt()
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
            onPhotoClick = { _, pos, sharedView ->
                PhotoViewerActivity.photosCache = photos
                val intent = Intent(requireContext(), PhotoViewerActivity::class.java).apply {
                    putExtra(PhotoViewerActivity.EXTRA_POS, pos)
                }
                val options = ActivityOptionsCompat.makeSceneTransitionAnimation(
                    requireActivity(), sharedView, sharedView.transitionName ?: "photo_transition"
                )
                startActivity(intent, options.toBundle())
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

        val layoutManager = GridLayoutManager(requireContext(), 3)
        layoutManager.spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
            override fun getSpanSize(position: Int) =
                if (adapter.getItemViewType(position) == GalleryAdapter.TYPE_HEADER) 3 else 1
        }

        b.recycler.layoutManager = layoutManager
        b.recycler.adapter = adapter
        b.recycler.setHasFixedSize(false)

        b.btnSelShare.setOnClickListener { shareSelected() }
        b.btnSelDelete.setOnClickListener { confirmDeleteSelected() }
    }

    private fun shareSelected() {
        val sel = adapter.getSelectedPhotos()
        if (sel.isEmpty()) return
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "image/*"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(sel.map { it.uri }))
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
        val toDelete = adapter.getSelectedPhotos()
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
        b.progress.visibility      = if (state == State.LOADING) View.VISIBLE else View.GONE
        b.swipeRefresh.visibility  = if (state == State.CONTENT) View.VISIBLE else View.GONE
        b.layoutEmpty.visibility   = if (state == State.EMPTY)   View.VISIBLE else View.GONE
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
