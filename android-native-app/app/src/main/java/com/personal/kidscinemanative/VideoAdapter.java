package com.personal.kidscinemanative;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import java.util.ArrayList;
import java.util.List;

public class VideoAdapter extends RecyclerView.Adapter<VideoAdapter.VideoHolder> {

    public interface OnVideoClick {
        void onClick(int positionInList);
    }

    private final List<Video> items = new ArrayList<>();
    private final OnVideoClick onClick;

    public VideoAdapter(OnVideoClick onClick) {
        this.onClick = onClick;
    }

    public void submit(List<Video> videos) {
        items.clear();
        items.addAll(videos);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VideoHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_video, parent, false);
        return new VideoHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull VideoHolder holder, int position) {
        Video video = items.get(position);
        holder.title.setText(video.cleanTitle());
        holder.subtitle.setText(video.collection + (video.size > 0 ? " · " + video.sizeLabel() : ""));
        holder.duration.setText(video.durationLabel());
        Glide.with(holder.thumbnail.getContext())
            .load(video.thumbnailUrl)
            .centerCrop()
            .into(holder.thumbnail);
        holder.itemView.setOnClickListener((v) -> onClick.onClick(holder.getBindingAdapterPosition()));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class VideoHolder extends RecyclerView.ViewHolder {
        final ThumbFrameLayout thumbFrame;
        final ImageView thumbnail;
        final TextView duration;
        final TextView title;
        final TextView subtitle;

        VideoHolder(@NonNull View itemView) {
            super(itemView);
            thumbFrame = itemView.findViewById(R.id.thumb_frame);
            thumbnail = itemView.findViewById(R.id.thumbnail);
            duration = itemView.findViewById(R.id.duration);
            title = itemView.findViewById(R.id.title);
            subtitle = itemView.findViewById(R.id.subtitle);
        }
    }
}
