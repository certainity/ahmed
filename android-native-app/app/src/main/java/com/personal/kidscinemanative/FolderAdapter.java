package com.personal.kidscinemanative;

import android.graphics.drawable.GradientDrawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class FolderAdapter extends RecyclerView.Adapter<FolderAdapter.FolderHolder> {

    public interface OnFolderClick {
        void onClick(String folderName);
    }

    public static class FolderEntry {
        public final String name;
        public final int count;

        public FolderEntry(String name, int count) {
            this.name = name;
            this.count = count;
        }
    }

    private final List<FolderEntry> items = new ArrayList<>();
    private final OnFolderClick onClick;
    private String activeFolder = "";

    public FolderAdapter(OnFolderClick onClick) {
        this.onClick = onClick;
    }

    public void submit(List<FolderEntry> folders, String active) {
        items.clear();
        items.addAll(folders);
        activeFolder = active;
        notifyDataSetChanged();
    }

    public void setActive(String active) {
        activeFolder = active;
        notifyDataSetChanged();
    }

    private static int hueColor(String name, int lightness) {
        int hash = 0;
        for (int i = 0; i < name.length(); i++) hash = (hash * 31 + name.charAt(i)) % 360;
        float[] hsv = {hash, 0.65f, lightness / 100f};
        return android.graphics.Color.HSVToColor(hsv);
    }

    @NonNull
    @Override
    public FolderHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_folder, parent, false);
        return new FolderHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull FolderHolder holder, int position) {
        FolderEntry entry = items.get(position);
        holder.name.setText(entry.name);
        holder.count.setText(String.valueOf(entry.count));
        holder.itemView.setActivated(entry.name.equals(activeFolder));

        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(hueColor(entry.name, 55));
        holder.avatar.setBackground(circle);
        String trimmed = entry.name.trim();
        holder.avatar.setText(trimmed.isEmpty() ? "?" : trimmed.substring(0, 1).toUpperCase());

        holder.itemView.setOnClickListener((v) -> onClick.onClick(entry.name));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class FolderHolder extends RecyclerView.ViewHolder {
        final TextView avatar;
        final TextView name;
        final TextView count;

        FolderHolder(@NonNull View itemView) {
            super(itemView);
            avatar = itemView.findViewById(R.id.folder_avatar);
            name = itemView.findViewById(R.id.folder_name);
            count = itemView.findViewById(R.id.folder_count);
        }
    }
}
