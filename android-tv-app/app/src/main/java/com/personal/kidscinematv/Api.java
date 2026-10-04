package com.personal.kidscinematv;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Uses the existing server's approved kids library; never reads arbitrary Drive files. */
public final class Api {
    public static final String DEFAULT_BASE = "http://192.168.18.195:5174";
    public static final String ONLINE_BASE = "https://kids-drive-cinema.onrender.com";
    public static final String LIBRARY = "kids";
    public static volatile String base = DEFAULT_BASE;
    public static boolean hdEnabled = false;
    public static final List<Video> videos = new ArrayList<>();
    public static final List<Video> queue = new ArrayList<>();
    public static final List<String> collections = new ArrayList<>();
    public interface LoadCallback { void onLoaded(String error); }
    public interface StreamCallback { void onReady(String error); }

    private Api() {}

    public static void configure(Context context) {
        base = context.getSharedPreferences("tv-settings", Context.MODE_PRIVATE).getString("server", DEFAULT_BASE);
    }

    public static String normalizeBase(String value) throws Exception {
        String text = value.trim();
        if (!text.contains("://")) text = "http://" + text;
        URL parsed = new URL(text);
        String host = parsed.getHost();
        if (host.isEmpty() || parsed.getUserInfo() != null) throw new Exception("Enter your PC's address, without a username or password.");
        if (!parsed.getProtocol().equals("http") && !parsed.getProtocol().equals("https")) throw new Exception("Use an http or https address.");
        if (parsed.getProtocol().equals("http") && !isLocalHost(host)) throw new Exception("Use a local PC address, or an https online address.");
        return parsed.getProtocol() + "://" + host + (parsed.getPort() == -1 ? "" : ":" + parsed.getPort());
    }

    private static boolean isLocalHost(String host) {
        if (host.equalsIgnoreCase("localhost")) return true;
        String[] parts = host.split("\\.");
        if (parts.length != 4) return false;
        try {
            int[] bytes = new int[4];
            for (int i = 0; i < 4; i++) {
                bytes[i] = Integer.parseInt(parts[i]);
                if (bytes[i] < 0 || bytes[i] > 255) return false;
            }
            return bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168)
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31);
        } catch (NumberFormatException error) { return false; }
    }

    public static void setBase(Context context, String value) {
        base = value;
        context.getSharedPreferences("tv-settings", Context.MODE_PRIVATE).edit().putString("server", value).apply();
        videos.clear();
        queue.clear();
        collections.clear();
        hdEnabled = false;
    }

    private static String absolute(String server, String path) {
        if (path == null || path.isEmpty()) return "";
        return path.startsWith("https://") || path.startsWith("http://") ? path : server + path;
    }

    private static JSONObject getJson(String address, int readTimeout) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        try {
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(readTimeout);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != 200) throw new Exception("Server returned " + connection.getResponseCode());
            StringBuilder text = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
            }
            return new JSONObject(text.toString());
        } finally { connection.disconnect(); }
    }

    public static void loadVideos(LoadCallback callback) {
        final String server = base;
        final Handler main = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            try {
                JSONObject payload = getJson(server + "/api/videos?library=" + LIBRARY, 120000);
                JSONArray items = payload.optJSONArray("videos");
                if (items == null) throw new Exception("This address did not return a Kids Cinema library.");
                List<Video> parsed = new ArrayList<>();
                LinkedHashSet<String> names = new LinkedHashSet<>();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    Video video = new Video();
                    video.id = item.optString("id");
                    video.title = item.optString("title");
                    video.filename = item.optString("filename");
                    video.collection = item.optString("collection", "Main folder");
                    video.folderPathLabel = item.optString("folderPathLabel", video.collection);
                    video.streamUrl = absolute(server, item.optString("streamUrl"));
                    video.hlsUrl = absolute(server, item.optString("hlsUrl"));
                    video.thumbnailUrl = absolute(server, item.optString("thumbnailUrl"));
                    video.durationMs = item.optLong("durationMs", 0);
                    video.size = item.optLong("size", 0);
                    parsed.add(video);
                    names.add(video.collection);
                }
                boolean availableHd;
                try { availableHd = getJson(server + "/api/playback-config", 8000).optBoolean("hdEnabled", false); }
                catch (Exception ignored) { availableHd = false; }
                final boolean hd = availableHd;
                java.util.Collections.sort(parsed, (left, right) -> left.cleanTitle().compareToIgnoreCase(right.cleanTitle()));
                main.post(() -> {
                    if (!server.equals(base)) return;
                    videos.clear(); videos.addAll(parsed);
                    collections.clear(); collections.addAll(names);
                    hdEnabled = hd;
                    callback.onLoaded(null);
                });
            } catch (Exception error) {
                String detail = error instanceof java.io.IOException ? "Check the PC address and Wi-Fi connection."
                    : error.getMessage() == null ? "Cannot reach your PC." : error.getMessage();
                main.post(() -> { if (server.equals(base)) callback.onLoaded(detail); });
            }
        }, "kids-tv-library").start();
    }

    /** Wait for a real playlist rather than passing the server's 202 JSON to ExoPlayer. */
    public static Runnable prepareStream(String address, StreamCallback callback) {
        final Handler main = new Handler(Looper.getMainLooper());
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        final AtomicReference<HttpURLConnection> active = new AtomicReference<>();
        Thread thread = new Thread(() -> {
            String failure = "Preparing this video is taking too long. Please retry.";
            long deadline = System.currentTimeMillis() + 120000;
            while (!cancelled.get() && System.currentTimeMillis() < deadline) {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(address).openConnection();
                    active.set(connection);
                    connection.setConnectTimeout(8000);
                    connection.setReadTimeout(45000);
                    int status = connection.getResponseCode();
                    String contentType = connection.getContentType();
                    if (status == 200 && contentType != null && contentType.contains("mpegurl")) {
                        main.post(() -> { if (!cancelled.get()) callback.onReady(null); });
                        return;
                    }
                    if (status == 429) { failure = "This video is busy on Google Drive. Try another video or retry later."; break; }
                    if (status != 202 && status != 503) { failure = "The server could not prepare this video (" + status + ")."; break; }
                    Thread.sleep(750);
                } catch (Exception error) {
                    if (cancelled.get()) return;
                    failure = "Cannot reach the video stream. Check that your PC is on and both devices share Wi-Fi.";
                    break;
                } finally { if (connection != null) connection.disconnect(); active.set(null); }
            }
            final String message = failure;
            main.post(() -> { if (!cancelled.get()) callback.onReady(message); });
        }, "kids-tv-stream");
        thread.start();
        return () -> { cancelled.set(true); thread.interrupt(); HttpURLConnection connection = active.get(); if (connection != null) connection.disconnect(); };
    }
}
