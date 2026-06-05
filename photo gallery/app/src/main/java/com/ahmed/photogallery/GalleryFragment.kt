package com.ahmed.photogallery

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.ahmed.photogallery.adapter.GalleryAdapter
import com.ahmed.photogallery.databinding.FragmentGalleryBinding
import com.ahmed.photogallery.model.Photo
import com.ahmed.photogallery.utils.MediaStoreUtils
import kotlinx.coroutines.launch

class GalleryFragment : Fragment() {

    private var _b: FragmentGalleryBinding? = null
    private val b get() = _b!!

    private lateinit var adapter: GalleryAdapter
    private var photos = listOf<Photo>()

    companion object {
        private const val PERM_REQUEST = 100
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

    private fun requiredPerms() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
    } else {
        arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

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

    // ── Data loading ──────────────────────────────────────────────────────────

    fun loadPhotos() {
        viewLifecycleOwner.lifecycleScope.launch {
            showState(State.LOADING)
            photos = MediaStoreUtils.getAllPhotos(requireContext())
            adapter.submitList(photos)
            b.tvPhotoCount.text = if (photos.isNotEmpty()) "${photos.size} photos" else ""
            showState(if (photos.isEmpty()) State.EMPTY else State.CONTENT)
        }
    }

    // ── RecyclerView ──────────────────────────────────────────────────────────

    private fun setupRecycler() {
        adapter = GalleryAdapter(
            onPhotoClick = { photo, pos ->
                startActivity(
                    Intent(requireContext(), PhotoViewerActivity::class.java).apply {
                        putParcelableArrayListExtra(PhotoViewerActivity.EXTRA_PHOTOS, ArrayList(photos))
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
                    b.tvSelCount.text = "$count selected"
                }
            }
        )
        b.recycler.layoutManager = GridLayoutManager(requireContext(), 3)
        b.recycler.adapter = adapter
        b.recycler.setHasFixedSize(true)
    }

    // ── State management ──────────────────────────────────────────────────────

    private enum class State { LOADING, CONTENT, EMPTY, NO_PERMISSION }

    private fun showState(state: State) {
        b.progress.visibility     = if (state == State.LOADING) View.VISIBLE else View.GONE
        b.recycler.visibility     = if (state == State.CONTENT) View.VISIBLE else View.GONE
        b.layoutEmpty.visibility  = if (state == State.EMPTY) View.VISIBLE else View.GONE
        b.layoutNoPerm.visibility = if (state == State.NO_PERMISSION) View.VISIBLE else View.GONE
        b.selectionBar.visibility = View.GONE
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _b = null
    }
}
