package com.ahmed.photogallery

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
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

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentGalleryBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecycler()
    }

    private fun setupRecycler() {
        adapter = GalleryAdapter(
            onPhotoClick = { photo, pos ->
                startActivity(
                    Intent(requireContext(), PhotoViewerActivity::class.java).apply {
                        putExtra(PhotoViewerActivity.EXTRA_URI, photo.uri.toString())
                        putExtra(PhotoViewerActivity.EXTRA_NAME, photo.displayName)
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
    }

    fun loadPhotos() {
        viewLifecycleOwner.lifecycleScope.launch {
            b.progress.visibility = View.VISIBLE
            photos = MediaStoreUtils.getAllPhotos(requireContext())
            adapter.submitList(photos)
            b.progress.visibility = View.GONE
            b.tvEmpty.visibility = if (photos.isEmpty()) View.VISIBLE else View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _b = null
    }
}
