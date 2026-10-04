package com.personal.kidscinematv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String ALL = "All folders";
    private static final long SHORT_MAX_MS = 3 * 60 * 1000;
    private final List<Video> filtered = new ArrayList<>();
    private RecyclerView feed;
    private VideoAdapter adapter;
    private TextView status;
    private ProgressBar loading;
    private Button folderButton;
    private String folder = ALL, tab = "home", query = "", pickedId = "";
    private int loadGeneration = 0;

    @Override protected void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        Api.configure(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);
        status = findViewById(R.id.status_text);
        loading = findViewById(R.id.loading);
        folderButton = findViewById(R.id.folder_button);
        feed = findViewById(R.id.feed);
        int columns = getResources().getConfiguration().screenWidthDp >= 1100 ? 4 : 3;
        feed.setLayoutManager(new GridLayoutManager(this, columns));
        feed.setItemAnimator(null);
        adapter = new VideoAdapter(this::openPlayer);
        feed.setAdapter(adapter);
        findViewById(R.id.tab_home).setOnClickListener(v -> switchTab("home"));
        findViewById(R.id.tab_shorts).setOnClickListener(v -> switchTab("shorts"));
        findViewById(R.id.tab_continue).setOnClickListener(v -> switchTab("continue"));
        folderButton.setOnClickListener(v -> chooseFolder());
        findViewById(R.id.connection_button).setOnClickListener(v -> connectionSettings());
        findViewById(R.id.refresh_button).setOnClickListener(v -> loadLibrary());
        ((EditText) findViewById(R.id.search_input)).addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable text) {
                query = text.toString().trim().toLowerCase(Locale.ROOT);
                refresh(false);
            }
        });
        findViewById(R.id.tab_home).requestFocus();
        if (Api.videos.isEmpty()) loadLibrary();
        else { loading.setVisibility(View.GONE); refresh(false); }
    }

    @Override protected void onResume() {
        super.onResume();
        if (!Api.videos.isEmpty()) refresh(!pickedId.isEmpty());
    }

    private void loadLibrary() {
        final int generation = ++loadGeneration;
        loading.setVisibility(View.VISIBLE);
        status.setText("Connecting… Keep your PC on and use the same Wi-Fi.");
        Api.loadVideos(error -> {
            if (isFinishing() || isDestroyed() || generation != loadGeneration) return;
            loading.setVisibility(View.GONE);
            if (error != null) {
                status.setText("Could not connect. Check Connection or choose Refresh. " + error);
                findViewById(R.id.connection_button).requestFocus();
            } else refresh(false);
        });
    }

    private void switchTab(String next) { tab = next; pickedId = ""; refresh(false); feed.scrollToPosition(0); }

    private Map<String, Long> progress() {
        Map<String, Long> positions = new HashMap<>();
        SharedPreferences prefs = getSharedPreferences("watch-progress", MODE_PRIVATE);
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            if (entry.getKey().startsWith("pos:") && entry.getValue() instanceof Long) positions.put(entry.getKey().substring(4), (Long) entry.getValue());
        }
        return positions;
    }

    private void refresh(boolean restoreFocus) {
        findViewById(R.id.tab_home).setActivated(tab.equals("home"));
        findViewById(R.id.tab_shorts).setActivated(tab.equals("shorts"));
        findViewById(R.id.tab_continue).setActivated(tab.equals("continue"));
        folderButton.setText(Video.cleanName(folder));
        Map<String, Long> watched = progress();
        filtered.clear();
        for (Video video : Api.videos) {
            if (tab.equals("shorts") && !(video.durationMs > 0 && video.durationMs <= SHORT_MAX_MS)) continue;
            if (tab.equals("continue") && !(watched.containsKey(video.id) && watched.get(video.id) > 5000)) continue;
            if (!ALL.equals(folder) && !folder.equals(video.collection)) continue;
            String haystack = (video.title + " " + video.filename + " " + video.collection).toLowerCase(Locale.ROOT);
            if (!query.isEmpty() && !haystack.contains(query)) continue;
            filtered.add(video);
        }
        adapter.submit(filtered, watched);
        String section = tab.equals("shorts") ? "Shorts" : tab.equals("continue") ? "Continue watching" : Video.cleanName(folder);
        status.setText(filtered.isEmpty() && !Api.videos.isEmpty() ? "No videos here yet. Choose Home, another folder or clear Search." : filtered.size() + " videos · " + section);
        if (restoreFocus) {
            int selected = 0;
            for (int i = 0; i < filtered.size(); i++) if (filtered.get(i).id.equals(pickedId)) selected = i;
            final int position = selected;
            feed.scrollToPosition(position);
            feed.post(() -> {
                RecyclerView.ViewHolder holder = feed.findViewHolderForAdapterPosition(position);
                if (holder != null) holder.itemView.requestFocus();
            });
        }
    }

    private void chooseFolder() {
        List<String> names = new ArrayList<>(); names.add(ALL); names.addAll(Api.collections);
        String[] labels = new String[names.size()];
        for (int i = 0; i < names.size(); i++) labels[i] = Video.cleanName(names.get(i));
        new AlertDialog.Builder(this).setTitle("Choose a folder")
            .setSingleChoiceItems(labels, names.indexOf(folder), (dialog, which) -> {
                folder = names.get(which); pickedId = ""; refresh(false); feed.scrollToPosition(0); dialog.dismiss();
            }).setNegativeButton("Cancel", null).show();
    }

    private void connectionSettings() {
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(pad, pad, pad, pad);
        TextView help = new TextView(this); help.setText("PC address. Keep the PC on and connect the TV to the same Wi-Fi."); content.addView(help);
        EditText address = new EditText(this); address.setSingleLine(true); address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); address.setText(Api.base); content.addView(address);
        SharedPreferences settings = getSharedPreferences("tv-settings", MODE_PRIVATE);
        CheckBox autoplay = new CheckBox(this); autoplay.setText("Play the next video automatically"); autoplay.setChecked(settings.getBoolean("autoplay", false)); content.addView(autoplay);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Connection").setView(content)
            .setPositiveButton("Connect", null).setNegativeButton("Cancel", null).setNeutralButton("Use online", null).create();
        dialog.setOnShowListener(ignored -> {
            View.OnClickListener connect = view -> {
                try {
                    String chosen = view == dialog.getButton(AlertDialog.BUTTON_NEUTRAL) ? Api.ONLINE_BASE : Api.normalizeBase(address.getText().toString());
                    settings.edit().putBoolean("autoplay", autoplay.isChecked()).apply();
                    Api.setBase(this, chosen); folder = ALL; pickedId = ""; refresh(false); dialog.dismiss(); loadLibrary();
                } catch (Exception error) { address.setError(error.getMessage()); address.requestFocus(); }
            };
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(connect);
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(connect);
        });
        dialog.show();
    }

    private void openPlayer(int position) {
        if (position < 0 || position >= filtered.size()) return;
        Video picked = filtered.get(position); pickedId = picked.id;
        Api.queue.clear();
        if (tab.equals("shorts")) Api.queue.addAll(filtered);
        else for (Video item : Api.videos) if (item.collection.equals(picked.collection)) Api.queue.add(item);
        int start = Api.queue.indexOf(picked);
        if (start < 0) return;
        startActivity(new Intent(this, PlayerActivity.class).putExtra(PlayerActivity.EXTRA_INDEX, start));
    }
}
