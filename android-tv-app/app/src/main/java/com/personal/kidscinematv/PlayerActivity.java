package com.personal.kidscinematv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.session.MediaSession;

/** A steady landscape native video surface, with no browser or orientation toggle. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class PlayerActivity extends Activity {
    public static final String EXTRA_INDEX = "index";
    private static final int DIRECT = 0, COPY = 1, ENCODE = 2;
    private ExoPlayer player;
    private MediaSession mediaSession;
    private PlayerView playerView;
    private View header, statusPanel;
    private TextView title, status;
    private Button qualityButton, previousButton, nextButton, retryButton, backButton;
    private SharedPreferences progress, settings;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int index, stage, generation;
    private long timelineFromMs, requestedPositionMs;
    private String quality = "auto";
    private boolean foreground, ended, restoreStartPosition, resumePlayback = true;
    private Runnable cancelPreparation;
    private final Runnable progressSaver = new Runnable() {
        @Override public void run() { saveProgress(); handler.postDelayed(this, 5000); }
    };

    @Override protected void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        if (Api.queue.isEmpty()) { finish(); return; }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_player);
        progress = getSharedPreferences("watch-progress", MODE_PRIVATE);
        settings = getSharedPreferences("tv-settings", MODE_PRIVATE);
        quality = Api.hdEnabled ? settings.getString("quality", "auto") : "auto";
        if (!quality.equals("720p") && !quality.equals("1080p")) quality = "auto";
        playerView = findViewById(R.id.player_view);
        header = findViewById(R.id.player_header);
        statusPanel = findViewById(R.id.status_panel);
        title = findViewById(R.id.player_title);
        status = findViewById(R.id.player_status);
        qualityButton = findViewById(R.id.quality_button);
        previousButton = findViewById(R.id.previous_button);
        nextButton = findViewById(R.id.next_button);
        retryButton = findViewById(R.id.retry_button);
        backButton = findViewById(R.id.back_button);
        backButton.setOnClickListener(view -> finish());
        qualityButton.setOnClickListener(view -> chooseQuality());
        previousButton.setOnClickListener(view -> playIndex(index - 1));
        nextButton.setOnClickListener(view -> playIndex(index + 1));
        retryButton.setOnClickListener(view -> {
            stage = quality.equals("auto") ? DIRECT : ENCODE;
            start(ended ? 0 : Math.max(positionMs(), requestedPositionMs));
            playerView.requestFocus();
        });
        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        playerView.setShowPreviousButton(false);
        playerView.setShowNextButton(false);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> header.setVisibility(visibility));
        getWindow().getDecorView().getViewTreeObserver().addOnGlobalFocusChangeListener((oldFocus, newFocus) -> {
            if (player == null) return;
            // Keep a remote-selected action visible until focus returns to the video.
            playerView.setControllerShowTimeoutMs(isHeaderFocus() ? 0 : 4000);
            if (isHeaderFocus()) playerView.showController();
        });
        player.addListener(new Player.Listener() {
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                if (foreground) resumePlayback = ready;
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    if (restoreStartPosition) {
                        restoreStartPosition = false;
                        if (player.isCurrentMediaItemLive() && Math.abs(positionMs() - requestedPositionMs) > 10000) {
                            player.seekTo(Math.max(0, requestedPositionMs - timelineFromMs));
                        }
                    }
                    if (!ended) showStatus("", false);
                } else if (state == Player.STATE_BUFFERING) {
                    showStatus("Loading your video…", false);
                } else if (state == Player.STATE_ENDED) {
                    ended = true;
                    progress.edit().remove("pos:" + current().id).apply();
                    if (settings.getBoolean("autoplay", false) && index + 1 < Api.queue.size()) playIndex(index + 1);
                    else { showStatus("Finished watching. Choose Next or Back.", false); header.setVisibility(View.VISIBLE); nextButton.requestFocus(); }
                }
            }
            @Override public void onIsPlayingChanged(boolean playing) { if (playing) showStatus("", false); }
            @Override public void onPlayerError(PlaybackException error) { handleError(error); }
            @Override public void onTracksChanged(Tracks tracks) {
                if (stage == DIRECT && unsupportedAudio(tracks)) {
                    stage = COPY; start(Math.max(positionMs(), requestedPositionMs));
                }
            }
        });
        hideSystemBars();
        playIndex(getIntent().getIntExtra(EXTRA_INDEX, 0));
        playerView.requestFocus();
    }

    private Video current() { return Api.queue.get(index); }

    private long positionMs() {
        return player == null || player.getMediaItemCount() == 0 ? requestedPositionMs : timelineFromMs + Math.max(0, player.getCurrentPosition());
    }

    private void playIndex(int target) {
        if (target < 0 || target >= Api.queue.size()) return;
        if (player != null && player.getMediaItemCount() > 0) saveProgress();
        index = target;
        stage = quality.equals("auto") ? DIRECT : ENCODE;
        ended = false;
        resumePlayback = true;
        title.setText(current().cleanTitle());
        previousButton.setEnabled(index > 0);
        nextButton.setEnabled(index + 1 < Api.queue.size());
        long saved = progress.getLong("pos:" + current().id, 0);
        start(saved > 5000 ? saved : 0);
    }

    private void start(long position) {
        if (cancelPreparation != null) { cancelPreparation.run(); cancelPreparation = null; }
        final int attempt = ++generation;
        requestedPositionMs = Math.max(0, position);
        restoreStartPosition = true;
        ended = false;
        player.stop(); player.clearMediaItems();
        qualityButton.setText("Quality: " + (quality.equals("auto") ? "Auto" : quality + " HD"));
        if (stage == DIRECT) {
            timelineFromMs = 0;
            showStatus("Loading your video…", false);
            attach(MediaItem.fromUri(current().streamUrl), requestedPositionMs);
            return;
        }
        boolean hd = !quality.equals("auto");
        timelineFromMs = hd ? Math.max(0, requestedPositionMs / 1000 - 4) * 1000 : 0;
        String address = current().hlsUrl + (hd ? "&quality=" + quality + "&from=" + timelineFromMs / 1000 : stage == COPY ? "&vcopy=1" : "")
            + "&start=" + requestedPositionMs / 1000;
        long relativePosition = requestedPositionMs - timelineFromMs;
        showStatus(hd ? "Preparing " + quality + " HD on your PC…" : "Preparing a TV-compatible stream…", false);
        cancelPreparation = Api.prepareStream(address, error -> {
            if (attempt != generation || isFinishing() || isDestroyed() || player == null) return;
            cancelPreparation = null;
            if (error != null) { showStatus(error, true); return; }
            attach(new MediaItem.Builder().setUri(address).setMimeType(MimeTypes.APPLICATION_M3U8).build(), relativePosition);
        });
    }

    private void attach(MediaItem item, long position) {
        player.setMediaItem(item, position);
        player.prepare();
        player.setPlayWhenReady(foreground && resumePlayback);
    }

    private void handleError(PlaybackException error) {
        Integer code = httpCode(error);
        if (code != null && (code == 429 || code == 403)) {
            showStatus("Google Drive could not provide this video. Try another video or retry later.", true);
            return;
        }
        if (stage == DIRECT) { stage = COPY; start(Math.max(positionMs(), requestedPositionMs)); return; }
        if (stage == COPY) { stage = ENCODE; start(Math.max(positionMs(), requestedPositionMs)); return; }
        showStatus("Could not play this video. Check the PC connection, then retry or choose another video.", true);
    }

    private void chooseQuality() {
        String[] values = Api.hdEnabled ? new String[]{"auto", "720p", "1080p"} : new String[]{"auto"};
        String[] labels = Api.hdEnabled ? new String[]{"Auto / original quality", "720p HD", "1080p HD"} : new String[]{"Auto / original quality"};
        int selected = quality.equals("720p") ? 1 : quality.equals("1080p") ? 2 : 0;
        new AlertDialog.Builder(this).setTitle("Video quality")
            .setSingleChoiceItems(labels, selected, (dialog, which) -> {
                String chosen = values[which];
                if (!chosen.equals(quality)) {
                    long position = positionMs(); saveProgress();
                    quality = chosen; settings.edit().putString("quality", quality).apply();
                    stage = quality.equals("auto") ? DIRECT : ENCODE; start(position);
                }
                dialog.dismiss(); playerView.requestFocus();
            }).setNegativeButton("Cancel", null).show();
    }

    private void saveProgress() {
        if (player == null || progress == null || Api.queue.isEmpty() || ended) return;
        long position = positionMs();
        if (position > 5000) progress.edit().putLong("pos:" + current().id, position).putLong("t:" + current().id, System.currentTimeMillis()).apply();
    }

    private void showStatus(String message, boolean canRetry) {
        status.setText(message);
        statusPanel.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
        retryButton.setVisibility(canRetry ? View.VISIBLE : View.GONE);
        if (canRetry) { header.setVisibility(View.VISIBLE); retryButton.requestFocus(); }
    }

    private static boolean unsupportedAudio(Tracks tracks) {
        boolean audio = false, supported = false;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
            audio = true;
            for (int i = 0; i < group.length; i++) if (group.isTrackSupported(i)) supported = true;
        }
        return audio && !supported;
    }

    private static Integer httpCode(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof HttpDataSource.InvalidResponseCodeException) return ((HttpDataSource.InvalidResponseCodeException) cause).responseCode;
        }
        return null;
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private MediaSession createMediaSession() {
        return new MediaSession.Builder(this, player).setCallback(new MediaSession.Callback() {
            @Override public boolean onMediaButtonEvent(MediaSession session, MediaSession.ControllerInfo controller, Intent intent) {
                KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (event == null) return false;
                if (!foreground) return true;
                int key = event.getKeyCode();
                if (key != KeyEvent.KEYCODE_MEDIA_NEXT && key != KeyEvent.KEYCODE_MEDIA_PREVIOUS) return false;
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    playIndex(index + (key == KeyEvent.KEYCODE_MEDIA_NEXT ? 1 : -1));
                }
                return true;
            }
        }).build();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (playerView != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_UP && !isHeaderFocus() && getCurrentFocus() != retryButton) {
                playerView.showController(); header.setVisibility(View.VISIBLE); backButton.requestFocus(); return true;
            }
            if (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_DOWN && getCurrentFocus() != null && isHeaderFocus()) {
                playerView.requestFocus(); playerView.showController(); return true;
            }
            if (event.getKeyCode() == KeyEvent.KEYCODE_MEDIA_NEXT) { if (event.getRepeatCount() == 0) playIndex(index + 1); return true; }
            if (event.getKeyCode() == KeyEvent.KEYCODE_MEDIA_PREVIOUS) { if (event.getRepeatCount() == 0) playIndex(index - 1); return true; }
        }
        return super.dispatchKeyEvent(event);
    }

    private boolean isHeaderFocus() {
        View focus = getCurrentFocus();
        return focus == backButton || focus == qualityButton || focus == previousButton || focus == nextButton;
    }

    @Override public void onBackPressed() { finish(); }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) hideSystemBars(); }
    @Override protected void onStart() {
        super.onStart(); foreground = true; handler.postDelayed(progressSaver, 5000);
        if (player != null && mediaSession == null) mediaSession = createMediaSession();
        if (player != null && !ended) player.setPlayWhenReady(resumePlayback);
    }
    @Override protected void onStop() {
        foreground = false; handler.removeCallbacks(progressSaver); saveProgress();
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        if (player != null) player.pause();
        super.onStop();
    }
    @Override protected void onDestroy() {
        generation++;
        if (cancelPreparation != null) cancelPreparation.run();
        handler.removeCallbacksAndMessages(null);
        if (playerView != null) playerView.setPlayer(null);
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
