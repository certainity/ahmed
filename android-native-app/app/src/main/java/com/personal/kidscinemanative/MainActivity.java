package com.personal.kidscinemanative;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.drawerlayout.widget.DrawerLayout;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String ALL_FOLDERS = "All folders";

    private DrawerLayout drawerLayout;
    private VideoAdapter adapter;
    private FolderAdapter folderAdapter;
    private ProgressBar loading;
    private TextView statusText;
    private TextView activeFolderLabel;
    private final List<Video> filtered = new ArrayList<>();
    private String activeFolder = ALL_FOLDERS;
    private String query = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        drawerLayout = findViewById(R.id.drawer_layout);
        loading = findViewById(R.id.loading);
        statusText = findViewById(R.id.status_text);
        activeFolderLabel = findViewById(R.id.active_folder_label);

        findViewById(R.id.menu_button).setOnClickListener((v) -> drawerLayout.openDrawer(Gravity.START));

        RecyclerView grid = findViewById(R.id.video_grid);
        boolean landscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        grid.setLayoutManager(new GridLayoutManager(this, landscape ? 3 : 2));
        adapter = new VideoAdapter(this::openPlayer);
        grid.setAdapter(adapter);

        RecyclerView folderList = findViewById(R.id.folder_list);
        folderList.setLayoutManager(new LinearLayoutManager(this));
        folderAdapter = new FolderAdapter((folderName) -> {
            activeFolder = folderName;
            folderAdapter.setActive(folderName);
            drawerLayout.closeDrawers();
            applyFilter();
        });
        folderList.setAdapter(folderAdapter);

        EditText search = findViewById(R.id.search_input);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}

            @Override
            public void afterTextChanged(Editable editable) {
                query = editable.toString().trim().toLowerCase(Locale.ROOT);
                applyFilter();
            }
        });

        if (Api.videos.isEmpty()) {
            loadLibrary();
        } else {
            bindFolders();
            applyFilter();
            loading.setVisibility(View.GONE);
        }
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
            bindFolders();
            applyFilter();
        });
    }

    private void bindFolders() {
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
    }

    private void applyFilter() {
        filtered.clear();
        for (Video video : Api.videos) {
            if (!ALL_FOLDERS.equals(activeFolder) && !activeFolder.equals(video.collection)) continue;
            if (!query.isEmpty()) {
                String haystack = (video.title + " " + video.cleanTitle() + " " + video.filename + " "
                    + video.collection + " " + video.folderPathLabel).toLowerCase(Locale.ROOT);
                if (!haystack.contains(query)) continue;
            }
            filtered.add(video);
        }
        adapter.submit(filtered);
        activeFolderLabel.setText(ALL_FOLDERS.equals(activeFolder) ? "" : activeFolder);
        if (!Api.videos.isEmpty()) {
            statusText.setText(filtered.size() + " videos"
                + (ALL_FOLDERS.equals(activeFolder) ? "" : " in " + activeFolder));
        }
    }

    private void openPlayer(int indexInFiltered) {
        if (indexInFiltered < 0 || indexInFiltered >= filtered.size()) return;
        Video picked = filtered.get(indexInFiltered);

        // Queue the whole folder of the picked video so that when one episode
        // ends the next one in that folder plays automatically.
        List<Video> folderQueue = new ArrayList<>();
        for (Video video : Api.videos) {
            if (video.collection.equals(picked.collection)) folderQueue.add(video);
        }
        int startIndex = folderQueue.indexOf(picked);
        if (startIndex < 0) {
            folderQueue = new ArrayList<>(filtered);
            startIndex = indexInFiltered;
        }

        Api.queue.clear();
        Api.queue.addAll(folderQueue);
        Intent intent = new Intent(this, PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_INDEX, startIndex);
        startActivity(intent);
    }

    @Override
    public void onBackPressed() {
        if (drawerLayout != null && drawerLayout.isDrawerOpen(Gravity.START)) {
            drawerLayout.closeDrawers();
            return;
        }
        super.onBackPressed();
    }
}
