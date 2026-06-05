package com.ahmed.photogallery.adapter

import android.graphics.*
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.ahmed.photogallery.R
import com.ahmed.photogallery.databinding.ItemFilterBinding
import com.ahmed.photogallery.model.PhotoFilter

class FilterAdapter(
    private val filters: List<PhotoFilter>,
    private val thumb: Bitmap?,
    private val onSelected: (PhotoFilter) -> Unit
) : RecyclerView.Adapter<FilterAdapter.FilterVH>() {

    private var selected = 0

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FilterVH {
        val b = ItemFilterBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return FilterVH(b)
    }

    override fun onBindViewHolder(holder: FilterVH, position: Int) {
        holder.bind(filters[position], position == selected)
    }

    override fun getItemCount() = filters.size

    inner class FilterVH(private val b: ItemFilterBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(filter: PhotoFilter, isSel: Boolean) {
            b.tvName.text = filter.name

            if (thumb != null) {
                val preview = if (filter.colorMatrix != null) {
                    val dst = Bitmap.createBitmap(thumb.width, thumb.height, Bitmap.Config.ARGB_8888)
                    Canvas(dst).drawBitmap(thumb, 0f, 0f, Paint().apply {
                        colorFilter = ColorMatrixColorFilter(filter.colorMatrix)
                    })
                    dst
                } else thumb
                b.ivPreview.setImageBitmap(preview)
            }

            val ctx = b.root.context
            if (isSel) {
                b.ivPreview.setBackgroundResource(R.drawable.filter_selected_border)
                b.tvName.setTextColor(ctx.getColor(R.color.accent))
            } else {
                b.ivPreview.setBackgroundResource(android.R.color.transparent)
                b.tvName.setTextColor(ctx.getColor(R.color.text_secondary))
            }

            b.root.setOnClickListener {
                val prev = selected
                selected = bindingAdapterPosition
                notifyItemChanged(prev)
                notifyItemChanged(selected)
                onSelected(filter)
            }
        }
    }
}
