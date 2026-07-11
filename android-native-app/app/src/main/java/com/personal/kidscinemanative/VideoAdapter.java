package com.personal.kidscinemanative;

import android.graphics.drawable.GradientDrawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class VideoAdapter extends RecyclerView.Adapter<VideoAdapter.VideoHolder> {

    public interface OnVideoClick {
        void onClick(int positionInList);
    }

    private final List<Video> items = new ArrayList<>();
    private final Map<String, Long> progressMs = new HashMap<>();
    private final OnVideoClick onClick;

    public VideoAdapter(OnVideoClick onClick) {
        this.onClick = onClick;
    }

    public void submit(List<Video> videos, Map<String, Long> watchedPositionsMs) {
        items.clear();
        items.addAll(videos);
        progressMs.clear();
        if (watchedPositionsMs != null) progressMs.putAll(watchedPositionsMs);
        notifyDataSetChanged();
    }

    static int hueColor(String name) {
        int hash = 0;
        for (int i = 0; i < name.length(); i++) hash = (hash * 31 + name.charAt(i)) % 360;
        float[] hsv = {hash, 0.65f, 0.55f};
        return android.graphics.Color.HSVToColor(hsv);
    }

    static void bindAvatar(TextView avatar, String name) {
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(hueColor(name));
        avatar.setBackground(circle);
        String trimmed = name.trim();
        avatar.setText(trimmed.isEmpty() ? "?" : trimmed.substring(0, 1).toUpperCase());
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
        bindAvatar(holder.avatar, video.collection);

        Long watched = progressMs.get(video.id);
        if (watched != null && watched > 5000 && video.durationMs > 0) {
            holder.watchProgress.setVisibility(View.VISIBLE);
            holder.watchProgress.setProgress((int) Math.min(1000, watched * 1000 / video.durationMs));
        } else {
            holder.watchProgress.setVisibility(View.GONE);
        }

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
        final ImageView thumbnail;
        final TextView duration;
        final TextView title;
        final TextView subtitle;
        final TextView avatar;
        final ProgressBar watchProgress;

        VideoHolder(@NonNull View itemView) {
            super(itemView);
            thumbnail = itemView.findViewById(R.id.thumbnail);
            duration = itemView.findViewById(R.id.duration);
            title = itemView.findViewById(R.id.title);
            subtitle = itemView.findViewById(R.id.subtitle);
            avatar = itemView.findViewById(R.id.card_avatar);
            watchProgress = itemView.findViewById(R.id.watch_progress);
        }
    }
}
