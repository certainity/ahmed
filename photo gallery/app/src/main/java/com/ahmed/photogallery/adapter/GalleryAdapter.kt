package com.ahmed.photogallery.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.ahmed.photogallery.databinding.ItemPhotoBinding
import com.ahmed.photogallery.model.Photo
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy

class GalleryAdapter(
    private val onPhotoClick: (Photo, Int) -> Unit,
    private val onSelectionChanged: (Int) -> Unit
) : ListAdapter<Photo, GalleryAdapter.PhotoVH>(Diff()) {

    private val selected = mutableSetOf<Long>()
    var selectionMode = false
        private set

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PhotoVH {
        val binding = ItemPhotoBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        val size = parent.width / 3
        binding.root.layoutParams = RecyclerView.LayoutParams(RecyclerView.LayoutParams.MATCH_PARENT, size)
        return PhotoVH(binding)
    }

    override fun onBindViewHolder(holder: PhotoVH, position: Int) = holder.bind(getItem(position))

    fun clearSelection() {
        selected.clear()
        selectionMode = false
        notifyDataSetChanged()
    }

    fun getSelectedCount() = selected.size

    inner class PhotoVH(private val b: ItemPhotoBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(photo: Photo) {
            Glide.with(b.root)
                .load(photo.uri)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .centerCrop()
                .into(b.ivPhoto)

            val isSel = selected.contains(photo.id)
            b.overlay.visibility = if (isSel) View.VISIBLE else View.GONE
            b.ivCheck.visibility = if (isSel) View.VISIBLE else View.GONE

            b.root.setOnClickListener {
                if (selectionMode) {
                    toggle(photo)
                } else {
                    onPhotoClick(photo, bindingAdapterPosition)
                }
            }

            b.root.setOnLongClickListener {
                if (!selectionMode) selectionMode = true
                toggle(photo)
                true
            }
        }

        private fun toggle(photo: Photo) {
            if (selected.contains(photo.id)) selected.remove(photo.id)
            else selected.add(photo.id)
            notifyItemChanged(bindingAdapterPosition)
            onSelectionChanged(selected.size)
        }
    }

    private class Diff : DiffUtil.ItemCallback<Photo>() {
        override fun areItemsTheSame(a: Photo, b: Photo) = a.id == b.id
        override fun areContentsTheSame(a: Photo, b: Photo) = a == b
    }
}
