package com.ahmed.photogallery.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.ahmed.photogallery.databinding.ItemAlbumBinding
import com.ahmed.photogallery.model.Album
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.resource.bitmap.CenterCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners

class AlbumAdapter(
    private val onClick: (Album) -> Unit
) : ListAdapter<Album, AlbumAdapter.VH>(Diff()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemAlbumBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        val size = if (parent.width > 0) parent.width / 2 else
            parent.context.resources.displayMetrics.widthPixels / 2
        binding.ivAlbumCover.layoutParams.height = size - 24
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(getItem(position))

    inner class VH(private val b: ItemAlbumBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(album: Album) {
            val radius = (14 * b.root.resources.displayMetrics.density).toInt()
            Glide.with(b.root)
                .load(album.coverUri)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .transform(CenterCrop(), RoundedCorners(radius))
                .into(b.ivAlbumCover)

            b.tvAlbumName.text = album.name
            b.tvAlbumCount.text = "${album.count} photos"
            b.root.setOnClickListener { onClick(album) }
        }
    }

    private class Diff : DiffUtil.ItemCallback<Album>() {
        override fun areItemsTheSame(a: Album, b: Album) = a.bucketId == b.bucketId
        override fun areContentsTheSame(a: Album, b: Album) = a == b
    }
}
