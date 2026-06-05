package com.ahmed.photogallery

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.ahmed.photogallery.adapter.AlbumAdapter
import com.ahmed.photogallery.databinding.FragmentAlbumsBinding
import com.ahmed.photogallery.utils.MediaStoreUtils
import kotlinx.coroutines.launch

class AlbumsFragment : Fragment() {

    private var _b: FragmentAlbumsBinding? = null
    private val b get() = _b!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentAlbumsBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        loadAlbums()
    }

    fun loadAlbums() {
        val adapter = AlbumAdapter { album ->
            // Open gallery filtered to this album
            startActivity(
                Intent(requireContext(), AlbumDetailActivity::class.java).apply {
                    putExtra(AlbumDetailActivity.EXTRA_BUCKET_ID, album.bucketId)
                    putExtra(AlbumDetailActivity.EXTRA_ALBUM_NAME, album.name)
                }
            )
        }
        b.recyclerAlbums.layoutManager = GridLayoutManager(requireContext(), 2)
        b.recyclerAlbums.adapter = adapter
        b.recyclerAlbums.setHasFixedSize(false)

        viewLifecycleOwner.lifecycleScope.launch {
            b.progressAlbums.visibility = View.VISIBLE
            b.recyclerAlbums.visibility = View.GONE
            b.layoutAlbumsEmpty.visibility = View.GONE

            val albums = MediaStoreUtils.getAlbums(requireContext())
            b.tvAlbumCount.text = "${albums.size} albums"
            adapter.submitList(albums)

            b.progressAlbums.visibility = View.GONE
            if (albums.isEmpty()) {
                b.layoutAlbumsEmpty.visibility = View.VISIBLE
            } else {
                b.recyclerAlbums.visibility = View.VISIBLE
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _b = null
    }
}
