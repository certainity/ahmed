package com.personal.kidscinemanative;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Video {
    public String id;
    public String title;
    public String filename;
    public String collection;
    public String folderPathLabel;
    public String streamUrl;
    public String hlsUrl;
    public String thumbnailUrl;
    public long durationMs;
    public long size;

    private static final Pattern JUNK = Pattern.compile(
        "\\b(x264|x265|h264|h265|hevc|aac|webdl|webrip|bluray|hmax|galaxytv|edge2020)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern EPISODE = Pattern.compile("\\bS(\\d{1,2})E(\\d{1,3})\\b", Pattern.CASE_INSENSITIVE);

    public String cleanTitle() {
        String cleaned = title == null ? "" : title.replace('.', ' ').replaceAll("\\s+", " ");
        cleaned = JUNK.matcher(cleaned).replaceAll("").replaceAll("\\s+", " ").trim();
        return cleaned.isEmpty() ? title : cleaned;
    }

    public String durationLabel() {
        String haystack = (title == null ? "" : title) + " " + (filename == null ? "" : filename);
        Matcher match = EPISODE.matcher(haystack);
        if (match.find()) return "S" + match.group(1) + " E" + match.group(2);
        if (durationMs <= 0) return "Video";
        long totalSeconds = Math.max(0, Math.round(durationMs / 1000.0));
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;
        if (hours > 0) return String.format("%d:%02d:%02d", hours, minutes, seconds);
        return String.format("%d:%02d", minutes, seconds);
    }

    public String sizeLabel() {
        if (size <= 0) return "";
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        double value = size;
        int unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit += 1;
        }
        return String.format(value >= 10 ? "%.0f %s" : "%.1f %s", value, units[unit]);
    }
}
