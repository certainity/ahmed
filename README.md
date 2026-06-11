# Kids Drive Cinema

A YouTube-style movie shelf for your kids that streams **only** video files from your approved Google Drive folder tree.

This build is already configured for this Drive folder ID:

```txt
1fU3vbnn3tBtONgb9N1kPQ3kM8hRzW0xy
```

Source folder URL:

```txt
https://drive.google.com/drive/folders/1fU3vbnn3tBtONgb9N1kPQ3kM8hRzW0xy
```

The important safety idea is simple: the React app never talks directly to Google Drive. A small Node/Express backend lists and streams only videos discovered under the configured `GOOGLE_DRIVE_FOLDER_ID` and its approved subfolders.

## What is new in this folder-linked version

- `server/.env.example` already contains your folder ID.
- The backend scans nested Google Drive folders, not only videos placed directly in the root folder.
- The UI now shows folder collections, so folders like shows/seasons appear as kid-friendly shelves.
- Search works across movie titles, filenames, and folder paths.
- The player still validates every requested video ID against the approved Drive folder tree before streaming.

## Features

- Kid-friendly responsive React UI
- Private Google Drive folder tree as the only content source
- Backend streaming proxy with HTTP Range support for seeking
- Drive thumbnails, with a colorful fallback thumbnail when Google has not generated one yet
- Search, folder shelves, Favorites, Continue Watching, Short videos, HD filter
- Parent PIN panel for refresh/status
- No public search, comments, external suggestions, or YouTube recommendations

## Project structure

```txt
kids-drive-cinema/
  client/        React + Vite app
  server/        Express API + Google Drive streaming proxy
```

## Requirements

- Node.js 18.18 or newer
- A Google Cloud project with Google Drive API enabled
- A Google Drive service account that can view your approved folder

## Google Drive setup: service account method

This is the safest method for a private family app because your Google credentials stay on the backend.

1. Create a Google Cloud project.
2. Enable **Google Drive API** for that project.
3. Create a **Service Account**.
4. Create/download a JSON key for that service account.
5. Put the key at `server/service-account.json`.
6. Open your Google Drive movie folder.
7. Share that folder with the service account email as **Viewer**.
8. Keep only kid-approved videos/folders inside that Drive folder tree.

## Local setup

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Your copied `server/.env` will already contain:

```env
GOOGLE_DRIVE_FOLDER_ID=1fU3vbnn3tBtONgb9N1kPQ3kM8hRzW0xy
INCLUDE_SUBFOLDERS=true
MAX_SCAN_DEPTH=8
MAX_FOLDERS=750
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
PORT=5174
CLIENT_ORIGIN=http://localhost:5173
```

Your copied `client/.env` will contain:

```env
VITE_PARENT_PIN=2468
```

Run the app:

```bash
npm run dev
```

Open:

```txt
http://localhost:5173
```

## Production build

```bash
npm install
npm run build
npm start
```

The server will serve the built React app from `client/dist`.

## Folder scanning settings

The backend scans the configured Drive folder like this:

```env
INCLUDE_SUBFOLDERS=true
MAX_SCAN_DEPTH=8
MAX_FOLDERS=750
```

Change these only if your library is very large or deeply nested.

- `INCLUDE_SUBFOLDERS=false` means only videos directly inside the root folder are shown.
- `MAX_SCAN_DEPTH=8` means the backend can scan up to 8 nested folder levels.
- `MAX_FOLDERS=750` prevents accidental huge scans.

## Supported video formats

Use browser-friendly formats for the smoothest playback, especially:

- `.mp4` with H.264 video + AAC audio
- `.webm`

Google Drive can store many video formats, but your browser still decides what it can play inside the HTML5 video player. Some `.mkv` or unusual audio codecs may not play in every browser.

## Security notes

- Do not put Google credentials in the React app.
- Keep `server/service-account.json` private and out of Git.
- Share only the approved movie folder with the service account.
- The frontend Parent PIN is a convenience lock, not a security boundary.
- The actual boundary is in the backend: `/api/stream/:id` checks the Drive file ID against the scanned approved folder tree before streaming.
- Do not deploy this publicly without adding proper authentication in front of the app, such as Cloudflare Access, Tailscale, Authelia, or your hosting provider’s auth layer.
- Use only videos you own, created, or otherwise have permission to stream.

## Useful endpoints

- `GET /health` — server status
- `GET /api/videos` — list approved folder-tree videos
- `GET /api/videos?refresh=1` — refresh Drive cache
- `GET /api/thumbnails/:id` — thumbnail proxy
- `GET /api/stream/:id` — folder-locked video stream

## Troubleshooting

### “GOOGLE_DRIVE_FOLDER_ID is not configured”

Copy `server/.env.example` to `server/.env`. This build already includes your folder ID in `.env.example`.

### “Video not found in the approved Google Drive folder tree”

The file ID being requested is not currently discovered under the configured Drive folder. Refresh from the parent panel after adding a new video.

### The app shows no videos but my folder has subfolders

Confirm `INCLUDE_SUBFOLDERS=true` in `server/.env`. Also make sure the service account has Viewer access to the parent folder and the videos inside it.

### Thumbnails are missing

Google Drive sometimes takes time to generate video thumbnails. The app shows a colorful fallback until a Drive thumbnail is available.

### Playback starts but seeking is slow

Use MP4/H.264/AAC for the best browser support and smoother range-based playback.
