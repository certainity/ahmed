import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { cleanTitle, continueWatching, playbackQueue, isShortVideo } from './media-utils.js';
import { readCatalogue, saveCatalogue } from './catalogue-store.js';
import { mountPlayback, warmPlayback } from './playback.js';
import ShortsFeed from './shorts.jsx';
import './youtube-theme.css';

const PROJECTOR_ART = '/assets/cinema/cinema-projector-web-v02.png';

const STORAGE_KEYS = {
  favorites: 'kids-drive-cinema:favorites:v2',
  progress: 'kids-drive-cinema:progress:v2',
  quality: 'kids-drive-cinema:quality:v1'
};

const IS_MOVIE_SITE = typeof window !== 'undefined' && window.location.hostname.includes('drive-movies-cinema');
const API_ORIGIN = IS_MOVIE_SITE ? 'https://kids-drive-cinema.onrender.com' : '';
const API_LIBRARY = IS_MOVIE_SITE ? 'movie' : 'kids';
const APP_COPY = IS_MOVIE_SITE
  ? {
      title: 'Drive Movies',
      search: 'Search movies, folders, or collections',
      empty: 'No movies found'
    }
  : {
      title: 'Kids Cinema',
      search: 'Search videos',
      empty: 'No videos found'
    };

function apiUrl(path) {
  const url = new URL(path, API_ORIGIN || window.location.origin);
  if (url.pathname.startsWith('/api/') && !url.searchParams.has('library')) {
    url.searchParams.set('library', API_LIBRARY);
  }
  return API_ORIGIN ? url.href : `${url.pathname}${url.search}${url.hash}`;
}

function normalizeVideo(video) {
  return {
    ...video,
    searchText: [video.title, cleanTitle(video.title), video.filename, video.collection, video.folderPathLabel].filter(Boolean).join(' ').toLowerCase(),
    thumbnailUrl: apiUrl(video.thumbnailUrl),
    streamUrl: apiUrl(video.streamUrl),
    hlsUrl: apiUrl(video.hlsUrl)
  };
}

function readJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    const value = stored ? JSON.parse(stored) : fallback;
    if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
    if (fallback && typeof fallback === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    return typeof value === typeof fallback ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Playback still works when storage is full or private. */ }
}

function formatDuration(ms) {
  if (!ms) return 'Video';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function episodeLabel(video) {
  const title = `${video.title || ''} ${video.filename || ''}`;
  const match = title.match(/\bS(\d{1,2})E(\d{1,3})\b/i);
  if (match) return `S${match[1]} E${match[2]}`;
  if (video.durationMs) return formatDuration(video.durationMs);
  return 'Video';
}

function isShort(video) {
  return isShortVideo(video);
}

function progressPercent(video, progress) {
  const item = progress[video.id];
  if (!item?.currentTime) return 0;
  const duration = video.durationMs ? video.durationMs / 1000 : item.duration;
  if (!duration || !Number.isFinite(duration)) return item.currentTime > 8 ? 8 : 0;
  return Math.min(98, Math.max(0, (item.currentTime / duration) * 100));
}

function sortVideos(videos, sortMode) {
  const list = [...videos];
  if (sortMode === 'recent') {
    return list.sort((a, b) => new Date(b.modifiedTime || b.createdTime || 0) - new Date(a.modifiedTime || a.createdTime || 0));
  }
  if (sortMode === 'short') {
    return list.sort((a, b) => (a.durationMs || Infinity) - (b.durationMs || Infinity));
  }
  if (sortMode === 'long') {
    return list.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
  }
  return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}

function useVideos() {
  const [videos, setVideos] = useState([]);
  const [library, setLibrary] = useState({ collections: [], warnings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');
  const requestRef = useRef(null);
  const pollRef = useRef(null);
  const snapshotRef = useRef(null);

  async function load(refresh = false) {
    requestRef.current?.abort();
    clearTimeout(pollRef.current);
    const aborter = new AbortController();
    requestRef.current = aborter;
    const deadline = setTimeout(() => aborter.abort('timeout'), 45000);
    setLoading(true);
    setError('');
    try {
      const headers = snapshotRef.current?.etag && !refresh ? { 'If-None-Match': snapshotRef.current.etag } : {};
      const response = await fetch(apiUrl(`/api/videos${refresh ? '?refresh=1' : ''}`), { cache: 'no-cache', headers, signal: aborter.signal });
      const payload = response.status === 304 ? snapshotRef.current?.payload : await response.json().catch(() => ({}));
      if (!payload || (!response.ok && response.status !== 304)) throw new Error(payload?.detail || payload?.error || 'Could not load the Drive folder.');
      if (response.status !== 304) {
        snapshotRef.current = { etag: response.headers.get('etag'), payload };
        saveCatalogue(API_LIBRARY, snapshotRef.current);
      }
      if (response.status !== 304) setVideos((payload.videos || []).map(normalizeVideo));
      setLibrary({ ...(payload.library || { collections: [], warnings: [] }), refreshing: Boolean(payload.refreshing) });
      setRefreshedAt(payload.refreshedAt || new Date().toISOString());
      if (payload.refreshing) pollRef.current = setTimeout(() => load(false), 3000);
    } catch (err) {
      if (aborter.signal.aborted && aborter.signal.reason !== 'timeout') return;
      setError(aborter.signal.reason === 'timeout' ? 'The Drive folder is taking longer than expected. Try refreshing.' : err.message || 'Could not load the Drive folder.');
    } finally {
      clearTimeout(deadline);
      if (requestRef.current === aborter) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    readCatalogue(API_LIBRARY).then(snapshot => {
      if (cancelled) return;
      if (snapshot && Array.isArray(snapshot.payload.videos)) {
        performance.mark('cinema-catalogue-cache-ready');
        snapshotRef.current = snapshot;
        setVideos(snapshot.payload.videos.map(normalizeVideo));
        setLibrary(snapshot.payload.library || { collections: [], warnings: [] });
        setRefreshedAt(snapshot.payload.refreshedAt);
      }
      load(false);
    });
    return () => { cancelled = true; requestRef.current?.abort(); clearTimeout(pollRef.current); };
  }, []);

  return { videos, library, loading, error, refreshedAt, refresh: () => load(true) };
}

/* ---------- icons ---------- */

function Svg({ children, size = 24, stroke = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 1.8 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const MenuIcon = () => <Svg><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" /></Svg>;
const SearchIcon = () => (
  <Svg stroke size={20}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);
const HomeIcon = () => <Svg><path d="M12 3.2l8.5 7.3h-2.3V20h-4.7v-5.6h-3v5.6H5.8v-9.5H3.5L12 3.2z" /></Svg>;
const ShortsIcon = () => <img className="shorts-mark" src="/assets/cinema/kids-shorts-icon-v01.png" alt="" />;
const HistoryIcon = () => (
  <Svg stroke size={22}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.5V12l3.2 2" />
  </Svg>
);
const BookmarkIcon = ({ filled = false }) => (
  filled
    ? <Svg size={20}><path d="M6 4h12v17l-6-4.2L6 21V4z" /></Svg>
    : <Svg stroke size={20}><path d="M6.8 4.8h10.4v15l-5.2-3.6-5.2 3.6v-15z" /></Svg>
);
const SyncIcon = () => <Svg size={20}><path d="M17.65 6.35A8 8 0 1 0 20 12h-2.1a6 6 0 1 1-1.6-4.06L13.5 10.5H20V4l-2.35 2.35z" /></Svg>;
const CloseIcon = () => <Svg stroke size={20}><path d="m6 6 12 12M18 6 6 18" /></Svg>;
const FolderIcon = () => <Svg stroke size={20}><path d="M3 7V5h6l2 2h10v13H3V7z" /></Svg>;
const BackIcon = () => <Svg stroke size={20}><path d="M19 12H5m6-6-6 6 6 6" /></Svg>;
const PlayIcon = () => <Svg size={24}><path d="M8 4v16l12-8L8 4z" /></Svg>;
const PrevIcon = () => <Svg size={20}><path d="M6 6h2v12H6V6zm12 0v12l-9-6 9-6z" /></Svg>;
const NextIcon = () => <Svg size={20}><path d="M16 6h2v12h-2V6zM6 6l9 6-9 6V6z" /></Svg>;
const ExternalIcon = () => (
  <Svg stroke size={18}>
    <path d="M14 5h5v5" />
    <path d="M19 5l-8 8" />
    <path d="M19 14v5H5V5h5" />
  </Svg>
);
const DownloadIcon = () => (
  <Svg stroke size={18}>
    <path d="M12 4v11" />
    <path d="M7 11l5 5 5-5" />
    <path d="M5 20h14" />
  </Svg>
);

/* ---------- shared bits ---------- */

function folderHue(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

function Avatar({ name, size = 36 }) {
  const hue = folderHue(name);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.44),
        background: `linear-gradient(135deg, hsl(${hue} 65% 46%), hsl(${(hue + 45) % 360} 65% 34%))`
      }}
      aria-hidden="true"
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function VideoThumbnail({ video, eager = false }) {
  const [failed, setFailed] = useState(false);
  const fallback = failed || video.hasThumbnail === false;
  return <img src={fallback ? PROJECTOR_ART : video.thumbnailUrl} className={fallback ? 'fallback-thumbnail' : ''}
    alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />;
}

/* ---------- watch page ---------- */

function WatchView({ video, queue, progress, setProgress, onPick, onClose, favorite, onToggleFavorite, autoplay, setAutoplay }) {
  const videoRef = useRef(null);
  const cinemaButtonRef = useRef(null);
  const exitCinemaRef = useRef(null);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [mode, setMode] = useState('browser');
  const [status, setStatus] = useState('Loading your video…');
  const [retryCount, setRetryCount] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackConfig, setPlaybackConfig] = useState(null);
  const [quality, setQuality] = useState(null);
  const [resolution, setResolution] = useState('');
  const resumeTimeRef = useRef(0);
  const lastProgressSaveRef = useRef(0);

  const currentIndex = queue.findIndex((item) => item.id === video?.id);
  const previous = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;

  const upNext = useMemo(() => {
    if (!queue.length) return [];
    const start = Math.max(0, currentIndex);
    const items = [];
    for (let i = 1; i <= Math.min(25, queue.length - 1); i += 1) {
      items.push(queue[(start + i) % queue.length]);
    }
    return items;
  }, [queue, currentIndex]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl('/api/playback-config'), { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      .catch(() => ({ qualities: ['auto'], defaultQuality: 'auto' }))
      .then(config => {
        if (controller.signal.aborted) return;
        const available = Array.isArray(config.qualities) ? config.qualities.filter(item => ['auto', '720p', '1080p'].includes(item)) : ['auto'];
        const saved = readJson(STORAGE_KEYS.quality, '');
        setPlaybackConfig({ ...config, qualities: available });
        setQuality(available.includes(saved) ? saved : available.includes(config.defaultQuality) ? config.defaultQuality : 'auto');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const player = videoRef.current;
    if (!player || mode !== 'browser' || quality === null) return;
    const resumeAt = resumeTimeRef.current || (continueWatching(video, progress) ? progress[video.id].currentTime : 0);
    resumeTimeRef.current = 0;
    setResolution('');
    setPlaybackError(false);
    return mountPlayback(player, video, { resumeAt, quality, onStatus: setStatus, onFailure: () => setPlaybackError(true) });
  }, [video.id, mode, retryCount, quality]);

  useEffect(() => {
    const flush = () => remember(true);
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, [video.id, mode]);

  useEffect(() => {
    // Put the primary TV action within reach of OK/Enter, even without a pointer.
    (exitCinemaRef.current || cinemaButtonRef.current)?.focus({ preventScroll: true });
  }, [video.id]);

  useEffect(() => {
    const onCinemaKey = (event) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;

      if (event.key?.toLowerCase() === 'c') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) setCinemaMode(current => !current);
        return;
      }

      const active = document.activeElement;
      if (event.key === 'ArrowUp' && (active === document.body || active === document.documentElement || active === videoRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        (cinemaMode ? exitCinemaRef.current : cinemaButtonRef.current)?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onCinemaKey, true);
    return () => window.removeEventListener('keydown', onCinemaKey, true);
  }, [cinemaMode]);

  useEffect(() => {
    if (!cinemaMode) return;
    // Keep this a CSS layout change: browser fullscreen stalls playback on some TVs.
    document.body.classList.add('cinema-mode-active');
    exitCinemaRef.current?.focus({ preventScroll: true });
    // Handle Escape before the watch page's normal back-to-library shortcut.
    const exitOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setCinemaMode(false);
    };
    window.addEventListener('keydown', exitOnEscape, true);
    return () => {
      document.body.classList.remove('cinema-mode-active');
      window.removeEventListener('keydown', exitOnEscape, true);
      cinemaButtonRef.current?.focus({ preventScroll: true });
    };
  }, [cinemaMode]);

  if (!video) return null;

  function remember(force = false) {
    const player = videoRef.current;
    if (!player || mode !== 'browser' || player.readyState === 0) return;
    // Saving progress re-renders the page; throttle it so timeupdate
    // (4x/second) does not overwhelm low-power devices like TVs.
    const now = Date.now();
    if (!force && now - lastProgressSaveRef.current < 5000) return;
    lastProgressSaveRef.current = now;
    // Capture before React can detach/reset the media element on navigation.
    const snapshot = {
      currentTime: player.currentTime || 0,
      duration: video.durationMs / 1000 || (Number.isFinite(player.duration) ? player.duration : 0),
      completed: player.ended,
      updatedAt: now
    };
    setProgress((current) => {
      const nextProgress = {
        ...current,
        [video.id]: snapshot
      };
      writeJson(STORAGE_KEYS.progress, nextProgress);
      return nextProgress;
    });
  }

  function chooseMode(nextMode) {
    remember(true);
    setStatus('');
    setPlaybackError(false);
    setMode(nextMode);
  }

  function retryPlayback() {
    resumeTimeRef.current = videoRef.current?.currentTime || progress[video.id]?.currentTime || 0;
    setPlaybackError(false);
    setStatus('Loading your video…');
    setRetryCount(count => count + 1);
  }

  function chooseQuality(value) {
    if (value === quality) return;
    resumeTimeRef.current = videoRef.current?.currentTime || progress[video.id]?.currentTime || 0;
    remember(true);
    writeJson(STORAGE_KEYS.quality, value);
    setResolution('');
    setQuality(value);
  }

  function updateResolution() {
    const player = videoRef.current;
    if (player?.videoWidth && player?.videoHeight) setResolution(`${player.videoWidth} × ${player.videoHeight}`);
  }

  function pickEpisode(item) { remember(true); if (item) onPick(item); }

  const collection = video.collection || video.folderPath?.[0] || 'Main folder';

  return (
    <section className="watch-layout">
      <div className="watch-primary">
        <div className="watch-player-toolbar">
          <button className="back-button" onClick={() => { remember(true); onClose(); }} type="button"><BackIcon /> Back to videos</button>
          <div className="watch-player-options">
            {mode === 'browser' && playbackConfig?.hdEnabled ? (
              <label className="quality-control">
                <span>Quality</span>
                <select aria-label="Playback quality" value={quality || 'auto'} onChange={event => chooseQuality(event.target.value)}>
                  {playbackConfig.qualities.map(value => <option key={value} value={value}>{value === 'auto' ? 'Auto' : `${value} HD`}</option>)}
                </select>
              </label>
            ) : null}
            <button ref={cinemaButtonRef} className="cinema-mode-button" aria-pressed={cinemaMode} aria-controls="watch-player" aria-keyshortcuts="c" title="Cinema mode (C; TV remote: Up, then OK)" onClick={() => setCinemaMode(true)} type="button">
              <img src="/assets/cinema/tv-cinema-mode-icon-v01.png" alt="" width="30" height="20" />
              Cinema mode
            </button>
          </div>
        </div>
        <div id="watch-player" className={`player-box${cinemaMode ? ' cinema-player' : ''}`}>
          {mode === 'drive' && video.drivePreviewUrl ? (
            <iframe
              className="drive-frame"
              title={`Drive preview for ${video.title}`}
              src={video.drivePreviewUrl}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          ) : (
            <video
              ref={videoRef}
              poster={video.thumbnailUrl}
              controls
              controlsList="nofullscreen"
              playsInline
              preload="metadata"
              onDoubleClick={(event) => { event.preventDefault(); setCinemaMode(true); }}
              onPlaying={() => { setStatus(''); setPlaybackError(false); updateResolution(); }}
              onLoadedMetadata={updateResolution}
              onResize={updateResolution}
              onWaiting={() => setStatus('Buffering your video…')}
              onTimeUpdate={() => remember()}
              onPause={() => remember(true)}
              onSeeked={() => remember(true)}
              onEnded={() => {
                remember(true);
                if (autoplay && next) pickEpisode(next);
                else setStatus('Finished watching. Pick another video when you’re ready.');
              }}
            />
          )}
          {cinemaMode ? (
            <div className="cinema-overlay">
              <span className="cinema-mode-label">Cinema mode</span>
              <button ref={exitCinemaRef} className="exit-cinema-button" aria-keyshortcuts="c Escape" title="Exit Cinema mode (C or Escape)" onClick={() => setCinemaMode(false)} type="button">Exit Cinema mode</button>
            </div>
          ) : null}
        </div>

        {mode === 'browser' && resolution ? <p className="playing-resolution">Playing: {resolution}</p> : null}
        <h1 className="watch-title">{cleanTitle(video.title)}</h1>

        <div className="watch-row">
          <div className="watch-channel">
            <Avatar name={collection} size={40} />
            <div className="channel-text">
              <span className="channel-name">{cleanTitle(collection)}</span>
              <span className="channel-sub">
                {formatDuration(video.durationMs)}
                {video.size ? ` · ${formatSize(video.size)}` : ''}
              </span>
            </div>
            <button className={`save-pill ${favorite ? 'saved' : ''}`} onClick={() => onToggleFavorite(video.id)} type="button">
              <BookmarkIcon filled={favorite} />
              {favorite ? 'Saved' : 'Save'}
            </button>
          </div>

          <div className="watch-actions">
            <div className="mode-toggle" aria-label="Player mode">
              <button className={mode === 'browser' ? 'active' : ''} aria-pressed={mode === 'browser'} onClick={() => chooseMode('browser')} type="button">Player</button>
              <button className={mode === 'drive' ? 'active' : ''} aria-pressed={mode === 'drive'} onClick={() => chooseMode('drive')} type="button" disabled={!video.drivePreviewUrl}>Drive preview</button>
            </div>
            <button className="chip-btn" onClick={() => pickEpisode(previous)} disabled={!previous} type="button"><PrevIcon /> Previous</button>
            <button className="chip-btn" onClick={() => pickEpisode(next)} disabled={!next} type="button">Next <NextIcon /></button>
            {mode === 'browser' ? <button className="chip-btn" onClick={retryPlayback} type="button"><SyncIcon /> Retry playback</button> : null}
            {video.driveViewUrl ? <a className="chip-btn" href={video.driveViewUrl} target="_blank" rel="noreferrer"><ExternalIcon /> Drive</a> : null}
          </div>
        </div>

        <div className="watch-description">
          <p className="desc-strong">
            {episodeLabel(video)}
            {video.width && video.height ? ` • ${video.width}x${video.height}` : ''}
            {video.size ? ` • ${formatSize(video.size)}` : ''}
          </p>
          <p className={`desc-line ${playbackError ? 'playback-error' : ''}`} role="status" aria-live="polite">{status || 'Playing from your Google Drive folder.'}</p>
          {playbackError ? <button className="chip-btn" onClick={retryPlayback} type="button">Try again</button> : null}
        </div>
      </div>

      <aside className="up-next">
        <h3>Up next</h3>
        <label className="autoplay-control"><input type="checkbox" checked={autoplay} onChange={event => setAutoplay(event.target.checked)} /> Play next automatically</label>
        <div className="up-next-list">
          {upNext.map((item) => (
            <button key={item.id} className="up-next-item" onClick={() => pickEpisode(item)} type="button">
              <span className="up-next-thumb">
                <VideoThumbnail video={item} />
                <span className="duration-badge">{episodeLabel(item)}</span>
              </span>
              <span className="up-next-text">
                <span className="up-next-title">{cleanTitle(item.title)}</span>
                <span className="up-next-meta">{cleanTitle(item.collection)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}

/* ---------- home grid ---------- */

const VideoCard = React.memo(function VideoCard({ video, onPick, progressValue, favorite, onToggleFavorite, eager }) {
  const collection = video.collection || video.folderPath?.[0] || 'Main folder';
  return (
    <article className="video-card">
      <div className="thumb-wrap">
        <button className="thumbnail-button" onMouseEnter={() => warmPlayback(video)} onFocus={() => warmPlayback(video)} onClick={() => onPick(video)} type="button" aria-label={`Play ${cleanTitle(video.title)}`}>
          <VideoThumbnail video={video} eager={eager} />
          <span className="play-overlay"><PlayIcon /></span>
          <span className="duration-badge">{formatDuration(video.durationMs)}</span>
          {progressValue > 0 ? <span className="progress-bar" style={{ width: `${progressValue}%` }} /> : null}
        </button>
      </div>
      <div className="card-body">
        <Avatar name={collection} size={36} />
        <div className="card-text">
          <button className="title-button" onClick={() => onPick(video)} type="button">{cleanTitle(video.title)}</button>
          <p className="card-meta">{cleanTitle(collection)}</p>
        </div>
        <button className={`card-save ${favorite ? 'active' : ''}`} onClick={() => onToggleFavorite(video.id)} type="button"
          aria-label={`${favorite ? 'Unsave' : 'Save'} ${cleanTitle(video.title)}`} aria-pressed={favorite}><BookmarkIcon filled={favorite} /></button>
      </div>
    </article>
  );
});

function ShortsShelf({ videos, onPick }) {
  return <section className="shorts-shelf">
    <div className="shelf-heading"><h2><ShortsIcon /> Shorts</h2><button type="button" onClick={() => onPick(videos[0])}>See all <NextIcon /></button></div>
    <div className="shorts-shelf-list">{videos.slice(0, 6).map(video => <button key={video.id} className="shorts-card" type="button" onClick={() => onPick(video)} onMouseEnter={() => warmPlayback(video)} aria-label={`Watch short ${cleanTitle(video.title)}`}>
      <span className="shorts-card-image"><VideoThumbnail video={video} /><span className="duration-badge">{formatDuration(video.durationMs)}</span></span>
      <span className="shorts-card-copy"><strong>{cleanTitle(video.title)}</strong><span>{cleanTitle(video.collection)}</span></span>
    </button>)}</div>
  </section>;
}

/* ---------- sidebar ---------- */

function Sidebar({ folders, activeFolder, onNavigate, counts, mini, drawerOpen, onCloseDrawer }) {
  const mainItems = [
    { key: 'all', label: 'Home', icon: <HomeIcon /> },
    { key: 'shorts', label: 'Shorts', icon: <ShortsIcon /> },
    { key: 'continue', label: 'Continue', icon: <HistoryIcon /> },
    { key: 'favorites', label: 'Saved', icon: <BookmarkIcon /> }
  ];

  return (
    <>
      {drawerOpen ? <div className="drawer-backdrop" onClick={onCloseDrawer} /> : null}
      <aside className={`sidebar ${mini ? 'mini' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
        <nav className="sidebar-main">
          {mainItems.map((item) => (
            <button
              key={item.key}
              className={activeFolder === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(item.key)}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-count">{counts[item.key === 'all' ? 'all' : item.key]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-heading">Folders</div>
        <div className="folder-list">
          {folders.map((folder) => (
            <button
              key={folder.name}
              className={activeFolder === folder.name ? 'nav-item folder active' : 'nav-item folder'}
              onClick={() => onNavigate(folder.name)}
              type="button"
              title={folder.name}
            >
              <FolderIcon />
              <span className="nav-label">{cleanTitle(folder.name)}</span>
              <span className="nav-count">{folder.count}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

/* ---------- app ---------- */

const SORT_CHIPS = [
  { key: 'title', label: 'All' },
  { key: 'recent', label: 'Recently added' },
  { key: 'short', label: 'Shortest' },
  { key: 'long', label: 'Longest' }
];

const GRID_BATCH = 18;

function App() {
  const { videos, library, loading, error, refreshedAt, refresh } = useVideos();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeFolder, setActiveFolder] = useState('all');
  const [sortMode, setSortMode] = useState('title');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [shortStartId, setShortStartId] = useState(null);
  const [progress, setProgress] = useState(() => readJson(STORAGE_KEYS.progress, {}));
  const [favorites, setFavorites] = useState(() => readJson(STORAGE_KEYS.favorites, []));
  const [autoplay, setAutoplayState] = useState(() => readJson('kids-drive-cinema:autoplay:v1', false));
  const [sidebarMini, setSidebarMini] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(GRID_BATCH);
  const sentinelRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedVideo?.id]);

  useEffect(() => {
    setVisibleCount(GRID_BATCH);
  }, [activeFolder, query, sortMode]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => count + GRID_BATCH);
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && selectedVideo) {
        setSelectedVideo(null);
        setActiveFolder('all');
        window.history.pushState({}, '', '#home');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedVideo]);

  const folders = useMemo(() => {
    const counts = new Map();
    videos.forEach((video) => {
      const name = video.collection || video.folderPath?.[0] || 'Main folder';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [videos]);

  const counts = useMemo(() => ({
    all: videos.length,
    continue: videos.filter((video) => continueWatching(video, progress)).length,
    favorites: videos.filter(video => favorites.includes(video.id)).length,
    shorts: videos.filter(isShort).length
  }), [videos, progress, favorites]);

  const filterProgress = activeFolder === 'continue' ? progress : null;
  const filterFavorites = activeFolder === 'favorites' ? favorites : null;
  const filteredVideos = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    let list = videos;

    if (activeFolder === 'continue') {
      list = list.filter((video) => continueWatching(video, progress));
    } else if (activeFolder === 'favorites') {
      list = list.filter((video) => favorites.includes(video.id));
    } else if (activeFolder === 'shorts') {
      list = list.filter(isShort);
    } else if (activeFolder !== 'all') {
      list = list.filter((video) => (video.collection || video.folderPath?.[0] || 'Main folder') === activeFolder);
    }

    if (search) {
      list = list.filter(video => video.searchText.includes(search));
    }

    return activeFolder === 'continue' ? [...list].sort((a, b) => progress[b.id].updatedAt - progress[a.id].updatedAt) : sortVideos(list, sortMode);
  }, [videos, activeFolder, deferredQuery, sortMode, filterProgress, filterFavorites]);

  const shortVideos = useMemo(() => sortVideos(videos.filter(isShort), 'title'), [videos]);
  const featuredFolders = useMemo(() => {
    const preferred = folders.filter(folder => /^(Learn$|Alphablocks.*S01|Masha.*S01|Tom and Jerry)/i.test(cleanTitle(folder.name)));
    return (preferred.length ? preferred : folders).slice(0, 4);
  }, [folders]);

  const queue = useMemo(() => selectedVideo ? playbackQueue(selectedVideo, videos) : [], [selectedVideo, videos]);

  function setAutoplay(value) { setAutoplayState(value); writeJson('kids-drive-cinema:autoplay:v1', value); }

  const toggleFavorite = useCallback((id) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeJson(STORAGE_KEYS.favorites, next);
      return next;
    });
  }, []);

  const pickVideo = useCallback(video => {
    setSelectedVideo(video);
    window.history.pushState({ video: video.id }, '', `#watch=${encodeURIComponent(video.id)}`);
    warmPlayback(video);
  }, []);

  function pickShort(video) {
    setSelectedVideo(null);
    setActiveFolder('shorts');
    setQuery('');
    setShortStartId(video?.id || shortVideos[0]?.id);
    window.history.pushState({}, '', `#shorts=${encodeURIComponent(video?.id || shortVideos[0]?.id || '')}`);
  }

  const saveShortProgress = useCallback((video, snapshot) => {
    setProgress(current => {
      const next = { ...current, [video.id]: snapshot };
      writeJson(STORAGE_KEYS.progress, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const restoreRoute = () => {
      const [kind, encodedId = ''] = window.location.hash.slice(1).split('=');
      let id;
      try { id = decodeURIComponent(encodedId); } catch { id = ''; }
      if (kind === 'watch') setSelectedVideo(videos.find(video => video.id === id) || null);
      else {
        setSelectedVideo(null);
        if (kind === 'shorts') { setActiveFolder('shorts'); setShortStartId(id); }
        else if (kind === 'search') { setActiveFolder('all'); setQuery(id); }
        else if (kind === 'folder') setActiveFolder(videos.some(video => video.collection === id) ? id : 'all');
        else setActiveFolder(['continue', 'favorites'].includes(kind) ? kind : 'all');
      }
    };
    restoreRoute();
    window.addEventListener('popstate', restoreRoute);
    window.addEventListener('hashchange', restoreRoute);
    return () => { window.removeEventListener('popstate', restoreRoute); window.removeEventListener('hashchange', restoreRoute); };
  }, [videos]);

  function navigate(folderKey) {
    if (folderKey === 'shorts') { pickShort(); setDrawerOpen(false); return; }
    setActiveFolder(folderKey);
    setQuery('');
    setSelectedVideo(null);
    setDrawerOpen(false);
    window.history.pushState({}, '', `#${folderKey === 'all' ? 'home' : ['continue', 'favorites'].includes(folderKey) ? folderKey : `folder=${encodeURIComponent(folderKey)}`}`);
  }

  function toggleMenu() {
    if (window.innerWidth <= 980) setDrawerOpen((open) => !open);
    else setSidebarMini((mini) => !mini);
  }

  function handleSearch(value) {
    setQuery(value);
    if (selectedVideo || activeFolder === 'shorts') { setSelectedVideo(null); setActiveFolder('all'); }
    window.history.replaceState({}, '', value ? `#search=${encodeURIComponent(value)}` : '#home');
  }

  const headingLabel = activeFolder === 'all'
    ? 'Videos'
    : activeFolder === 'continue'
      ? 'Continue watching'
      : activeFolder === 'favorites'
        ? 'Saved videos'
        : activeFolder === 'shorts'
          ? 'Shorts'
          : cleanTitle(activeFolder);

  return (
    <div className={`app-shell ${activeFolder === 'shorts' && !selectedVideo ? 'in-shorts' : ''}`}>
      <header className="topbar">
        <div className="topbar-start">
          <button className="icon-btn" onClick={toggleMenu} type="button" aria-label="Toggle menu"><MenuIcon /></button>
          <button className="brand" onClick={() => navigate('all')} type="button">
            <img className="brand-mark" src={PROJECTOR_ART} alt="" />
            <span className="brand-name">{IS_MOVIE_SITE ? APP_COPY.title : <>Kids <span>Cinema</span></>}</span>
          </button>
        </div>
        <form className="search" onSubmit={(event) => event.preventDefault()} role="search">
          <input
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder={APP_COPY.search}
            aria-label="Search"
          />
          {query ? <button className="search-clear" type="button" aria-label="Clear search" onClick={() => handleSearch('')}><CloseIcon /></button> : null}
          <button className="search-btn" type="submit" aria-label="Search"><SearchIcon /></button>
        </form>
        <div className="topbar-end">
          <button className={`sync-btn ${loading ? 'is-loading' : ''}`} onClick={refresh} disabled={loading} type="button" aria-label={loading ? 'Refreshing videos' : 'Refresh videos'}>
            <SyncIcon />
            <span>{loading ? 'Refreshing' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      <Sidebar
        folders={folders}
        activeFolder={activeFolder}
        onNavigate={navigate}
        counts={counts}
        mini={sidebarMini}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />

      <main className={`content ${sidebarMini ? 'wide' : ''}`}>
        {error ? <div className="notice error" role="alert"><span>{error}</span><button type="button" className="chip-btn" onClick={refresh}>Try again</button></div> : null}
        {library.warnings?.length ? <div className="notice">{library.warnings.join(' ')}</div> : null}

        {selectedVideo ? (
          <WatchView
            key={selectedVideo.id}
            video={selectedVideo}
            queue={queue}
            progress={progress}
            setProgress={setProgress}
            onPick={pickVideo}
            onClose={() => { setSelectedVideo(null); window.history.pushState({}, '', `#${activeFolder === 'shorts' ? `shorts=${shortStartId || ''}` : 'home'}`); }}
            favorite={favorites.includes(selectedVideo.id)}
            onToggleFavorite={toggleFavorite}
            autoplay={autoplay}
            setAutoplay={setAutoplay}
          />
        ) : activeFolder === 'shorts' && videos.length ? (
          <ShortsFeed videos={shortVideos} startId={shortStartId} favorites={favorites} onSave={toggleFavorite} onOpen={pickVideo} onProgress={saveShortProgress}
            onActiveChange={id => { if (id) { setShortStartId(id); window.history.replaceState({}, '', `#shorts=${encodeURIComponent(id)}`); } }} />
        ) : (
          <>
            <nav className="folder-chips" aria-label="Quick folders">
              <button className={`chip ${activeFolder === 'all' && sortMode !== 'recent' ? 'active' : ''}`} aria-pressed={activeFolder === 'all' && sortMode !== 'recent'} onClick={() => { navigate('all'); setSortMode('title'); }} type="button">All</button>
              {featuredFolders.map(folder => <button key={folder.name} className={`chip ${activeFolder === folder.name ? 'active' : ''}`} aria-pressed={activeFolder === folder.name} onClick={() => navigate(folder.name)} type="button" title={folder.name}>{cleanTitle(folder.name)}</button>)}
              <button className={`chip ${activeFolder === 'all' && sortMode === 'recent' ? 'active' : ''}`} aria-pressed={activeFolder === 'all' && sortMode === 'recent'} onClick={() => { navigate('all'); setSortMode('recent'); }} type="button">Recently added</button>
            </nav>
            <div className="section-toolbar">
              <div><h2 className="section-title">{query ? `Results for “${query}”` : headingLabel}</h2>
                <p className="library-meta" role="status">{loading && !videos.length ? 'Loading your videos…' : `${filteredVideos.length.toLocaleString()} video${filteredVideos.length === 1 ? '' : 's'}`}
                {library.refreshing || (loading && videos.length) ? ' · Updating library…' : refreshedAt ? ' · From your Drive folder' : ''}</p>
              </div>
              <label className="sort-control">Sort by <select aria-label="Sort videos" value={sortMode} onChange={event => setSortMode(event.target.value)}>{SORT_CHIPS.map(chip => <option value={chip.key} key={chip.key}>{chip.key === 'title' ? 'Title' : chip.label}</option>)}</select></label>
            </div>

            {loading && !videos.length ? (
              <div className="loading-panel" role="status">
                <span className="loader" />
                <h3>Loading your videos</h3><p>Looking through your Drive folders. The first visit can take a moment.</p>
              </div>
            ) : !filteredVideos.length ? (
              <div className="empty-panel"><img src={PROJECTOR_ART} alt="" /><h3>{error ? 'Let’s reconnect your videos' : query ? 'No matching videos' : activeFolder === 'favorites' ? 'Your saved shelf is waiting' : activeFolder === 'continue' ? 'Ready for something new?' : 'No videos here yet'}</h3><p>{error ? 'Your library will appear once Drive is available.' : query ? 'Try another title or choose a different folder.' : activeFolder === 'favorites' ? 'Tap the bookmark beside a video to keep it here.' : activeFolder === 'continue' ? 'Videos you start watching will appear here.' : 'Refresh to check your Drive folder for videos.'}</p><button className="chip-btn" onClick={error || (!query && activeFolder === 'all') ? refresh : () => navigate('all')} type="button">{error || (!query && activeFolder === 'all') ? 'Refresh videos' : 'Browse all videos'}</button></div>
            ) : (
              <>
                <section className="video-grid">
                  {filteredVideos.slice(0, activeFolder === 'all' && !query ? 3 : visibleCount).map((video, index) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onPick={pickVideo}
                      progressValue={progressPercent(video, progress)}
                      favorite={favorites.includes(video.id)}
                      onToggleFavorite={toggleFavorite}
                      eager={index < 6}
                    />
                  ))}
                </section>
                {activeFolder === 'all' && !query && shortVideos.length ? <ShortsShelf videos={shortVideos} onPick={pickShort} /> : null}
                {activeFolder === 'all' && !query ? <section className="video-grid more-videos-grid">{filteredVideos.slice(3, visibleCount).map(video => <VideoCard key={video.id} video={video} onPick={pickVideo} progressValue={progressPercent(video, progress)} favorite={favorites.includes(video.id)} onToggleFavorite={toggleFavorite} />)}</section> : null}
                {filteredVideos.length > visibleCount ? (
                  <div ref={sentinelRef} className="grid-sentinel" aria-hidden="true" />
                ) : null}
              </>
            )}
          </>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Main navigation">
        {[{key:'all',label:'Home',icon:<HomeIcon />},{key:'shorts',label:'Shorts',icon:<ShortsIcon />},{key:'continue',label:'Continue',icon:<HistoryIcon />},{key:'favorites',label:'Saved',icon:<BookmarkIcon />}].map(item => <button key={item.key} type="button" aria-current={activeFolder === item.key ? 'page' : undefined} onClick={() => navigate(item.key)} className={activeFolder === item.key ? 'active' : ''}>{item.icon}<span>{item.label}</span></button>)}
      </nav>
    </div>
  );
}

const container = document.getElementById('root');
const root = container._reactRoot || (container._reactRoot = createRoot(container));
root.render(<App />);
