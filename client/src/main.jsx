import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEYS = {
  favorites: 'kids-drive-cinema:favorites:v2',
  progress: 'kids-drive-cinema:progress:v2'
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
      search: 'Search shows, cartoons, or folders',
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
    thumbnailUrl: apiUrl(video.thumbnailUrl),
    streamUrl: apiUrl(video.streamUrl),
    hlsUrl: apiUrl(video.hlsUrl)
  };
}

function readJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

function cleanTitle(title = '') {
  return String(title)
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(x264|x265|h264|h265|hevc|aac|webdl|webrip|bluray|hmax|galaxytv|edge2020)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || title;
}

function episodeLabel(video) {
  const title = `${video.title || ''} ${video.filename || ''}`;
  const match = title.match(/\bS(\d{1,2})E(\d{1,3})\b/i);
  if (match) return `S${match[1]} E${match[2]}`;
  if (video.durationMs) return formatDuration(video.durationMs);
  return 'Video';
}

function isShort(video) {
  return Boolean(video.durationMs && video.durationMs <= 8 * 60 * 1000);
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

  async function load(refresh = false) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/videos${refresh ? '?refresh=1' : ''}`), { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Could not load the Drive folder.');
      const nextVideos = (payload.videos || []).map(normalizeVideo);
      setVideos(nextVideos);
      setLibrary(payload.library || { collections: [], warnings: [] });
      setRefreshedAt(payload.refreshedAt || new Date().toISOString());
    } catch (err) {
      setError(err.message || 'Could not load the Drive folder.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
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
const ShortsIcon = () => (
  <Svg stroke size={22}>
    <rect x="7.2" y="3" width="9.6" height="18" rx="4.8" />
    <path d="M10.6 9.5l4.2 2.5-4.2 2.5v-5z" fill="currentColor" stroke="none" />
  </Svg>
);
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
const CloseIcon = () => <Svg size={20}><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 12 12 5.7 5.7l1.4-1.4L12 10.6l4.9-4.9 1.4 1.4z" transform="translate(0,0)" /></Svg>;
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

/* ---------- watch page ---------- */

function hasDecodedAudio(el) {
  if (typeof el.webkitAudioDecodedByteCount === 'number') return el.webkitAudioDecodedByteCount > 0;
  if (typeof el.mozHasAudio === 'boolean') return el.mozHasAudio;
  if (el.audioTracks && typeof el.audioTracks.length === 'number') return el.audioTracks.length > 0;
  return true;
}

async function waitForHlsManifest(url, signal, onTick) {
  const startedAt = Date.now();
  for (;;) {
    const response = await fetch(url, { cache: 'no-store', signal });
    if (response.status === 200) return;
    const payload = await response.json().catch(() => null);
    if (response.status === 429) {
      throw new Error(payload?.message || 'Google Drive download quota is exceeded for this file. Try again later or use Drive Preview.');
    }
    if (response.status !== 202) {
      throw new Error(payload?.message || 'Could not prepare the sound-fixed stream. Try Drive Preview.');
    }
    if (Date.now() - startedAt > 120000) {
      throw new Error('Preparing the stream is taking too long. Try again or use Drive Preview.');
    }
    onTick?.(Math.round((Date.now() - startedAt) / 1000));
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  }
}

function WatchView({ video, queue, progress, setProgress, onPick, onClose, favorite, onToggleFavorite }) {
  const videoRef = useRef(null);
  const [mode, setMode] = useState('browser');
  const [status, setStatus] = useState('');
  const [engine, setEngine] = useState('direct');
  const resumeTimeRef = useRef(0);
  const soundSwitchedRef = useRef(false);
  const silentTicksRef = useRef(0);
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
    const player = videoRef.current;
    if (!player || !video || mode !== 'browser') return undefined;

    let hls = null;
    let cancelled = false;
    const aborter = new AbortController();

    const saved = progress[video.id]?.currentTime;
    const resumeAt = resumeTimeRef.current || (saved && saved > 5 && Number.isFinite(saved) ? saved : 0);
    resumeTimeRef.current = 0;

    const restore = () => {
      if (resumeAt) player.currentTime = resumeAt;
    };

    const switchEngine = (message) => {
      if (soundSwitchedRef.current) return false;
      soundSwitchedRef.current = true;
      resumeTimeRef.current = player.currentTime || 0;
      setStatus(message);
      setEngine('hls');
      return true;
    };

    const onSilenceCheck = () => {
      if (player.paused || player.muted || player.currentTime < 2.5) return;
      if (hasDecodedAudio(player)) {
        player.removeEventListener('timeupdate', onSilenceCheck);
        return;
      }
      silentTicksRef.current += 1;
      if (silentTicksRef.current >= 2) {
        player.removeEventListener('timeupdate', onSilenceCheck);
        switchEngine('No sound in this file for browsers - switching to the sound-fixed stream...');
      }
    };

    player.volume = 1;
    player.muted = false;

    if (engine === 'direct') {
      player.src = video.streamUrl;
      player.load();
      player.addEventListener('loadedmetadata', restore, { once: true });
      player.addEventListener('timeupdate', onSilenceCheck);
      player.play().then(() => setStatus('')).catch(() => setStatus('Press play to start.'));
    } else {
      (async () => {
        try {
          setStatus('Fixing sound - preparing stream...');
          await waitForHlsManifest(video.hlsUrl, aborter.signal, (seconds) => {
            if (!cancelled) setStatus(`Fixing sound - preparing stream... ${seconds}s`);
          });
          if (cancelled) return;

          const { default: Hls } = await import('hls.js');
          if (cancelled) return;
          if (!Hls.isSupported()) {
            if (player.canPlayType('application/vnd.apple.mpegurl')) {
              player.src = video.hlsUrl;
              player.load();
              player.addEventListener('loadedmetadata', restore, { once: true });
              player.play().then(() => setStatus('')).catch(() => setStatus('Press play to start.'));
              return;
            }
            throw new Error('This browser cannot play the converted stream. Try Drive Preview.');
          }

          hls = new Hls({ maxBufferLength: 30, maxBufferSize: 40 * 1000 * 1000, backBufferLength: 30 });
          let networkRetries = 0;
          let mediaRetries = 0;
          hls.loadSource(video.hlsUrl);
          hls.attachMedia(player);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            restore();
            player.play().then(() => setStatus('')).catch(() => setStatus('Press play to start.'));
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (cancelled || !data?.fatal) return;
            if (data.type === 'networkError' && networkRetries < 3) {
              networkRetries += 1;
              setTimeout(() => { if (!cancelled) hls.startLoad(); }, 1500);
              return;
            }
            if (data.type === 'mediaError' && mediaRetries < 2) {
              mediaRetries += 1;
              hls.recoverMediaError();
              return;
            }
            hls.destroy();
            setStatus(video.drivePreviewUrl ? 'The converted stream failed. Try Drive Preview.' : 'The converted stream failed. Try again later.');
          });
        } catch (error) {
          if (cancelled || error?.name === 'AbortError') return;
          setStatus(error?.message || 'Could not prepare the sound-fixed stream.');
        }
      })();
    }

    return () => {
      cancelled = true;
      remember(true);
      aborter.abort();
      player.removeEventListener('loadedmetadata', restore);
      player.removeEventListener('timeupdate', onSilenceCheck);
      if (hls) hls.destroy();
      player.pause();
      player.removeAttribute('src');
      player.load();
    };
  }, [video, mode, engine]);

  if (!video) return null;

  function remember(force = false) {
    const player = videoRef.current;
    if (!player || mode !== 'browser') return;
    // Saving progress re-renders the page; throttle it so timeupdate
    // (4x/second) does not overwhelm low-power devices like TVs.
    const now = Date.now();
    if (!force && now - lastProgressSaveRef.current < 5000) return;
    lastProgressSaveRef.current = now;
    setProgress((current) => {
      const nextProgress = {
        ...current,
        [video.id]: {
          currentTime: player.currentTime || 0,
          duration: player.duration || video.durationMs / 1000 || 0,
          updatedAt: Date.now()
        }
      };
      writeJson(STORAGE_KEYS.progress, nextProgress);
      return nextProgress;
    });
  }

  function chooseMode(nextMode) {
    remember(true);
    setStatus('');
    setMode(nextMode);
  }

  const collection = video.collection || video.folderPath?.[0] || 'Main folder';

  return (
    <section className="watch-layout">
      <div className="watch-primary">
        <div className="player-box">
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
              playsInline
              preload="metadata"
              onTimeUpdate={() => remember()}
              onPause={() => remember(true)}
              onSeeked={() => remember(true)}
              onEnded={() => {
                remember(true);
                if (next) onPick(next);
              }}
              onError={() => {
                if (engine === 'direct' && !soundSwitchedRef.current) {
                  soundSwitchedRef.current = true;
                  resumeTimeRef.current = videoRef.current?.currentTime || 0;
                  setStatus('Direct playback failed - switching to the converted stream...');
                  setEngine('hls');
                  return;
                }
                setStatus(video.drivePreviewUrl ? 'This file could not be streamed. Try Drive Preview.' : 'This file could not be streamed right now.');
              }}
            />
          )}
        </div>

        <h1 className="watch-title">{cleanTitle(video.title)}</h1>

        <div className="watch-row">
          <div className="watch-channel">
            <Avatar name={collection} size={40} />
            <div className="channel-text">
              <span className="channel-name">{video.folderPathLabel}</span>
              <span className="channel-sub">
                {video.directPlayable ? 'Browser ready' : 'Drive preview'}
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
              <button className={mode === 'browser' ? 'active' : ''} onClick={() => chooseMode('browser')} type="button">Player</button>
              <button className={mode === 'drive' ? 'active' : ''} onClick={() => chooseMode('drive')} type="button" disabled={!video.drivePreviewUrl}>Drive</button>
            </div>
            <button className="chip-btn" onClick={() => previous && onPick(previous)} disabled={!previous} type="button"><PrevIcon /> Previous</button>
            <button className="chip-btn" onClick={() => next && onPick(next)} disabled={!next} type="button">Next <NextIcon /></button>
            {video.driveViewUrl ? <a className="chip-btn" href={video.driveViewUrl} target="_blank" rel="noreferrer"><ExternalIcon /> Drive</a> : null}
            {video.driveDownloadUrl ? <a className="chip-btn" href={video.driveDownloadUrl} target="_blank" rel="noreferrer"><DownloadIcon /> Download</a> : null}
            <button className="chip-btn" onClick={onClose} type="button"><CloseIcon /> Close</button>
          </div>
        </div>

        <div className="watch-description">
          <p className="desc-strong">
            {episodeLabel(video)}
            {video.width && video.height ? ` • ${video.width}x${video.height}` : ''}
            {video.size ? ` • ${formatSize(video.size)}` : ''}
            {engine === 'hls' && mode === 'browser' ? ' • Sound fix on' : ''}
          </p>
          <p className="desc-line">{status || 'Streaming from your approved Google Drive folder.'}</p>
        </div>
      </div>

      <aside className="up-next">
        <h3>Up next</h3>
        <div className="up-next-list">
          {upNext.map((item) => (
            <button key={item.id} className="up-next-item" onClick={() => onPick(item)} type="button">
              <span className="up-next-thumb">
                <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                <span className="duration-badge">{episodeLabel(item)}</span>
              </span>
              <span className="up-next-text">
                <span className="up-next-title">{cleanTitle(item.title)}</span>
                <span className="up-next-meta">{item.folderPathLabel}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}

/* ---------- home grid ---------- */

function VideoCard({ video, onPick, progressValue, favorite, onToggleFavorite }) {
  const collection = video.collection || video.folderPath?.[0] || 'Main folder';
  return (
    <article className="video-card">
      <div className="thumb-wrap">
        <button className="thumbnail-button" onClick={() => onPick(video)} type="button" aria-label={`Play ${video.title}`}>
          <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" />
          <span className="duration-badge">{episodeLabel(video)}</span>
          {progressValue > 0 ? <span className="progress-bar" style={{ width: `${progressValue}%` }} /> : null}
        </button>
        <button
          className={`card-save ${favorite ? 'active' : ''}`}
          onClick={() => onToggleFavorite(video.id)}
          type="button"
          title={favorite ? 'Remove from Saved' : 'Save'}
        >
          <BookmarkIcon filled={favorite} />
        </button>
      </div>
      <div className="card-body">
        <Avatar name={collection} size={36} />
        <div className="card-text">
          <button className="title-button" onClick={() => onPick(video)} type="button">{cleanTitle(video.title)}</button>
          <p className="card-meta">{collection}</p>
          <p className="card-submeta">
            {video.directPlayable ? 'Browser ready' : 'Drive preview'}
            {video.size ? ` · ${formatSize(video.size)}` : ''}
          </p>
        </div>
      </div>
    </article>
  );
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
              <Avatar name={folder.name} size={24} />
              <span className="nav-label">{folder.name}</span>
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

const GRID_BATCH = 48;

function App() {
  const { videos, library, loading, error, refreshedAt, refresh } = useVideos();
  const [query, setQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState('all');
  const [sortMode, setSortMode] = useState('title');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [progress, setProgress] = useState(() => readJson(STORAGE_KEYS.progress, {}));
  const [favorites, setFavorites] = useState(() => readJson(STORAGE_KEYS.favorites, []));
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
    }, { rootMargin: '1500px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') setSelectedVideo(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    continue: videos.filter((video) => progress[video.id]?.currentTime > 5).length,
    favorites: favorites.length,
    shorts: videos.filter(isShort).length
  }), [videos, progress, favorites]);

  const filteredVideos = useMemo(() => {
    const search = query.trim().toLowerCase();
    let list = videos;

    if (activeFolder === 'continue') {
      list = list.filter((video) => progress[video.id]?.currentTime > 5);
    } else if (activeFolder === 'favorites') {
      list = list.filter((video) => favorites.includes(video.id));
    } else if (activeFolder === 'shorts') {
      list = list.filter(isShort);
    } else if (activeFolder !== 'all') {
      list = list.filter((video) => (video.collection || video.folderPath?.[0] || 'Main folder') === activeFolder);
    }

    if (search) {
      list = list.filter((video) => [
        video.title,
        cleanTitle(video.title),
        video.filename,
        video.collection,
        video.folderPathLabel
      ].filter(Boolean).join(' ').toLowerCase().includes(search));
    }

    return sortVideos(list, sortMode);
  }, [videos, activeFolder, query, sortMode, progress, favorites]);

  const queue = filteredVideos.length ? filteredVideos : videos;

  function toggleFavorite(id) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeJson(STORAGE_KEYS.favorites, next);
      return next;
    });
  }

  function navigate(folderKey) {
    setActiveFolder(folderKey);
    setSelectedVideo(null);
    setDrawerOpen(false);
  }

  function toggleMenu() {
    if (window.innerWidth <= 980) setDrawerOpen((open) => !open);
    else setSidebarMini((mini) => !mini);
  }

  function handleSearch(value) {
    setQuery(value);
    if (selectedVideo) setSelectedVideo(null);
  }

  const headingLabel = activeFolder === 'all'
    ? 'All folders'
    : activeFolder === 'continue'
      ? 'Continue watching'
      : activeFolder === 'favorites'
        ? 'Saved videos'
        : activeFolder === 'shorts'
          ? 'Shorts'
          : activeFolder;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-start">
          <button className="icon-btn" onClick={toggleMenu} type="button" aria-label="Toggle menu"><MenuIcon /></button>
          <button className="brand" onClick={() => navigate('all')} type="button">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">{APP_COPY.title}</span>
          </button>
        </div>
        <form className="search" onSubmit={(event) => event.preventDefault()} role="search">
          <input
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder={APP_COPY.search}
            aria-label="Search"
          />
          <button className="search-btn" type="submit" aria-label="Search"><SearchIcon /></button>
        </form>
        <div className="topbar-end">
          <button className="sync-btn" onClick={refresh} disabled={loading} type="button">
            <SyncIcon />
            <span>{loading ? 'Syncing' : 'Sync'}</span>
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
        {error ? <div className="notice error">{error}</div> : null}
        {library.warnings?.length ? <div className="notice">{library.warnings.join(' ')}</div> : null}

        {selectedVideo ? (
          <WatchView
            key={selectedVideo.id}
            video={selectedVideo}
            queue={queue}
            progress={progress}
            setProgress={setProgress}
            onPick={setSelectedVideo}
            onClose={() => setSelectedVideo(null)}
            favorite={favorites.includes(selectedVideo.id)}
            onToggleFavorite={toggleFavorite}
          />
        ) : (
          <>
            <div className="chips-row" role="tablist" aria-label="Sort videos">
              {SORT_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  className={sortMode === chip.key ? 'chip active' : 'chip'}
                  onClick={() => setSortMode(chip.key)}
                  type="button"
                >
                  {chip.label}
                </button>
              ))}
              <span className="chips-meta">
                {filteredVideos.length ? `${filteredVideos.length} videos` : APP_COPY.empty}
                {refreshedAt ? ` · synced ${new Date(refreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
              </span>
            </div>

            <h2 className="section-title">{headingLabel}</h2>

            {loading && !videos.length ? (
              <div className="loading-panel">
                <span className="loader" />
                <p>Loading Drive folder...</p>
              </div>
            ) : (
              <>
                <section className="video-grid">
                  {filteredVideos.slice(0, visibleCount).map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onPick={setSelectedVideo}
                      progressValue={progressPercent(video, progress)}
                      favorite={favorites.includes(video.id)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </section>
                {filteredVideos.length > visibleCount ? (
                  <div ref={sentinelRef} className="grid-sentinel" aria-hidden="true" />
                ) : null}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const container = document.getElementById('root');
const root = container._reactRoot || (container._reactRoot = createRoot(container));
root.render(<App />);
