package com.personal.kidscinemanative;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import java.util.List;

public class UpNextAdapter extends RecyclerView.Adapter<UpNextAdapter.UpNextHolder> {

    public interface OnPick {
        void onPick(int index);
    }

    private final List<Video> queue;
    private final OnPick onPick;
    private int currentIndex = -1;

    public UpNextAdapter(List<Video> queue, OnPick onPick) {
        this.queue = queue;
        this.onPick = onPick;
    }

    public void setCurrentIndex(int index) {
        int previous = currentIndex;
        currentIndex = index;
        if (previous >= 0) notifyItemChanged(previous);
        if (currentIndex >= 0) notifyItemChanged(currentIndex);
    }

    @NonNull
    @Override
    public UpNextHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_upnext, parent, false);
        return new UpNextHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull UpNextHolder holder, int position) {
        Video video = queue.get(position);
        holder.title.setText(video.cleanTitle());
        holder.folder.setText(video.collection);
        holder.duration.setText(video.durationLabel());
        holder.playing.setVisibility(position == currentIndex ? View.VISIBLE : View.GONE);
        holder.itemView.setActivated(position == currentIndex);
        Glide.with(holder.thumb.getContext())
            .load(video.thumbnailUrl)
            .centerCrop()
            .into(holder.thumb);
        holder.itemView.setOnClickListener((v) -> onPick.onPick(holder.getBindingAdapterPosition()));
    }

    @Override
    public int getItemCount() {
        return queue.size();
    }

    static class UpNextHolder extends RecyclerView.ViewHolder {
        final ImageView thumb;
        final TextView duration;
        final TextView title;
        final TextView folder;
        final TextView playing;

        UpNextHolder(@NonNull View itemView) {
            super(itemView);
            thumb = itemView.findViewById(R.id.upnext_thumb);
            duration = itemView.findViewById(R.id.upnext_duration);
            title = itemView.findViewById(R.id.upnext_title);
            folder = itemView.findViewById(R.id.upnext_folder);
            playing = itemView.findViewById(R.id.upnext_playing);
        }
    }
}
