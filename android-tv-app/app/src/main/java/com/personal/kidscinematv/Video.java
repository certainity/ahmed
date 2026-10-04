package com.personal.kidscinematv;

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

    private static final Pattern RELEASE = Pattern.compile("\\s+\\b(?:\\d{3,4}p|WEB[- ]?DL|WEBRip|Blu[- ]?Ray|DVD|UPSCALED|COMPLETE|HMAX|AMZN|x26[45]|HEVC|h\\s?26[45]|AAC|DDP|10bit)\\b.*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern EPISODE = Pattern.compile("\\bS(\\d{1,2})E(\\d{1,3})\\b", Pattern.CASE_INSENSITIVE);

    public String cleanTitle() {
        return cleanName(title);
    }

    public static String cleanName(String source) {
        if (source == null) return "";
        String cleaned = source.replaceAll("(?i)^www\\.[\\w.-]+\\s*-\\s*", "")
            .replaceAll("(?i)\\.(mp4|mkv|avi|webm|mov|m4v)$", "")
            .replaceAll("(?i)(S\\d{1,2})[._ ](?:720|1080|2160)$", "$1")
            .replace('.', ' ').replace('_', ' ')
            .replaceAll("(?i)\\s*[\\[(](?:\\d{3,4}p|4k|BluRay|WEBRip|WEB-DL|x26[45]|HEVC).*$", "");
        cleaned = RELEASE.matcher(cleaned).replaceAll("")
            .replaceAll("(?i)[- ](?:1080p|720p|2160p|H264|H265|WEBRip|AAC|AC[ -]?3)\\b.*$", "")
            .replaceAll("\\[.*?\\]", "").replaceAll("\\s+", " ").trim();
        return cleaned.isEmpty() ? source : cleaned;
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
