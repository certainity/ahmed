import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, 'cache-thumbnails');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const HLS_CACHE_DIR = path.resolve(__dirname, 'cache-hls');
const HLS_CACHE_VERSION = 'v3';
if (!fs.existsSync(HLS_CACHE_DIR)) {
  fs.mkdirSync(HLS_CACHE_DIR, { recursive: true });
}

const PORT = Number(process.env.PORT || 5174);
const KIDS_DRIVE_FOLDER_ID = process.env.KIDS_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '1fU3vbnn3tBtONgb9N1kPQ3kM8hRzW0xy';
const MOVIE_DRIVE_FOLDER_ID = process.env.MOVIE_DRIVE_FOLDER_ID || '1ECrt0eLyv1wGFUfoNc6VMm-vuxblBp-s';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 5 * 60 * 1000);
const STREAM_CHUNK_SIZE = Math.max(1024 * 1024, Number(process.env.STREAM_CHUNK_SIZE || 8 * 1024 * 1024));
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const THUMBNAIL_CONCURRENCY = Math.max(1, Number(process.env.THUMBNAIL_CONCURRENCY || 1));
const THUMBNAIL_WAIT_MS = Math.max(0, Number(process.env.THUMBNAIL_WAIT_MS || 7000));
const THUMBNAIL_TIMEOUT_MS = Math.max(5000, Number(process.env.THUMBNAIL_TIMEOUT_MS || 45000));
const THUMBNAIL_SEEK_SECONDS = Math.max(0, Number(process.env.THUMBNAIL_SEEK_SECONDS || 8));
const HLS_PREWARM_MAX_ACTIVE = Math.max(0, Number(process.env.HLS_PREWARM_MAX_ACTIVE || 1));
const HLS_START_SEGMENTS = Math.max(2, Number(process.env.HLS_START_SEGMENTS || 4));
const HLS_START_TIMEOUT_MS = Math.max(3000, Number(process.env.HLS_START_TIMEOUT_MS || 12000));
const HLS_BUFFER_TIMEOUT_MS = Math.max(3000, Number(process.env.HLS_BUFFER_TIMEOUT_MS || 8000));
const HLS_JOB_START_TIMEOUT_MS = Math.max(15000, Number(process.env.HLS_JOB_START_TIMEOUT_MS || 90000));
const HLS_PREWARM_MAX_BYTES = Math.max(50 * 1024 * 1024, Number(process.env.HLS_PREWARM_MAX_BYTES || 1200 * 1024 * 1024));
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173,https://kids-drive-cinema.onrender.com,https://drive-movies-cinema.onrender.com';
const INCLUDE_SUBFOLDERS = String(process.env.INCLUDE_SUBFOLDERS || 'true').toLowerCase() !== 'false';
const MAX_SCAN_DEPTH = Math.max(0, Number(process.env.MAX_SCAN_DEPTH || 8));
const MAX_FOLDERS = Math.max(1, Number(process.env.MAX_FOLDERS || 750));
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function createAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: SCOPES
    });
  }

  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return new google.auth.GoogleAuth({
    keyFilename,
    scopes: SCOPES
  });
}

const auth = createAuth();
const drive = google.drive({ version: 'v3', auth });

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(morgan('tiny'));
const apiCors = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (CLIENT_ORIGIN === '*' || CLIENT_ORIGIN.split(',').map((s) => s.trim()).includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  }
});
app.use('/api', apiCors);

const libraryConfig = {
  kids: { folderId: KIDS_DRIVE_FOLDER_ID },
  movie: { folderId: MOVIE_DRIVE_FOLDER_ID }
};

const videoCaches = new Map();

const hlsJobs = new Map();
const thumbnailJobs = new Map();
const thumbnailQueue = [];
let activeThumbnailJobs = 0;

function emptyCache() {
  return {
    fetchedAt: 0,
    videos: [],
    folderCount: 0,
    warnings: []
  };
}

function getLibraryKey(req) {
  return req.query.library === 'movie' || req.get('x-library') === 'movie' ? 'movie' : 'kids';
}

function getLibraryCache(libraryKey) {
  if (!videoCaches.has(libraryKey)) {
    videoCaches.set(libraryKey, emptyCache());
  }
  return videoCaches.get(libraryKey);
}

function setLibraryCache(libraryKey, cache) {
  videoCaches.set(libraryKey, cache);
}

function getLibraryFolderId(libraryKey) {
  return libraryConfig[libraryKey]?.folderId || libraryConfig.kids.folderId;
}

function ensureFolderConfigured(libraryKey) {
  const folderId = getLibraryFolderId(libraryKey);
  if (!folderId || folderId.includes('PASTE_')) {
    const err = new Error(`${libraryKey} Google Drive folder ID is not configured.`);
    err.status = 500;
    throw err;
  }
  return folderId;
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function stripVideoExtension(name = '') {
  return name.replace(/\.(mp4|m4v|webm|mov|avi|mkv|mpeg|mpg|3gp|ogg|ogv)$/i, '');
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanPathSegment(value) {
  const cleaned = String(value || 'Folder').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 90) || 'Folder';
}

function isVideoFile(file) {
  return String(file.mimeType || '').startsWith('video/');
}

function compareVideos(a, b) {
  const folderCompare = a.folderPathLabel.localeCompare(b.folderPathLabel, undefined, { numeric: true, sensitivity: 'base' });
  if (folderCompare !== 0) return folderCompare;
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeVideo(file, folderContext, libraryKey) {
  const durationMs = toNumber(file.videoMediaMetadata?.durationMillis);
  const width = toNumber(file.videoMediaMetadata?.width);
  const height = toNumber(file.videoMediaMetadata?.height);
  const pathSegments = folderContext.path || [];
  const folderPathLabel = pathSegments.length ? pathSegments.join(' / ') : 'Main folder';

  return {
    id: file.id,
    title: stripVideoExtension(file.name),
    filename: file.name,
    mimeType: file.mimeType,
    size: toNumber(file.size),
    createdTime: file.createdTime || null,
    modifiedTime: file.modifiedTime || null,
    durationMs,
    width,
    height,
    isHd: Boolean(width && width >= 1280),
    canDownload: file.capabilities?.canDownload !== false,
    collection: pathSegments[0] || 'Main folder',
    folderPath: pathSegments,
    folderPathLabel,
    depth: folderContext.depth || 0,
    streamUrl: `/api/stream/${file.id}?library=${libraryKey}`,
    hlsUrl: `/api/hls/${file.id}/master.m3u8?library=${libraryKey}`,
    directPlayable: isBrowserNativeVideo(file),
    thumbnailUrl: `/api/thumbnails/${file.id}?library=${libraryKey}&v=${encodeURIComponent(file.modifiedTime || '')}`,
    _thumbnailLink: file.thumbnailLink || null
  };
}

function isBrowserNativeVideo(file) {
  const name = String(file.name || '').toLowerCase();
  const mimeType = String(file.mimeType || '').toLowerCase();
  if (/\b(x265|h265|hevc|eac3|dts|truehd|10bit)\b/.test(name)) return false;
  if (name.endsWith('.mkv') || name.endsWith('.avi')) return false;
  return mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/ogg';
}

function canPrewarmHls(video) {
  const size = Number(video.size || 0);
  return video.canDownload && size > 0 && size <= HLS_PREWARM_MAX_BYTES;
}

function publicVideo(video) {
  const { _thumbnailLink, ...safeVideo } = video;
  return safeVideo;
}

function getHlsPaths(libraryKey, videoId) {
  const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeLibrary = String(libraryKey).replace(/[^a-zA-Z0-9_-]/g, '') || 'kids';
  const dir = path.join(HLS_CACHE_DIR, `${safeLibrary}-${HLS_CACHE_VERSION}-${safeId}`);
  return {
    dir,
    playlist: path.join(dir, 'master.m3u8'),
    segmentPattern: path.join(dir, 'segment-%05d.ts')
  };
}

function getThumbnailPath(libraryKey, videoId) {
  const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeLibrary = String(libraryKey).replace(/[^a-zA-Z0-9_-]/g, '') || 'kids';
  return path.join(CACHE_DIR, `${safeLibrary}-${safeId}.jpg`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(filePath, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return true;
    await sleep(500);
  }
  return fs.existsSync(filePath);
}

function countHlsSegments(paths) {
  if (!fs.existsSync(paths.dir)) return 0;
  return fs.readdirSync(paths.dir)
    .filter((name) => /^segment-\d{5}\.ts$/.test(name))
    .length;
}

function isHlsComplete(paths) {
  if (!fs.existsSync(paths.playlist)) return false;
  return fs.readFileSync(paths.playlist, 'utf8').includes('#EXT-X-ENDLIST');
}

function getRequiredHlsSegments(req) {
  const requestedStart = Number(req.query.start || 0);
  const startSeconds = Number.isFinite(requestedStart) && requestedStart > 0 ? requestedStart : 0;
  const initialSegments = HLS_START_SEGMENTS;
  if (!startSeconds) return initialSegments;

  const resumeBufferSeconds = Number(process.env.HLS_RESUME_BUFFER_SECONDS || 120);
  const segmentSeconds = Number(process.env.HLS_SEGMENT_SECONDS || 2);
  return Math.max(initialSegments, Math.ceil((startSeconds + resumeBufferSeconds) / segmentSeconds));
}

async function waitForHlsBuffer(paths, minSegments, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isHlsComplete(paths) || countHlsSegments(paths) >= minSegments) return true;
    await sleep(500);
  }
  return isHlsComplete(paths) || countHlsSegments(paths) >= minSegments;
}

function ffmpegHeaderString(headers) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n');
}

async function ensureHlsTranscode(libraryKey, video) {
  const paths = getHlsPaths(libraryKey, video.id);
  const jobKey = `${libraryKey}:${video.id}`;
  const existingJob = hlsJobs.get(jobKey);
  if (fs.existsSync(paths.playlist) && (isHlsComplete(paths) || existingJob)) return paths;
  if (existingJob) return existingJob.paths;

  fs.rmSync(paths.dir, { recursive: true, force: true });
  fs.mkdirSync(paths.dir, { recursive: true });

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.id)}?alt=media`;
  const headers = await authHeadersFor(driveUrl);
  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-headers', ffmpegHeaderString(headers),
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-fflags', '+genpts',
    '-i', driveUrl,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-max_muxing_queue_size', '2048',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'split_by_time+temp_file',
    '-hls_segment_filename', paths.segmentPattern,
    paths.playlist
  ];

  const child = spawn(FFMPEG_PATH, args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderr = '';
  const startTimeout = setTimeout(() => {
    if (!fs.existsSync(paths.playlist)) {
      child.kill('SIGKILL');
    }
  }, HLS_JOB_START_TIMEOUT_MS);
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });

  const job = { child, paths, stderr };
  hlsJobs.set(jobKey, job);

  child.on('exit', (code) => {
    clearTimeout(startTimeout);
    hlsJobs.delete(jobKey);
    if (code !== 0 && !fs.existsSync(paths.playlist)) {
      console.error(`HLS transcode failed for ${video.id} with code ${code}: ${stderr}`);
    }
  });

  child.on('error', (error) => {
    clearTimeout(startTimeout);
    hlsJobs.delete(jobKey);
    console.error(`Could not start ffmpeg for ${video.id}:`, error);
  });

  return paths;
}

function runNextThumbnailJob() {
  if (activeThumbnailJobs >= THUMBNAIL_CONCURRENCY) return;
  const nextJob = thumbnailQueue.shift();
  if (!nextJob) return;

  activeThumbnailJobs += 1;
  nextJob().finally(() => {
    activeThumbnailJobs -= 1;
    runNextThumbnailJob();
  });
}

function enqueueThumbnailJob(jobKey, runJob) {
  const existingJob = thumbnailJobs.get(jobKey);
  if (existingJob) return existingJob;

  let resolveJob;
  let rejectJob;
  const jobPromise = new Promise((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
  });
  thumbnailJobs.set(jobKey, jobPromise);

  thumbnailQueue.push(async () => {
    try {
      const result = await runJob();
      resolveJob(result);
    } catch (error) {
      rejectJob(error);
    } finally {
      thumbnailJobs.delete(jobKey);
    }
  });
  runNextThumbnailJob();

  return jobPromise;
}

function waitForPromise(promise, timeoutMs) {
  if (!timeoutMs) return Promise.resolve(false);
  return Promise.race([
    promise.then(() => true, () => false),
    sleep(timeoutMs).then(() => false)
  ]);
}

async function ensureGeneratedThumbnail(libraryKey, video, cachePath) {
  if (fs.existsSync(cachePath)) return cachePath;
  if (!video.canDownload) {
    const err = new Error('Video cannot be downloaded for thumbnail generation.');
    err.status = 403;
    throw err;
  }

  const jobKey = `${libraryKey}:${video.id}`;
  return enqueueThumbnailJob(jobKey, async () => {
    if (fs.existsSync(cachePath)) return cachePath;

    const tempPath = `${cachePath}.${Date.now()}.tmp.jpg`;
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.id)}?alt=media`;
    const headers = await authHeadersFor(driveUrl);
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-ss', String(THUMBNAIL_SEEK_SECONDS),
      '-headers', ffmpegHeaderString(headers),
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', driveUrl,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '4',
      tempPath
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(FFMPEG_PATH, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      });
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, THUMBNAIL_TIMEOUT_MS);

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
          fs.renameSync(tempPath, cachePath);
          resolve();
          return;
        }

        fs.rmSync(tempPath, { force: true });
        reject(new Error(`Thumbnail ffmpeg failed for ${video.id} with code ${code}: ${stderr}`));
      });
    });

    return cachePath;
  });
}

async function listDriveChildren(parentFolderId) {
  const escapedParent = escapeDriveQueryValue(parentFolderId);
  const q = `'${escapedParent}' in parents and trashed = false`;
  let pageToken;
  const children = [];

  do {
    const response = await drive.files.list({
      q,
      pageSize: 100,
      pageToken,
      orderBy: 'name_natural',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,parents,videoMediaMetadata,capabilities/canDownload)'
    });

    children.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return children;
}

async function scanApprovedFolderTree(libraryKey) {
  const folderId = ensureFolderConfigured(libraryKey);

  const queue = [{ id: folderId, path: [], depth: 0 }];
  const visitedFolders = new Set();
  const videos = [];
  const warnings = [];
  let folderCount = 0;

  while (queue.length) {
    const folderContext = queue.shift();
    if (visitedFolders.has(folderContext.id)) continue;
    visitedFolders.add(folderContext.id);
    folderCount += 1;

    if (folderCount > MAX_FOLDERS) {
      warnings.push(`Scan stopped after ${MAX_FOLDERS} folders. Raise MAX_FOLDERS if your approved library is larger.`);
      break;
    }

    let children = [];
    try {
      children = await listDriveChildren(folderContext.id);
    } catch (error) {
      const folderLabel = folderContext.path.length ? folderContext.path.join(' / ') : 'Main folder';
      warnings.push(`Could not scan ${folderLabel}: ${error.message || 'Google Drive error'}`);
      continue;
    }

    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        if (INCLUDE_SUBFOLDERS && folderContext.depth < MAX_SCAN_DEPTH) {
          queue.push({
            id: child.id,
            path: [...folderContext.path, cleanPathSegment(child.name)],
            depth: folderContext.depth + 1
          });
        }
        continue;
      }

      if (isVideoFile(child)) {
        videos.push(normalizeVideo(child, folderContext, libraryKey));
      }
    }
  }

  videos.sort(compareVideos);
  return { videos, folderCount, warnings };
}

async function listVideos({ force = false, libraryKey = 'kids' } = {}) {
  ensureFolderConfigured(libraryKey);

  const videoCache = getLibraryCache(libraryKey);
  const cacheIsFresh = Date.now() - videoCache.fetchedAt < CACHE_TTL_MS;
  if (!force && cacheIsFresh) {
    return videoCache.videos;
  }

  const scanResult = await scanApprovedFolderTree(libraryKey);
  setLibraryCache(libraryKey, {
    fetchedAt: Date.now(),
    videos: scanResult.videos,
    folderCount: scanResult.folderCount,
    warnings: scanResult.warnings
  });

  return getLibraryCache(libraryKey).videos;
}

async function getAllowedVideo(fileId, libraryKey = 'kids', { allowStale = false } = {}) {
  const id = String(fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    const err = new Error('Invalid video ID.');
    err.status = 400;
    throw err;
  }

  const videoCache = getLibraryCache(libraryKey);
  let videos = allowStale && videoCache.videos.length
    ? videoCache.videos
    : await listVideos({ libraryKey });
  let video = videos.find((item) => item.id === id);

  // Refresh once in case the parent has just added a new Drive file.
  if (!video) {
    videos = await listVideos({ force: true, libraryKey });
    video = videos.find((item) => item.id === id);
  }

  if (!video) {
    const err = new Error('Video not found in the approved Google Drive folder tree.');
    err.status = 404;
    throw err;
  }

  return video;
}

function headersToPlainObject(headers) {
  if (!headers) return {};
  if (typeof headers.entries === 'function') {
    return Object.fromEntries([...headers.entries()].map(([key, value]) => [key, String(value)]));
  }
  if (typeof headers.forEach === 'function') {
    const plain = {};
    headers.forEach((value, key) => {
      plain[key] = String(value);
    });
    return plain;
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !fileSize) return null;
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);

  if (start === null && end === null) return null;
  if (start !== null && (!Number.isSafeInteger(start) || start < 0)) return null;
  if (end !== null && (!Number.isSafeInteger(end) || end < 0)) return null;

  if (start === null) {
    const suffixLength = Math.min(end, fileSize);
    start = fileSize - suffixLength;
    end = fileSize - 1;
  } else if (end === null || end >= fileSize) {
    end = Math.min(fileSize - 1, start + STREAM_CHUNK_SIZE - 1);
  } else {
    end = Math.min(end, start + STREAM_CHUNK_SIZE - 1);
  }

  if (start >= fileSize || end < start) return null;
  return { start, end };
}

async function authHeadersFor(url) {
  if (typeof auth.getClient === 'function') {
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders(url);
    return headersToPlainObject(headers);
  }

  if (typeof auth.getRequestHeaders === 'function') {
    const headers = await auth.getRequestHeaders(url);
    return headersToPlainObject(headers);
  }

  const err = new Error('Google authentication client is not ready.');
  err.status = 500;
  throw err;
}

function sendPlaceholderThumbnail(res, title = 'Movie', status = 'placeholder') {
  const safeTitle = String(title).replace(/[<&>"']/g, '');
  const words = safeTitle.split(/\s+/).slice(0, 4).join(' ');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#8b5cf6"/>
          <stop offset="45%" stop-color="#ec4899"/>
          <stop offset="100%" stop-color="#22c55e"/>
        </linearGradient>
      </defs>
      <rect width="960" height="540" rx="44" fill="url(#bg)"/>
      <circle cx="150" cy="105" r="54" fill="rgba(255,255,255,.22)"/>
      <circle cx="830" cy="410" r="92" fill="rgba(255,255,255,.16)"/>
      <path d="M417 225c0-22 24-36 43-24l106 65c18 11 18 37 0 48l-106 65c-19 12-43-2-43-24V225z" fill="white" fill-opacity=".92"/>
      <text x="480" y="456" text-anchor="middle" font-size="44" font-family="Arial, sans-serif" font-weight="700" fill="white">${words || 'Movie Time'}</text>
    </svg>`;

  res.status(200).set({
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'private, max-age=60',
    'X-Thumbnail-Status': status
  }).send(svg);
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    folderConfigured: Boolean(KIDS_DRIVE_FOLDER_ID && !KIDS_DRIVE_FOLDER_ID.includes('PASTE_')),
    libraries: {
      kids: Boolean(KIDS_DRIVE_FOLDER_ID && !KIDS_DRIVE_FOLDER_ID.includes('PASTE_')),
      movie: Boolean(MOVIE_DRIVE_FOLDER_ID && !MOVIE_DRIVE_FOLDER_ID.includes('PASTE_'))
    },
    includeSubfolders: INCLUDE_SUBFOLDERS,
    maxScanDepth: MAX_SCAN_DEPTH,
    cacheAgeMs: getLibraryCache('kids').fetchedAt ? Date.now() - getLibraryCache('kids').fetchedAt : null
  });
});

app.get('/api/videos', async (req, res, next) => {
  try {
    const libraryKey = getLibraryKey(req);
    const force = req.query.refresh === '1';
    const query = String(req.query.q || '').trim().toLowerCase();
    let videos = await listVideos({ force, libraryKey });
    const videoCache = getLibraryCache(libraryKey);

    if (query) {
      videos = videos.filter((video) =>
        video.title.toLowerCase().includes(query) ||
        video.filename.toLowerCase().includes(query) ||
        video.folderPathLabel.toLowerCase().includes(query)
      );
    }

    const collections = [...new Set(videoCache.videos.map((video) => video.collection))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    res.json({
      count: videos.length,
      refreshedAt: new Date(videoCache.fetchedAt).toISOString(),
      library: {
        key: libraryKey,
        configuredFolderId: getLibraryFolderId(libraryKey),
        includeSubfolders: INCLUDE_SUBFOLDERS,
        maxScanDepth: MAX_SCAN_DEPTH,
        folderCount: videoCache.folderCount,
        collections,
        warnings: videoCache.warnings
      },
      videos: videos.map(publicVideo)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/thumbnails/:id', async (req, res, next) => {
  try {
    const libraryKey = getLibraryKey(req);
    const video = await getAllowedVideo(req.params.id, libraryKey);
    const cachePath = getThumbnailPath(libraryKey, video.id);

    // 1. Check if cached thumbnail exists
    if (fs.existsSync(cachePath)) {
      res.status(200).set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=86400'
      });
      return fs.createReadStream(cachePath).pipe(res);
    }

    const thumbnailLink = video._thumbnailLink;

    // 2. If Google has a thumbnail link, download it, cache it, and serve it
    if (thumbnailLink) {
      try {
        const thumbnailUrl = thumbnailLink.replace(/=s\d+(-c)?$/, '=s640');
        const headers = await authHeadersFor(thumbnailUrl);
        const response = await fetch(thumbnailUrl, { headers });

        if (response.ok && response.body) {
          const fileStream = fs.createWriteStream(cachePath);
          const responseBodyNode = Readable.fromWeb(response.body);
          responseBodyNode.pipe(fileStream);

          res.status(200).set({
            'Content-Type': response.headers.get('content-type') || 'image/jpeg',
            'Cache-Control': 'private, max-age=86400'
          });

          // Serve it immediately
          responseBodyNode.pipe(res);
          return;
        }
      } catch (err) {
        console.error('Error fetching Google Drive thumbnail:', err);
      }
    }

    try {
      const thumbnailJob = ensureGeneratedThumbnail(libraryKey, video, cachePath);
      const ready = await waitForPromise(thumbnailJob, THUMBNAIL_WAIT_MS);
      if (ready && fs.existsSync(cachePath)) {
        res.status(200).set({
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=86400',
          'X-Thumbnail-Status': 'generated'
        });
        return fs.createReadStream(cachePath).pipe(res);
      }

      return sendPlaceholderThumbnail(res, video.title, 'generating');
    } catch (err) {
      console.error('Error generating video thumbnail:', err);
      return sendPlaceholderThumbnail(res, video.title, 'placeholder');
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/stream/:id', async (req, res, next) => {
  try {
    const libraryKey = getLibraryKey(req);
    const video = await getAllowedVideo(req.params.id, libraryKey, { allowStale: true });
    const fileSize = Number(video.size || 0);

    if (!video.canDownload) {
      const err = new Error('This file cannot be downloaded/streamed from Google Drive.');
      err.status = 403;
      throw err;
    }

    if (!fileSize) {
      const err = new Error('Video size is unavailable, so this file cannot be streamed reliably.');
      err.status = 422;
      throw err;
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.id)}?alt=media`;
    const headers = await authHeadersFor(driveUrl);
    const range = parseRangeHeader(req.headers.range || `bytes=0-${STREAM_CHUNK_SIZE - 1}`, fileSize);

    if (!range) {
      res.status(416).set({
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes'
      }).end();
      return;
    }

    headers.Range = `bytes=${range.start}-${range.end}`;

    const response = await fetch(driveUrl, { headers });

    if (response.status !== 206 || !response.body) {
      const details = await response.text().catch(() => '');
      const err = new Error(`Google Drive stream failed with ${response.status}. ${details}`.trim());
      err.status = response.status || 502;
      throw err;
    }

    const contentLength = range.end - range.start + 1;
    res.status(206).set({
      'Content-Type': response.headers.get('content-type') || video.mimeType || 'video/mp4',
      'Content-Length': String(contentLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600'
    });

    const upstream = Readable.fromWeb(response.body);
    res.on('close', () => upstream.destroy());
    upstream.pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/hls/:id/master.m3u8', async (req, res, next) => {
  try {
    const libraryKey = getLibraryKey(req);
    const video = await getAllowedVideo(req.params.id, libraryKey, { allowStale: true });
    if (!video.canDownload) {
      const err = new Error('This file cannot be transcoded from Google Drive.');
      err.status = 403;
      throw err;
    }

    const paths = await ensureHlsTranscode(libraryKey, video);
    const ready = await waitForFile(paths.playlist, HLS_START_TIMEOUT_MS);
    if (!ready) {
      res.status(202).json({
        status: 'preparing',
        message: 'Preparing playable audio stream. Try play again in a few seconds.'
      });
      return;
    }

    const requiredSegments = getRequiredHlsSegments(req);
    const bufferReady = await waitForHlsBuffer(
      paths,
      requiredSegments,
      HLS_BUFFER_TIMEOUT_MS
    );
    if (!bufferReady) {
      res.status(202).json({
        status: 'preparing',
        message: 'Preparing enough video before playback starts.',
        segmentsReady: countHlsSegments(paths),
        segmentsNeeded: requiredSegments
      });
      return;
    }

    const playlist = fs.readFileSync(paths.playlist, 'utf8')
      .replace(/(segment-\d{5}\.ts)(?!\?)/g, `$1?library=${libraryKey}`);

    res.status(200).set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store'
    }).send(playlist);
  } catch (error) {
    next(error);
  }
});

app.post('/api/hls/:id/prewarm', async (req, res, next) => {
  try {
    const libraryKey = getLibraryKey(req);
    const video = await getAllowedVideo(req.params.id, libraryKey, { allowStale: true });
    if (!video.canDownload) {
      const err = new Error('This file cannot be transcoded from Google Drive.');
      err.status = 403;
      throw err;
    }

    if (!canPrewarmHls(video)) {
      res.status(202).json({
        status: 'skipped',
        message: 'HLS prewarm skipped for large files; it will start when the video is opened.',
        size: video.size || null
      });
      return;
    }

    const paths = getHlsPaths(libraryKey, video.id);
    const jobKey = `${libraryKey}:${video.id}`;
    const segmentsReady = countHlsSegments(paths);
    if (isHlsComplete(paths) || segmentsReady >= HLS_START_SEGMENTS) {
      res.json({
        status: 'ready',
        segmentsReady,
        complete: isHlsComplete(paths)
      });
      return;
    }

    if (hlsJobs.has(jobKey)) {
      res.status(202).json({
        status: 'preparing',
        segmentsReady,
        activeJobs: hlsJobs.size
      });
      return;
    }

    if (HLS_PREWARM_MAX_ACTIVE === 0 || hlsJobs.size >= HLS_PREWARM_MAX_ACTIVE) {
      res.status(202).json({
        status: 'busy',
        message: 'HLS prewarm skipped because another stream is already preparing.',
        segmentsReady,
        activeJobs: hlsJobs.size
      });
      return;
    }

    await ensureHlsTranscode(libraryKey, video);
    res.status(202).json({
      status: 'started',
      segmentsReady: countHlsSegments(paths),
      activeJobs: hlsJobs.size
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/hls/:id/:segment', async (req, res, next) => {
  try {
    const libraryKey = getLibraryKey(req);
    await getAllowedVideo(req.params.id, libraryKey, { allowStale: true });
    const segment = String(req.params.segment || '');
    if (!/^segment-\d{5}\.ts$/.test(segment)) {
      const err = new Error('Invalid HLS segment.');
      err.status = 400;
      throw err;
    }

    const paths = getHlsPaths(libraryKey, req.params.id);
    const segmentPath = path.join(paths.dir, segment);
    const ready = await waitForFile(segmentPath, Number(process.env.HLS_SEGMENT_TIMEOUT_MS || 15000));
    if (!ready) {
      const err = new Error('Video segment is not ready yet.');
      err.status = 404;
      throw err;
    }

    res.status(200).set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'private, max-age=3600'
    });
    fs.createReadStream(segmentPath).pipe(res);
  } catch (error) {
    next(error);
  }
});

const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  const status = Number(error.status || error.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;

  if (safeStatus >= 500) {
    console.error(error);
  }

  res.status(safeStatus).json({
    error: safeStatus >= 500 ? 'Server error' : error.message,
    detail: process.env.NODE_ENV === 'production' ? undefined : error.message
  });
});

app.listen(PORT, () => {
  console.log(`Kids Drive Cinema server running on http://localhost:${PORT}`);
});
