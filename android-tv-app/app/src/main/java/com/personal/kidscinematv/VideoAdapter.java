package com.personal.kidscinematv;

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

public class VideoAdapter extends RecyclerView.Adapter<VideoAdapter.Holder> {
    public interface OnVideoClick { void onClick(int position); }
    private final OnVideoClick onClick;
    private final List<Video> items = new ArrayList<>();
    private final Map<String, Long> progress = new HashMap<>();
    public VideoAdapter(OnVideoClick callback) { onClick = callback; }
    public void submit(List<Video> videos, Map<String, Long> watched) {
        items.clear(); items.addAll(videos);
        progress.clear(); progress.putAll(watched);
        notifyDataSetChanged();
    }
    @NonNull @Override public Holder onCreateViewHolder(@NonNull ViewGroup parent, int type) {
        return new Holder(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_video, parent, false));
    }
    @Override public void onBindViewHolder(@NonNull Holder holder, int position) {
        Video video = items.get(position);
        holder.title.setText(video.cleanTitle());
        holder.subtitle.setText(Video.cleanName(video.collection));
        holder.duration.setText(video.durationLabel());
        holder.itemView.setContentDescription(video.cleanTitle() + ", " + Video.cleanName(video.collection));
        long watched = progress.containsKey(video.id) ? progress.get(video.id) : 0;
        holder.progress.setVisibility(watched > 5000 && video.durationMs > 0 ? View.VISIBLE : View.GONE);
        if (video.durationMs > 0) holder.progress.setProgress((int) Math.min(1000, watched * 1000 / video.durationMs));
        Glide.with(holder.thumbnail).load(video.thumbnailUrl).fitCenter()
            .placeholder(R.drawable.projector).error(R.drawable.projector).into(holder.thumbnail);
        holder.itemView.setOnClickListener(view -> {
            int index = holder.getBindingAdapterPosition();
            if (index != RecyclerView.NO_POSITION) onClick.onClick(index);
        });
    }
    @Override public int getItemCount() { return items.size(); }
    static class Holder extends RecyclerView.ViewHolder {
        final ImageView thumbnail;
        final TextView title, subtitle, duration;
        final ProgressBar progress;
        Holder(View view) {
            super(view);
            thumbnail = view.findViewById(R.id.thumbnail);
            title = view.findViewById(R.id.title);
            subtitle = view.findViewById(R.id.subtitle);
            duration = view.findViewById(R.id.duration);
            progress = view.findViewById(R.id.watch_progress);
        }
    }
}
