package com.personal.kidscinemanative;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String ALL_FOLDERS = "All folders";
    private static final long SHORT_MAX_MS = 8 * 60 * 1000;

    private VideoAdapter videoAdapter;
    private FolderAdapter folderAdapter;
    private RecyclerView feed;
    private ProgressBar loading;
    private TextView statusText;
    private EditText searchInput;
    private LinearLayout chipsRow;
    private View chipsScroll;
    private final List<Video> filtered = new ArrayList<>();
    private String activeFolder = ALL_FOLDERS;
    private String activeTab = "home"; // home | shorts | folders | you
    private String query = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        loading = findViewById(R.id.loading);
        statusText = findViewById(R.id.status_text);
        chipsRow = findViewById(R.id.chips_row);
        chipsScroll = findViewById(R.id.chips_scroll);
        searchInput = findViewById(R.id.search_input);

        feed = findViewById(R.id.feed);
        feed.setLayoutManager(new LinearLayoutManager(this));
        videoAdapter = new VideoAdapter(this::openPlayer);
        folderAdapter = new FolderAdapter((folderName) -> {
            activeFolder = folderName;
            switchTab("home");
        });
        feed.setAdapter(videoAdapter);

        findViewById(R.id.search_toggle).setOnClickListener((v) -> {
            boolean show = searchInput.getVisibility() != View.VISIBLE;
            searchInput.setVisibility(show ? View.VISIBLE : View.GONE);
            if (show) {
                searchInput.requestFocus();
            } else {
                searchInput.setText("");
            }
        });

        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}

            @Override
            public void afterTextChanged(Editable editable) {
                query = editable.toString().trim().toLowerCase(Locale.ROOT);
                refresh();
            }
        });

        findViewById(R.id.tab_home).setOnClickListener((v) -> switchTab("home"));
        findViewById(R.id.tab_shorts).setOnClickListener((v) -> switchTab("shorts"));
        findViewById(R.id.tab_folders).setOnClickListener((v) -> switchTab("folders"));
        findViewById(R.id.tab_you).setOnClickListener((v) -> switchTab("you"));

        if (Api.videos.isEmpty()) {
            loadLibrary();
        } else {
            bindChips();
            refresh();
            loading.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Refresh progress bars / continue-watching after returning from the player.
        if (!Api.videos.isEmpty()) refresh();
    }

    private void loadLibrary() {
        loading.setVisibility(View.VISIBLE);
        statusText.setText("Loading your Drive library... first load can take a minute.");
        Api.loadVideos((error) -> {
            loading.setVisibility(View.GONE);
            if (error != null) {
                statusText.setText("Could not load: " + error + " - tap here to retry.");
                statusText.setOnClickListener((v) -> loadLibrary());
                return;
            }
            statusText.setText("");
            statusText.setOnClickListener(null);
            bindChips();
            refresh();
        });
    }

    private void switchTab(String tab) {
        activeTab = tab;
        int active = 0xFFF1F1F1;
        int idle = 0xFF8A8A8A;
        ((TextView) findViewById(R.id.tab_home_label)).setTextColor(tab.equals("home") ? active : idle);
        ((TextView) findViewById(R.id.tab_shorts_label)).setTextColor(tab.equals("shorts") ? active : idle);
        ((TextView) findViewById(R.id.tab_folders_label)).setTextColor(tab.equals("folders") ? active : idle);
        ((TextView) findViewById(R.id.tab_you_label)).setTextColor(tab.equals("you") ? active : idle);
        refresh();
    }

    private void bindChips() {
        chipsRow.removeAllViews();
        List<String> names = new ArrayList<>();
        names.add(ALL_FOLDERS);
        names.addAll(Api.collections);
        for (String name : names) {
            TextView chip = new TextView(this);
            chip.setText(ALL_FOLDERS.equals(name) ? "All" : name);
            chip.setTextSize(13);
            chip.setMaxLines(1);
            chip.setBackgroundResource(R.drawable.chip_bg);
            int padH = (int) (12 * getResources().getDisplayMetrics().density);
            int padV = (int) (7 * getResources().getDisplayMetrics().density);
            chip.setPadding(padH, padV, padH, padV);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.setMarginEnd((int) (8 * getResources().getDisplayMetrics().density));
            chip.setLayoutParams(params);
            chip.setTag(name);
            chip.setOnClickListener((v) -> {
                activeFolder = (String) v.getTag();
                refresh();
            });
            chipsRow.addView(chip);
        }
        styleChips();
    }

    private void styleChips() {
        for (int i = 0; i < chipsRow.getChildCount(); i++) {
            TextView chip = (TextView) chipsRow.getChildAt(i);
            boolean isActive = activeFolder.equals(chip.getTag());
            chip.setActivated(isActive);
            chip.setTextColor(isActive ? 0xFF0F0F0F : 0xFFF1F1F1);
            chip.setTypeface(null, isActive ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        }
    }

    private Map<String, Long> readProgress() {
        Map<String, Long> positions = new HashMap<>();
        SharedPreferences prefs = getSharedPreferences("watch-progress", MODE_PRIVATE);
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            if (entry.getKey().startsWith("pos:") && entry.getValue() instanceof Long) {
                positions.put(entry.getKey().substring(4), (Long) entry.getValue());
            }
        }
        return positions;
    }

    private void refresh() {
        if (activeTab.equals("folders")) {
            chipsScroll.setVisibility(View.GONE);
            Map<String, Integer> counts = new LinkedHashMap<>();
            for (Video video : Api.videos) {
                Integer count = counts.get(video.collection);
                counts.put(video.collection, count == null ? 1 : count + 1);
            }
            List<FolderAdapter.FolderEntry> entries = new ArrayList<>();
            entries.add(new FolderAdapter.FolderEntry(ALL_FOLDERS, Api.videos.size()));
            for (String name : Api.collections) {
                Integer count = counts.get(name);
                entries.add(new FolderAdapter.FolderEntry(name, count == null ? 0 : count));
            }
            folderAdapter.submit(entries, activeFolder);
            feed.setAdapter(folderAdapter);
            statusText.setText("Pick a folder");
            return;
        }

        chipsScroll.setVisibility(activeTab.equals("you") ? View.GONE : View.VISIBLE);
        styleChips();

        Map<String, Long> progress = readProgress();
        SharedPreferences prefs = getSharedPreferences("watch-progress", MODE_PRIVATE);

        filtered.clear();
        for (Video video : Api.videos) {
            if (activeTab.equals("shorts") && !(video.durationMs > 0 && video.durationMs <= SHORT_MAX_MS)) continue;
            if (activeTab.equals("you") && !(progress.containsKey(video.id) && progress.get(video.id) > 5000)) continue;
            if (!activeTab.equals("you") && !ALL_FOLDERS.equals(activeFolder)
                && !activeFolder.equals(video.collection)) continue;
            if (!query.isEmpty()) {
                String haystack = (video.title + " " + video.cleanTitle() + " " + video.filename + " "
                    + video.collection + " " + video.folderPathLabel).toLowerCase(Locale.ROOT);
                if (!haystack.contains(query)) continue;
            }
            filtered.add(video);
        }

        if (activeTab.equals("you")) {
            java.util.Collections.sort(filtered, (a, b) -> Long.compare(
                prefs.getLong("t:" + b.id, 0), prefs.getLong("t:" + a.id, 0)));
        }

        videoAdapter.submit(filtered, progress);
        feed.setAdapter(videoAdapter);

        if (!Api.videos.isEmpty()) {
            String label = activeTab.equals("you") ? "Continue watching"
                : activeTab.equals("shorts") ? "Shorts"
                : ALL_FOLDERS.equals(activeFolder) ? "All folders" : activeFolder;
            statusText.setText(filtered.size() + " videos · " + label);
        }
    }

    private void openPlayer(int indexInFiltered) {
        if (indexInFiltered < 0 || indexInFiltered >= filtered.size()) return;
        Video picked = filtered.get(indexInFiltered);

        List<Video> queue;
        int startIndex;
        if (activeTab.equals("shorts")) {
            queue = new ArrayList<>(filtered);
            startIndex = indexInFiltered;
        } else {
            // Queue the picked video's whole folder so the next episode always
            // autoplays, even when the video was found through search.
            queue = new ArrayList<>();
            for (Video video : Api.videos) {
                if (video.collection.equals(picked.collection)) queue.add(video);
            }
            startIndex = queue.indexOf(picked);
            if (startIndex < 0) {
                queue = new ArrayList<>(filtered);
                startIndex = indexInFiltered;
            }
        }

        Api.queue.clear();
        Api.queue.addAll(queue);
        Intent intent = new Intent(this, PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_INDEX, startIndex);
        startActivity(intent);
    }
}
