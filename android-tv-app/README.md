# Kids Cinema TV

A separate, private Android TV app for the existing Kids Cinema library. It opens in landscape, uses Media3 ExoPlayer with a native video surface, and supports a TV remote without a mouse. It does not use Chrome or the browser Fullscreen API.

## Install on your TV

Requires Android 6.0 or newer and a TV that permits APK installation. The Tectimo brand name alone does not confirm its Android version or installation support.

1. Keep the PC server running on port 5174 and connect the TV to the same Wi-Fi.
2. On the TV, open `http://192.168.18.195:5174/downloads/tv.apk` to download the APK, or copy `KidsCinemaTV-v1.0.0.apk` to a USB drive and open it with the TV's file manager.
3. If Android asks, allow installation for the browser or file manager you are using. Install the APK and open **Kids Cinema TV** from Apps.
4. The default connection is `http://192.168.18.195:5174`. Use **Connection** to change the PC address if it changes. **Use online** selects the existing Render site.

The local connection does not require Render. Google Drive playback still needs an internet connection unless the server already has the complete video cached. This APK contains the app, not the video collection.

Local APK copies are kept in the ignored `client/public/downloads` folder so Vite copies them to the PC site's `dist/downloads` on future local builds. They are excluded from Git and the existing Render deployment.

## Remote controls

- Arrow keys move the coral selection; OK opens a video or activates a button.
- Up during playback reaches Back, Quality, Previous and Next. Down returns to the video controls.
- The native player offers play/pause and seeking. Media play/pause, next and previous keys are also supported.
- Back returns to the library. Continue restores saved watch progress on this TV.
- Quality offers Auto/original plus 720p and 1080p when the connected server enables HD. HD conversion needs the PC's existing FFmpeg setup and cannot add detail beyond the source video.
- Automatic next playback is off by default and can be enabled in Connection.

The app only lists videos from the server's approved `kids` library. There are no ads, comments or outside recommendations. It does not contain Drive credentials.

## Build

Use the existing Android SDK and JDK, and set `sdk.dir` in an untracked `local.properties` file.

```powershell
.\gradlew.bat :app:assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`. Version 1.0.0 uses package `com.personal.kidscinematv`, separate from the existing phone app. The private release is signed with this PC's existing Android debug key; retain that key for compatible family updates. It is not a Play Store release.

## Live acceptance test

The instrumentation test requires the real PC server at the default LAN address, HD enabled, and the approved Alphablocks Alphalympics episode. It checks library loading, remote navigation, native 1280x720 decoding, advancing playback, pause/resume, switching to 720p HLS and Continue progress.

```powershell
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest
adb -s <test-device> install -r app/build/outputs/apk/debug/app-debug.apk
adb -s <test-device> install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s <test-device> shell am instrument -w com.personal.kidscinematv.test/androidx.test.runner.AndroidJUnitRunner
```

Use a dedicated test device or emulator: the test clears this app's test settings and watch progress. Passing an Android landscape emulator test does not establish performance on the physical Tectimo TV.

For an emulator with a blocked LAN route, `adb reverse tcp:5174 tcp:5174` and the instrumentation argument `-e server http://127.0.0.1:5174` connect the test to the same real PC server. This test override does not change the APK's default TV connection.

## Artwork

Original artwork comes from ChatGPT > Agent Assets. The verified central batch is `F:\Agent\kids-drive-cinema\2026-10-05-tv-app-v01`. Untouched originals, ready PNGs and dimensions/alpha/SHA-256 records are preserved there. `asset-manifest.json` records the provenance of the runtime projector icon and TV launcher banner.
