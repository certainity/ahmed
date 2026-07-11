package com.personal.kidscinemanative;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String ALL_FOLDERS = "All folders";

    private VideoAdapter adapter;
    private ProgressBar loading;
    private TextView statusText;
    private Spinner folderSpinner;
    private String activeFolder = ALL_FOLDERS;
    private String query = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        loading = findViewById(R.id.loading);
        statusText = findViewById(R.id.status_text);
        folderSpinner = findViewById(R.id.folder_spinner);

        RecyclerView grid = findViewById(R.id.video_grid);
        boolean landscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        grid.setLayoutManager(new GridLayoutManager(this, landscape ? 3 : 2));
        adapter = new VideoAdapter(this::openPlayer);
        grid.setAdapter(adapter);

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

        folderSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                Object item = parent.getItemAtPosition(position);
                activeFolder = item == null ? ALL_FOLDERS : item.toString();
                applyFilter();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
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
        List<String> options = new ArrayList<>();
        options.add(ALL_FOLDERS);
        options.addAll(Api.collections);
        ArrayAdapter<String> spinnerAdapter = new ArrayAdapter<>(
            this, android.R.layout.simple_spinner_item, options);
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        folderSpinner.setAdapter(spinnerAdapter);
    }

    private void applyFilter() {
        List<Video> filtered = new ArrayList<>();
        for (Video video : Api.videos) {
            if (!ALL_FOLDERS.equals(activeFolder) && !activeFolder.equals(video.collection)) continue;
            if (!query.isEmpty()) {
                String haystack = (video.title + " " + video.cleanTitle() + " " + video.filename + " "
                    + video.collection + " " + video.folderPathLabel).toLowerCase(Locale.ROOT);
                if (!haystack.contains(query)) continue;
            }
            filtered.add(video);
        }
        Api.queue.clear();
        Api.queue.addAll(filtered);
        adapter.submit(filtered);
        if (!Api.videos.isEmpty()) {
            statusText.setText(filtered.size() + " videos");
        }
    }

    private void openPlayer(int index) {
        if (index < 0 || index >= Api.queue.size()) return;
        Intent intent = new Intent(this, PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_INDEX, index);
        startActivity(intent);
    }
}
