package com.personal.kidscinematv;

import android.app.Activity;
import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.EditText;
import android.widget.TextView;
import androidx.media3.common.Player;
import androidx.media3.ui.PlayerView;
import androidx.recyclerview.widget.RecyclerView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import static org.junit.Assert.*;

/** Live LAN acceptance test: real library, remote keys, decoding and HD continuation. */
@RunWith(AndroidJUnit4.class)
public class TvPlaybackTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    @Rule public ActivityTestRule<MainActivity> rule = new ActivityTestRule<>(MainActivity.class, false, false);

    @Test public void libraryRemotePlaybackAndHdContinue() throws Exception {
        String testServer = Api.normalizeBase(InstrumentationRegistry.getArguments().getString("server", Api.DEFAULT_BASE));
        ui(() -> {
            instrumentation.getTargetContext().getSharedPreferences("tv-settings", 0).edit().clear().commit();
            instrumentation.getTargetContext().getSharedPreferences("watch-progress", 0).edit().clear().commit();
            Api.setBase(instrumentation.getTargetContext(), testServer);
        });
        MainActivity main = rule.launchActivity(null);
        await("PC library loaded", 90000, () -> !Api.videos.isEmpty() && ((RecyclerView) main.findViewById(R.id.feed)).getAdapter().getItemCount() > 0);
        assertTrue("Local server should offer HD", value(() -> Api.hdEnabled));
        assertEquals(R.id.tab_home, (int) value(() -> main.getCurrentFocus().getId()));
        SystemClock.sleep(1500);
        screenshot("tv-home.png");
        if (InstrumentationRegistry.getArguments().getString("homeOnly", "false").equals("true")) return;

        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertEquals("Right reaches Shorts", R.id.tab_shorts, (int) value(() -> main.getCurrentFocus().getId()));
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertTrue("OK selects Shorts", value(() -> main.findViewById(R.id.tab_shorts).isActivated()));
        key(KeyEvent.KEYCODE_DPAD_LEFT);
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertTrue(value(() -> main.findViewById(R.id.tab_home).isActivated()));

        ui(() -> ((EditText) main.findViewById(R.id.search_input)).setText("Alphalympics"));
        await("Approved test episode appears", 10000, () -> ((RecyclerView) main.findViewById(R.id.feed)).getAdapter().getItemCount() == 1);
        ui(() -> {
            RecyclerView feed = main.findViewById(R.id.feed);
            feed.findViewHolderForAdapterPosition(0).itemView.requestFocus();
        });
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        await("Native player opened", 10000, () -> resumed() instanceof PlayerActivity);
        dismissImmersivePrompt();
        await("Original HD video decodes", 90000, () -> player() != null && player().isPlaying() && player().getVideoSize().width == 1280 && player().getVideoSize().height == 720);
        dismissImmersivePrompt();
        long before = value(() -> player().getCurrentPosition());
        SystemClock.sleep(3500);
        assertTrue("Video keeps advancing", value(() -> player().getCurrentPosition()) > before + 2000);
        screenshot("tv-playing.png");

        key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        await("Remote pause", 3000, () -> !player().getPlayWhenReady());
        long paused = value(() -> player().getCurrentPosition());
        SystemClock.sleep(1000);
        assertTrue("Pause stays paused", Math.abs(value(() -> player().getCurrentPosition()) - paused) < 200);
        key(KeyEvent.KEYCODE_MEDIA_PLAY);
        await("Remote resume", 3000, () -> player().isPlaying());

        key(KeyEvent.KEYCODE_DPAD_UP);
        assertEquals("Up reaches player actions", R.id.back_button, (int) value(() -> resumed().getCurrentFocus().getId()));
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertEquals("Right reaches Quality", R.id.quality_button, (int) value(() -> resumed().getCurrentFocus().getId()));
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        await("Remote chooses 720p", 5000, () -> ((TextView) resumed().findViewById(R.id.quality_button)).getText().toString().contains("720p"));
        await("Prepared HD stream decodes", 150000, () -> player() != null && player().isPlaying() && player().getVideoSize().height == 720);
        long hdBefore = value(() -> player().getCurrentPosition());
        SystemClock.sleep(3500);
        assertTrue("HD stream advances", value(() -> player().getCurrentPosition()) > hdBefore + 2000);
        screenshot("tv-hd-playing.png");

        key(KeyEvent.KEYCODE_BACK);
        await("Back returns to library", 10000, () -> resumed() == main);
        assertTrue("Watch progress is saved", value(() -> instrumentation.getTargetContext().getSharedPreferences("watch-progress", 0).getLong("pos:1QoK6WNNbv1e9YhuOMAZGeKCqXc3HDBcd", 0)) > 5000);
        ui(() -> {
            ((EditText) main.findViewById(R.id.search_input)).setText("");
            main.findViewById(R.id.tab_continue).requestFocus();
        });
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertEquals("Continue contains the watched episode", 1, (int) value(() -> ((RecyclerView) main.findViewById(R.id.feed)).getAdapter().getItemCount()));
        screenshot("tv-continue.png");
    }

    private Activity resumed() {
        for (Activity activity : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)) return activity;
        return null;
    }

    private Player player() {
        Activity activity = resumed();
        if (!(activity instanceof PlayerActivity)) return null;
        return ((PlayerView) activity.findViewById(R.id.player_view)).getPlayer();
    }

    private void key(int code) {
        instrumentation.sendKeyDownUpSync(code);
        instrumentation.waitForIdleSync();
        SystemClock.sleep(150);
    }

    private void dismissImmersivePrompt() {
        // Phone-system emulator images may show Android's first-use coaching dialog.
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) return;
        for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText("Got it")) {
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        }
        instrumentation.waitForIdleSync();
    }

    private void ui(Runnable action) { instrumentation.runOnMainSync(action); }

    private <T> T value(Supplier<T> action) {
        AtomicReference<T> result = new AtomicReference<>();
        ui(() -> result.set(action.get()));
        return result.get();
    }

    private void await(String description, long timeout, BooleanSupplier condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (value(condition::getAsBoolean)) return;
            SystemClock.sleep(250);
        }
        screenshot("tv-failure.png");
        fail(description + " timed out");
    }

    private void screenshot(String name) throws Exception {
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        File file = new File(instrumentation.getTargetContext().getExternalFilesDir(null), name);
        try (FileOutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, output); }
        bitmap.recycle();
    }
}
