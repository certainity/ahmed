package com.ahmed.photogallery.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.ahmed.photogallery.databinding.ItemDateHeaderBinding
import com.ahmed.photogallery.databinding.ItemPhotoBinding
import com.ahmed.photogallery.model.GalleryItem
import com.ahmed.photogallery.model.Photo
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.resource.bitmap.CenterCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners

class GalleryAdapter(
    private val onPhotoClick: (Photo, Int) -> Unit,
    private val onSelectionChanged: (Int) -> Unit
) : ListAdapter<GalleryItem, RecyclerView.ViewHolder>(Diff()) {

    companion object {
        const val TYPE_HEADER = 0
        const val TYPE_PHOTO  = 1
    }

    private val selected = mutableSetOf<Long>()
    var selectionMode = false
        private set

    override fun getItemViewType(position: Int) = when (getItem(position)) {
        is GalleryItem.DateHeader -> TYPE_HEADER
        is GalleryItem.PhotoItem  -> TYPE_PHOTO
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return if (viewType == TYPE_HEADER) {
            val b = ItemDateHeaderBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            HeaderVH(b)
        } else {
            val b = ItemPhotoBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            val screenW = parent.context.resources.displayMetrics.widthPixels
            val size = if (parent.width > 0) parent.width / 3 else screenW / 3
            b.root.layoutParams = RecyclerView.LayoutParams(RecyclerView.LayoutParams.MATCH_PARENT, size)
            PhotoVH(b)
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = getItem(position)) {
            is GalleryItem.DateHeader -> (holder as HeaderVH).bind(item.label)
            is GalleryItem.PhotoItem  -> (holder as PhotoVH).bind(item.photo)
        }
    }

    fun clearSelection() {
        selected.clear()
        selectionMode = false
        notifyDataSetChanged()
    }

    fun getSelectedCount() = selected.size

    fun getSelectedPhotos(): List<Photo> =
        currentList.filterIsInstance<GalleryItem.PhotoItem>()
            .map { it.photo }
            .filter { selected.contains(it.id) }

    // ── Date Header VH ────────────────────────────────────────────────────────

    class HeaderVH(private val b: ItemDateHeaderBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(label: String) { b.tvDate.text = label }
    }

    // ── Photo VH ──────────────────────────────────────────────────────────────

    inner class PhotoVH(private val b: ItemPhotoBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(photo: Photo) {
            val radius = (14 * b.root.resources.displayMetrics.density).toInt()
            Glide.with(b.root)
                .load(photo.uri)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .transform(CenterCrop(), RoundedCorners(radius))
                .into(b.ivPhoto)

            val isSel = selected.contains(photo.id)
            b.overlay.visibility = if (isSel) View.VISIBLE else View.GONE
            b.ivCheck.visibility = if (isSel) View.VISIBLE else View.GONE

            b.root.setOnClickListener {
                if (selectionMode) toggle(photo)
                else {
                    val photoIndex = currentList.filterIsInstance<GalleryItem.PhotoItem>()
                        .indexOfFirst { it.photo.id == photo.id }
                    onPhotoClick(photo, photoIndex)
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

    // ── Diff ──────────────────────────────────────────────────────────────────

    private class Diff : DiffUtil.ItemCallback<GalleryItem>() {
        override fun areItemsTheSame(a: GalleryItem, b: GalleryItem): Boolean = when {
            a is GalleryItem.DateHeader && b is GalleryItem.DateHeader -> a.label == b.label
            a is GalleryItem.PhotoItem  && b is GalleryItem.PhotoItem  -> a.photo.id == b.photo.id
            else -> false
        }
        override fun areContentsTheSame(a: GalleryItem, b: GalleryItem) = a == b
    }
}
