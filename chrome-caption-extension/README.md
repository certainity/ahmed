# Kids Cinema Captions Extension

Unpacked Chrome extension that overlays cached WebVTT captions on Kids Drive Cinema without changing the website player.

## Install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:
   `F:\codex\kids-drive-cinema-google-folder\kids-drive-cinema\chrome-caption-extension`

## How It Works

- Runs only on:
  - `https://kids-drive-cinema.onrender.com/*`
  - `https://drive-movies-cinema.onrender.com/*`
- Reads the current video title from the player.
- Looks up that video from `/api/videos`.
- If `captionsReady` is true, loads the cached `.vtt` from `/api/captions/<id>/en.vtt`.
- Draws captions as an overlay synced to the HTML video time.

## Current Caption Test

The first generated caption file is for:

`Power Rangers - S01E01 - Day of the Dumpster`

If no caption file exists for the current video, the `CC` button stays hidden.
