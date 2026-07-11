package com.personal.kidscinemanative;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.ParserException;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

public class PlayerActivity extends Activity {
    public static final String EXTRA_INDEX = "index";

    private static final int STAGE_DIRECT = 0;
    private static final int STAGE_COPY = 1;   // original video, audio converted to AAC
    private static final int STAGE_ENCODE = 2; // full re-encode for undecodable video

    private ExoPlayer player;
    private PlayerView playerView;
    private TextView status;
    private TextView playerTitle;
    private TextView watchTitle;
    private TextView watchMeta;
    private TextView btnPrev;
    private TextView btnNext;
    private View topBar;
    private View belowContent;
    private View videoContainer;
    private RecyclerView upNext;
    private UpNextAdapter upNextAdapter;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private int index;
    private int stage = STAGE_DIRECT;
    private int hlsRetries = 0;
    private long lastStartPositionMs = 0;
    private boolean enforceStartPosition = false;
    private boolean fullscreen = false;
    private boolean controllerVisible = true;

    private final Runnable progressSaver = new Runnable() {
        @Override
        public void run() {
            saveProgress();
            handler.postDelayed(this, 5000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);

        prefs = getSharedPreferences("watch-progress", MODE_PRIVATE);
        status = findViewById(R.id.player_status);
        playerTitle = findViewById(R.id.player_title);
        watchTitle = findViewById(R.id.watch_title);
        watchMeta = findViewById(R.id.watch_meta);
        topBar = findViewById(R.id.player_top_bar);
        belowContent = findViewById(R.id.below_content);
        videoContainer = findViewById(R.id.video_container);
        btnPrev = findViewById(R.id.btn_prev);
        btnNext = findViewById(R.id.btn_next);
        playerView = findViewById(R.id.player_view);
        upNext = findViewById(R.id.up_next);

        findViewById(R.id.btn_close).setOnClickListener((v) -> {
            if (fullscreen) setFullscreen(false);
            else finish();
        });
        btnPrev.setOnClickListener((v) -> playIndex(index - 1));
        btnNext.setOnClickListener((v) -> playIndex(index + 1));

        upNext.setLayoutManager(new LinearLayoutManager(this));
        upNextAdapter = new UpNextAdapter(Api.queue, this::playIndex);
        upNext.setAdapter(upNextAdapter);

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        playerView.setShowPreviousButton(false);
        playerView.setShowNextButton(false);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) (visibility) -> {
            controllerVisible = visibility == View.VISIBLE;
            updateTopBar();
        });
        playerView.setFullscreenButtonClickListener((isFullScreen) -> setFullscreen(isFullScreen));
        playerView.setFullscreenButtonState(false);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    setStatus("");
                    // A still-converting stream looks "live" to ExoPlayer and
                    // starts near the newest segment; jump back to where the
                    // viewer actually wanted to start.
                    if (enforceStartPosition) {
                        enforceStartPosition = false;
                        if (player.isCurrentMediaItemLive()
                            && Math.abs(player.getCurrentPosition() - lastStartPositionMs) > 10000) {
                            player.seekTo(lastStartPositionMs);
                        }
                    }
                }
                if (state == Player.STATE_ENDED) {
                    clearProgress();
                    playIndex(index + 1);
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) setStatus("");
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                // The file has an audio track, but this device has no decoder
                // for it (AC3/EAC3/DTS on some devices): ask the server for the
                // stream with only the audio converted.
                if (stage == STAGE_DIRECT && audioUnsupported(tracks)) {
                    switchStage(STAGE_COPY, "Fixing sound...");
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                handleError(error);
            }
        });

        index = getIntent().getIntExtra(EXTRA_INDEX, 0);
        playIndex(index);
    }

    private Video current() {
        return Api.queue.get(index);
    }

    private void playIndex(int nextIndex) {
        if (nextIndex < 0 || nextIndex >= Api.queue.size()) {
            if (Api.queue.isEmpty()) finish();
            return;
        }
        index = nextIndex;
        stage = STAGE_DIRECT;
        hlsRetries = 0;

        Video video = current();
        playerTitle.setText(video.cleanTitle());
        watchTitle.setText(video.cleanTitle());
        watchMeta.setText(video.collection
            + (video.size > 0 ? " · " + video.sizeLabel() : "")
            + " · " + video.durationLabel());
        btnPrev.setAlpha(index > 0 ? 1f : 0.35f);
        btnNext.setAlpha(index < Api.queue.size() - 1 ? 1f : 0.35f);
        upNextAdapter.setCurrentIndex(index);
        upNext.scrollToPosition(index);

        long saved = prefs.getLong(progressKey(), 0);
        start(saved > 5000 ? saved : 0);
    }

    private void setFullscreen(boolean wantFullscreen) {
        fullscreen = wantFullscreen;
        playerView.setFullscreenButtonState(wantFullscreen);
        belowContent.setVisibility(wantFullscreen ? View.GONE : View.VISIBLE);

        ViewGroup.LayoutParams params = videoContainer.getLayoutParams();
        params.height = wantFullscreen
            ? ViewGroup.LayoutParams.MATCH_PARENT
            : ViewGroup.LayoutParams.WRAP_CONTENT;
        videoContainer.setLayoutParams(params);

        setRequestedOrientation(wantFullscreen
            ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        if (wantFullscreen) {
            hideSystemBars();
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
        updateTopBar();
    }

    private void updateTopBar() {
        topBar.setVisibility(fullscreen && controllerVisible ? View.VISIBLE : View.GONE);
    }

    private void start(long resumePositionMs) {
        Video video = current();
        lastStartPositionMs = resumePositionMs;
        enforceStartPosition = true;
        MediaItem item;
        if (stage == STAGE_DIRECT) {
            item = MediaItem.fromUri(video.streamUrl);
        } else {
            String url = video.hlsUrl + (stage == STAGE_COPY ? "&vcopy=1" : "");
            item = new MediaItem.Builder()
                .setUri(url)
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .build();
        }
        player.setMediaItem(item, resumePositionMs);
        player.prepare();
        player.play();
    }

    private void switchStage(int nextStage, String message) {
        long position = Math.max(player.getCurrentPosition(), lastStartPositionMs);
        stage = nextStage;
        hlsRetries = 0;
        setStatus(message);
        start(position);
    }

    private void handleError(PlaybackException error) {
        Integer httpCode = findHttpCode(error);
        if (stage != STAGE_DIRECT) {
            if (httpCode != null && httpCode == 429) {
                setStatus("Google Drive quota exceeded for this video. Try again later.");
                return;
            }
            // While the server is still converting, the playlist answers 202
            // (JSON) and segments can briefly 404: keep retrying.
            boolean stillPreparing = hasCause(error, ParserException.class)
                || (httpCode != null && (httpCode == 404 || httpCode == 503));
            if (stillPreparing && hlsRetries < 60) {
                hlsRetries += 1;
                setStatus("Fixing sound - preparing stream... " + (hlsRetries * 3) + "s");
                long position = Math.max(player.getCurrentPosition(), lastStartPositionMs);
                handler.postDelayed(() -> start(position), 3000);
                return;
            }
        }
        if (stage == STAGE_DIRECT) {
            switchStage(STAGE_COPY, "Fixing playback...");
            return;
        }
        if (stage == STAGE_COPY) {
            switchStage(STAGE_ENCODE, "Converting video for this device...");
            return;
        }
        setStatus("Could not play this video.");
    }

    private static boolean audioUnsupported(Tracks tracks) {
        boolean hasAudio = false;
        boolean anySupported = false;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
            hasAudio = true;
            for (int i = 0; i < group.length; i++) {
                if (group.isTrackSupported(i)) anySupported = true;
            }
        }
        return hasAudio && !anySupported;
    }

    private static Integer findHttpCode(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
                return ((HttpDataSource.InvalidResponseCodeException) cause).responseCode;
            }
        }
        return null;
    }

    private static boolean hasCause(Throwable error, Class<?> type) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (type.isInstance(cause)) return true;
        }
        return false;
    }

    private String progressKey() {
        return "pos:" + current().id;
    }

    private void saveProgress() {
        if (player == null || Api.queue.isEmpty()) return;
        long position = player.getCurrentPosition();
        if (position > 5000) {
            prefs.edit()
                .putLong(progressKey(), position)
                .putLong("t:" + current().id, System.currentTimeMillis())
                .apply();
        }
    }

    private void clearProgress() {
        prefs.edit().remove(progressKey()).apply();
    }

    private void setStatus(String message) {
        status.setText(message);
        status.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onBackPressed() {
        if (fullscreen) {
            setFullscreen(false);
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && fullscreen) hideSystemBars();
    }

    @Override
    protected void onStart() {
        super.onStart();
        handler.postDelayed(progressSaver, 5000);
        if (player != null) player.play();
    }

    @Override
    protected void onStop() {
        super.onStop();
        handler.removeCallbacks(progressSaver);
        saveProgress();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
