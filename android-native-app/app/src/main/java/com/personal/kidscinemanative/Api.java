package com.personal.kidscinemanative;

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
import java.util.List;

public final class Api {
    public static final String BASE = "https://kids-drive-cinema.onrender.com";
    public static final String LIBRARY = "kids";

    /** Full library, loaded once per process. */
    public static final List<Video> videos = new ArrayList<>();
    /** The currently filtered list; the player uses it as its play queue. */
    public static final List<Video> queue = new ArrayList<>();
    public static final List<String> collections = new ArrayList<>();

    public interface LoadCallback {
        void onLoaded(String error);
    }

    private Api() {}

    public static String absolute(String pathOrUrl) {
        if (pathOrUrl == null || pathOrUrl.isEmpty()) return "";
        if (pathOrUrl.startsWith("http")) return pathOrUrl;
        return BASE + pathOrUrl;
    }

    public static void loadVideos(LoadCallback callback) {
        Handler main = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            try {
                URL url = new URL(BASE + "/api/videos?library=" + LIBRARY);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                // Render's free tier can take a while to wake from sleep.
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(120000);
                connection.setRequestProperty("Accept", "application/json");

                int status = connection.getResponseCode();
                if (status != 200) {
                    connection.disconnect();
                    main.post(() -> callback.onLoaded("Server returned " + status));
                    return;
                }

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
                connection.disconnect();

                JSONObject payload = new JSONObject(body.toString());
                JSONArray items = payload.optJSONArray("videos");
                List<Video> parsed = new ArrayList<>();
                if (items != null) {
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject item = items.getJSONObject(i);
                        Video video = new Video();
                        video.id = item.optString("id");
                        video.title = item.optString("title");
                        video.filename = item.optString("filename");
                        video.collection = item.optString("collection", "Main folder");
                        video.folderPathLabel = item.optString("folderPathLabel", video.collection);
                        video.streamUrl = absolute(item.optString("streamUrl"));
                        video.hlsUrl = absolute(item.optString("hlsUrl"));
                        video.thumbnailUrl = absolute(item.optString("thumbnailUrl"));
                        video.durationMs = item.optLong("durationMs", 0);
                        video.size = item.optLong("size", 0);
                        parsed.add(video);
                    }
                }

                List<String> parsedCollections = new ArrayList<>();
                JSONObject library = payload.optJSONObject("library");
                JSONArray names = library == null ? null : library.optJSONArray("collections");
                if (names != null) {
                    for (int i = 0; i < names.length(); i++) parsedCollections.add(names.getString(i));
                }

                main.post(() -> {
                    videos.clear();
                    videos.addAll(parsed);
                    collections.clear();
                    collections.addAll(parsedCollections);
                    callback.onLoaded(null);
                });
            } catch (Exception error) {
                main.post(() -> callback.onLoaded(
                    error.getMessage() == null ? "Could not load the library." : error.getMessage()));
            }
        }).start();
    }
}
