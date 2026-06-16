import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Hls from 'hls.js';
import './styles.css';

const STORAGE_KEYS = {
  favorites: 'kids-drive-cinema:favorites',
  progress: 'kids-drive-cinema:progress',
  parentUnlocked: 'kids-drive-cinema:parent-unlocked'
};

const IS_MOVIE_SITE = typeof window !== 'undefined' && window.location.hostname.includes('drive-movies-cinema');
const API_ORIGIN = IS_MOVIE_SITE ? 'https://kids-drive-cinema.onrender.com' : '';
const API_LIBRARY = IS_MOVIE_SITE ? 'movie' : 'kids';
const APP_COPY = IS_MOVIE_SITE
  ? {
      title: 'Drive Movies',
      subtitle: 'Private cinema',
      homeLabel: 'Drive Movies home',
      searchPlaceholder: 'Search movies, collections, or folders...',
      emptyTitle: 'No movies found'
    }
  : {
      title: 'Kids Cinema',
      subtitle: 'Safe Drive Player',
      homeLabel: 'Kids Cinema home',
      searchPlaceholder: 'Search cartoons, shows, or folders...',
      emptyTitle: 'No videos found'
    };

function apiUrl(path) {
  const url = new URL(path, API_ORIGIN || window.location.origin);
  if (url.pathname.startsWith('/api/') && !url.searchParams.has('library')) {
    url.searchParams.set('library', API_LIBRARY);
  }
  return API_ORIGIN ? url.href : `${url.pathname}${url.search}${url.hash}`;
}

const hlsPrewarmAttempts = new Map();
const HLS_PREWARM_RETRY_MS = 60 * 1000;
const HLS_PREWARM_MAX_BYTES = 1200 * 1024 * 1024;
const ENABLE_HLS_PREWARM = false;

function prewarmUrlFor(video) {
  if (!video?.hlsUrl || video.directPlayable) return null;
  if (!video.size || video.size > HLS_PREWARM_MAX_BYTES) return null;
  const url = new URL(video.hlsUrl, window.location.origin);
  url.pathname = url.pathname.replace(/\/master\.m3u8$/, '/prewarm');
  return API_ORIGIN ? url.href : `${url.pathname}${url.search}${url.hash}`;
}

function uniqueHlsVideos(videos, limit = 4) {
  const seen = new Set();
  const now = Date.now();
  return videos
    .filter(Boolean)
    .filter((video) => video.hlsUrl && !video.directPlayable)
    .filter((video) => video.size && video.size <= HLS_PREWARM_MAX_BYTES)
    .filter((video) => {
      if (seen.has(video.id)) return false;
      seen.add(video.id);
      const lastAttempt = hlsPrewarmAttempts.get(video.id) || 0;
      return now - lastAttempt > HLS_PREWARM_RETRY_MS;
    })
    .slice(0, limit);
}

function useHlsPrewarm(candidates, limit = 4) {
  const ids = candidates.map((video) => video?.id).filter(Boolean).join('|');

  useEffect(() => {
    if (!ENABLE_HLS_PREWARM) return undefined;
    const videos = uniqueHlsVideos(candidates, limit);
    if (!videos.length) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    async function runPrewarmQueue() {
      for (const video of videos) {
        if (cancelled) break;
        const url = prewarmUrlFor(video);
        if (!url) continue;

        hlsPrewarmAttempts.set(video.id, Date.now());
        try {
          const response = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            cache: 'no-store'
          });
          if (response.status === 202) {
            const payload = await response.json().catch(() => ({}));
            if (payload.status === 'busy') {
              hlsPrewarmAttempts.delete(video.id);
              break;
            }
          }
        } catch {
          if (!cancelled) hlsPrewarmAttempts.delete(video.id);
        }
      }
    }

    runPrewarmQueue();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ids, limit]);
}

function normalizeApiVideo(video) {
  return {
    ...video,
    thumbnailUrl: apiUrl(video.thumbnailUrl),
    streamUrl: apiUrl(video.streamUrl),
    hlsUrl: video.hlsUrl ? apiUrl(video.hlsUrl) : video.hlsUrl
  };
}

function getJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDuration(ms) {
  if (!ms) return 'Movie';
  const totalSeconds = Math.round(ms / 1000);
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

function getProgressPercent(video, progress) {
  const item = progress[video.id];
  if (!item || !item.currentTime) return 0;
  const durationSeconds = video.durationMs ? video.durationMs / 1000 : item.duration;
  if (!durationSeconds || !Number.isFinite(durationSeconds)) {
    return item.currentTime > 5 ? 10 : 0;
  }
  return Math.min(98, Math.max(0, (item.currentTime / durationSeconds) * 100));
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getEpisodeLabel(title) {
  const seasonEpisode = title.match(/S(\d{1,2})E(\d{1,3})/i);
  if (seasonEpisode) return `S${seasonEpisode[1]} E${seasonEpisode[2]}`;
  const episode = title.match(/\b(?:episode|ep)\s*(\d{1,3})\b/i);
  if (episode) return `EP ${episode[1]}`;
  return 'Movie';
}

function getThumbnailStyle(video) {
  const hash = hashString(`${video.id}:${video.title}`);
  const hue = hash % 360;
  const secondHue = (hue + 42 + (hash % 64)) % 360;
  const x = 42 + (hash % 17);
  const y = 42 + ((hash >> 5) % 17);

  return {
    '--thumb-accent': `hsl(${hue} 82% 56%)`,
    '--thumb-accent-2': `hsl(${secondHue} 82% 60%)`,
    '--thumb-x': `${x}%`,
    '--thumb-y': `${y}%`
  };
}

function getShuffleRank(video) {
  return hashString(`${video.id}:${video.title}:${video.folderPathLabel}`);
}

function getPlaybackSource(video) {
  if (!video.directPlayable) {
    return {
      src: video.hlsUrl,
      mode: 'HLS audio-compatible stream',
      type: 'application/vnd.apple.mpegurl',
      hls: true
    };
  }

  return {
    src: video.streamUrl,
    mode: 'Direct browser playback',
    type: video.mimeType || 'video/mp4'
  };
}

function getFolderEpisodeQueue(currentVideo, videos) {
  if (!currentVideo) return [];
  return videos
    .filter((video) => video.folderPathLabel === currentVideo.folderPathLabel)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}

function getRecommendedQueue(currentVideo, videos) {
  const folderQueue = getFolderEpisodeQueue(currentVideo, videos);
  const currentIndex = folderQueue.findIndex((video) => video.id === currentVideo?.id);
  if (currentIndex < 0) return folderQueue.filter((video) => video.id !== currentVideo?.id);
  return [
    ...folderQueue.slice(currentIndex + 1),
    ...folderQueue.slice(0, currentIndex)
  ];
}

function getAdjacentFolderVideos(currentVideo, videos) {
  const folderQueue = getFolderEpisodeQueue(currentVideo, videos);
  if (!currentVideo || folderQueue.length <= 1) {
    return { previousVideo: null, nextVideo: null };
  }

  const currentIndex = folderQueue.findIndex((video) => video.id === currentVideo.id);
  if (currentIndex < 0) {
    return { previousVideo: null, nextVideo: folderQueue[0] || null };
  }

  return {
    previousVideo: folderQueue[(currentIndex - 1 + folderQueue.length) % folderQueue.length],
    nextVideo: folderQueue[(currentIndex + 1) % folderQueue.length]
  };
}

function useVideos() {
  const [videos, setVideos] = useState([]);
  const [library, setLibrary] = useState({ collections: [], warnings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);

  async function load({ refresh = false } = {}) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/videos${refresh ? '?refresh=1' : ''}`));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Could not load videos.');
      setVideos((payload.videos || []).map(normalizeApiVideo));
      setLibrary(payload.library || { collections: [], warnings: [] });
      setRefreshedAt(payload.refreshedAt);
    } catch (err) {
      setError(err.message || 'Could not load videos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { videos, library, loading, error, refreshedAt, reload: load };
}

function Header({ search, setSearch, parentUnlocked, setParentUnlocked, onRefresh, loading, onHome }) {
  const [pin, setPin] = useState('');
  const expectedPin = import.meta.env.VITE_PARENT_PIN || '2468';

  function unlockParentMode(event) {
    event.preventDefault();
    if (pin === expectedPin) {
      setParentUnlocked(true);
      localStorage.setItem(STORAGE_KEYS.parentUnlocked, 'yes');
      setPin('');
    } else {
      setPin('');
      alert('Oops! Parent PIN did not match.');
    }
  }

  return (
    <header className="topbar">
      <a
        className="brand"
        href="#top"
        aria-label={APP_COPY.homeLabel}
        onClick={(event) => {
          event.preventDefault();
          onHome();
        }}
      >
        <span className="brand-logo" />
        <span>
          <strong>{APP_COPY.title}</strong>
          <small>{APP_COPY.subtitle}</small>
        </span>
      </a>

      <div className="search-container">
        <label className="searchbox">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={APP_COPY.searchPlaceholder}
            aria-label="Search movies"
          />
        </label>
        <button className="search-button" aria-label="Search button">🔍</button>
      </div>

      <div className="header-actions">
        <button
          className="pill-btn sync-btn"
          onClick={() => onRefresh({ refresh: true })}
          disabled={loading}
          type="button"
        >
          {loading ? 'Syncing' : 'Sync'}
        </button>
        {parentUnlocked ? (
          <button
            className="pill-btn"
            onClick={() => {
              setParentUnlocked(false);
              localStorage.removeItem(STORAGE_KEYS.parentUnlocked);
            }}
          >
            🔒 Lock Parent
          </button>
        ) : (
          <form className="pin-form" onSubmit={unlockParentMode}>
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="PIN"
              inputMode="numeric"
              aria-label="Parent PIN"
            />
            <button className="pill-btn" type="submit">Parent</button>
          </form>
        )}
      </div>
    </header>
  );
}

function Sidebar({ filter, setFilter, collection, setCollection, collectionOptions, counts }) {
  const mainFilters = [
    { key: 'all', label: 'Home', icon: '🏠' },
    { key: 'continue', label: 'History', icon: '⏳' },
    { key: 'favorites', label: 'Liked Videos', icon: '👍' },
    { key: 'short', label: 'Shorts', icon: '⚡' },
    { key: 'hd', label: 'HD Shows', icon: '✨' }
  ];

  return (
    <aside className="sidebar">
      {mainFilters.map((item) => {
        const countValue = counts[item.key] || 0;
        const isActive = item.key === 'all'
          ? filter === 'all' && collection === 'all'
          : filter === item.key;
        return (
          <button
            key={item.key}
            className={`sidebar-item ${isActive ? 'active' : ''}`}
            onClick={() => {
              setFilter(item.key);
              setCollection('all'); // Reset collection subfilter on main filter change
            }}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label} {countValue > 0 && `(${countValue})`}</span>
          </button>
        );
      })}

      {collectionOptions.length > 1 && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-section-title">Subscriptions</div>
          {collectionOptions.map((opt) => {
            const isCollActive = collection === opt.key;
            const labelInit = opt.label.charAt(0);
            return (
              <button
                key={opt.key}
                className={`sidebar-item ${isCollActive ? 'active' : ''}`}
                onClick={() => {
                  setCollection(opt.key);
                  setFilter('all'); // Reset filter back to all when exploring a specific folder/show
                }}
                title={opt.label}
              >
                <span className="icon">📁</span>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </>
      )}
    </aside>
  );
}

function Hero({ featured, onPlay, total }) {
  if (!featured) return null;

  return (
    <section className="hero" id="top">
      <div className="hero-poster" onClick={() => onPlay(featured)}>
        <img src={featured.thumbnailUrl} alt={featured.title} />
        <span className="big-play">▶</span>
      </div>
      <div className="hero-copy">
        <div className="eyebrow">🔥 Recommended for You</div>
        <h1>{featured.title}</h1>
        <p>
          {featured.folderPathLabel ? `From Collection: ${featured.folderPathLabel}` : 'Private cinema video from your shared Google Drive folder.'}
        </p>
        <div className="hero-stats" aria-label="Featured video details">
          <span>{total} videos ready</span>
          <span>{featured.isHd ? 'HD available' : 'Standard quality'}</span>
          {featured.size ? <span>{formatSize(featured.size)}</span> : null}
        </div>
        <div className="hero-actions">
          <button className="pill-btn primary" onClick={() => onPlay(featured)}>▶ Play Video</button>
          {featured.durationMs ? <span className="pill-btn">⏱ {formatDuration(featured.durationMs)}</span> : null}
          {featured.isHd ? <span className="pill-btn">✨ HD</span> : null}
        </div>
      </div>
    </section>
  );
}

function LibraryToolbar({
  filter,
  setFilter,
  collection,
  setCollection,
  collectionOptions,
  qualityFilter,
  setQualityFilter,
  durationFilter,
  setDurationFilter,
  sortBy,
  setSortBy,
  counts,
  visibleCount,
  search,
  setSearch
}) {
  const quickFilters = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'continue', label: 'Continue', count: counts.continue },
    { key: 'favorites', label: 'Favorites', count: counts.favorites },
    { key: 'short', label: 'Shorts', count: counts.short },
    { key: 'hd', label: 'HD', count: counts.hd }
  ];
  const activeCollection = collectionOptions.find((item) => item.key === collection)?.label || 'All Playlists';
  const hasSearch = search.trim().length > 0;
  const hasExtraFilters = qualityFilter !== 'all' || durationFilter !== 'all' || sortBy !== 'title';

  function clearFilters() {
    setSearch('');
    setFilter('all');
    setCollection('all');
    setQualityFilter('all');
    setDurationFilter('all');
    setSortBy('title');
  }

  return (
    <section className="library-toolbar" aria-label="Library controls">
      <div className="library-heading">
        <div>
          <p className="section-kicker">Now playing from Drive</p>
          <h2>{activeCollection}</h2>
        </div>
        <span className="result-count">
          {visibleCount} {visibleCount === 1 ? 'video' : 'videos'}{hasSearch ? ' found' : ''}
        </span>
      </div>

      <div className="filter-controls" aria-label="Detailed filters">
        <label className="filter-control">
          <span>Playlist</span>
          <select
            value={collection}
            onChange={(event) => {
              setCollection(event.target.value);
              setFilter('all');
            }}
          >
            {collectionOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} ({item.count})
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span>Quality</span>
          <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}>
            <option value="all">Any quality</option>
            <option value="hd">HD only</option>
            <option value="sd">SD only</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Length</span>
          <select value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)}>
            <option value="all">Any length</option>
            <option value="short">Under 20 min</option>
            <option value="medium">20-45 min</option>
            <option value="long">Over 45 min</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Sort</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="title">Title A-Z</option>
            <option value="newest">Newest first</option>
            <option value="longest">Longest first</option>
            <option value="shortest">Shortest first</option>
            <option value="largest">Largest file</option>
          </select>
        </label>

        {(hasSearch || filter !== 'all' || collection !== 'all' || hasExtraFilters) ? (
          <button className="clear-filters" type="button" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="quick-filter-row" role="list" aria-label="Video filters">
        {quickFilters.map((item) => (
          <button
            key={item.key}
            className={`quick-filter ${filter === item.key ? 'active' : ''}`}
            onClick={() => setFilter(item.key)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.count || 0}</small>
          </button>
        ))}
      </div>

      {collectionOptions.length > 1 ? (
        <div className="collection-rail" aria-label="Collections">
          {collectionOptions.map((item) => (
            <button
              key={item.key}
              className={`collection-chip ${collection === item.key ? 'active' : ''}`}
              onClick={() => {
                setCollection(item.key);
                setFilter('all');
              }}
              type="button"
              title={item.label}
            >
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function VideoCard({ video, onPlay, favorite, onToggleFavorite, progress }) {
  const progressPercent = getProgressPercent(video, progress);
  const channelLetter = (video.collection || 'Main').charAt(0);
  const episodeLabel = getEpisodeLabel(video.title);
  const thumbnailStyle = getThumbnailStyle(video);

  return (
    <article className="video-card">
      <button
        className="thumbnail"
        onClick={() => onPlay(video)}
        aria-label={`Play ${video.title}`}
        style={thumbnailStyle}
      >
        <img src={video.thumbnailUrl} alt="" loading="lazy" />
        <span className="thumbnail-vignette" aria-hidden="true" />
        <span className="episode-chip">{episodeLabel}</span>
        <span className="duration-chip">{formatDuration(video.durationMs)}</span>
        {progressPercent > 2 ? <span className="progress-line" style={{ width: `${progressPercent}%` }} /> : null}
      </button>
      <div className="card-body">
        <div className="channel-avatar" title={video.collection}>
          {channelLetter}
        </div>
        <div className="video-info">
          <h3>{video.title}</h3>
          <div className="video-metadata-row">
            <div className="video-stats">
              <span>{video.isHd ? '1080p HD' : 'SD'}</span>
              {video.size ? <span>• {formatSize(video.size)}</span> : null}
            </div>
          </div>
        </div>
        <div className="favorite-btn-container">
          <button
            className={`favorite ${favorite ? 'on' : ''}`}
            aria-label={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            onClick={() => onToggleFavorite(video.id)}
          >
            ★
          </button>
        </div>
      </div>
    </article>
  );
}

function VideoGrid({ videos, onPlay, favorites, onToggleFavorite, progress }) {
  if (!videos.length) {
    return (
      <div className="empty-state">
        <span>🧸</span>
        <h2>{APP_COPY.emptyTitle}</h2>
        <p>Try matching another keyword, selecting another playlist sidebar item, or sync your Google Drive.</p>
      </div>
    );
  }

  return (
    <section className="grid" aria-label="Videos list">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          onPlay={onPlay}
          favorite={favorites.includes(video.id)}
          onToggleFavorite={onToggleFavorite}
          progress={progress}
        />
      ))}
    </section>
  );
}

function WatchPlayer({
  video,
  onClose,
  onEnded,
  onPrevious,
  onNext,
  previousVideo,
  nextVideo,
  progress,
  setProgress
}) {
  const playerRef = useRef(null);
  const shellRef = useRef(null);
  const hlsRef = useRef(null);
  const playback = useMemo(() => (video ? getPlaybackSource(video) : null), [video]);
  const [playbackStatus, setPlaybackStatus] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drivePreviewMode, setDrivePreviewMode] = useState(false);
  const showDrivePreview = Boolean(playbackStatus && video?.drivePreviewUrl);

  function tryStartPlayback() {
    const player = playerRef.current;
    if (!player) return;

    player.muted = false;
    player.volume = 1;

    player.play().then(() => {
      setPlaybackStatus('');
    }).catch(() => {
      setPlaybackStatus('Use the video play button to start with audio.');
    });
  }

  function closePlayer() {
    const player = playerRef.current;
    if (player) {
      player.pause();
    }
    setIsFullscreen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
      window.setTimeout(() => tryStartPlayback(), 80);
      return;
    }

    setIsFullscreen((current) => !current);

    if (!isFullscreen && shell.requestFullscreen) {
      await shell.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }

    window.setTimeout(() => tryStartPlayback(), 80);
  }

  function openDrivePreview() {
    const player = playerRef.current;
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setDrivePreviewMode(true);
    setPlaybackStatus('Playing with Google Drive preview.');
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      closePlayer();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, onClose]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    setDrivePreviewMode(false);
    if (!player || !video || !playback) return undefined;

    setPlaybackStatus('');
    hlsRef.current?.destroy();
    hlsRef.current = null;

    player.muted = false;
    player.volume = 1;

    if (playback.hls && Hls.isSupported()) {
      let retryTimeout = null;
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false
      });
      hlsRef.current = hls;
      hls.loadSource(playback.src);
      hls.attachMedia(player);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlaybackStatus('');
        tryStartPlayback();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const responseCode = data?.response?.code || data?.networkDetails?.status || 0;
        if (responseCode === 403 || responseCode === 429) {
          setPlaybackStatus('Google Drive download quota is exceeded for this video. Try again later.');
          return;
        }

        if (
          (data?.type === Hls.ErrorTypes.NETWORK_ERROR && data?.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) ||
          data?.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
        ) {
          setPlaybackStatus('Preparing audio-compatible stream...');
          window.clearTimeout(retryTimeout);
          retryTimeout = window.setTimeout(() => {
            hls.loadSource(playback.src);
          }, 2500);
          return;
        }

        if (data?.fatal) {
          setPlaybackStatus('Reconnecting stream...');
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            window.clearTimeout(retryTimeout);
            retryTimeout = window.setTimeout(() => {
              hls.loadSource(playback.src);
            }, 2500);
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          setPlaybackStatus('Preparing audio-compatible stream...');
        }
      });
      return () => {
        window.clearTimeout(retryTimeout);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    player.src = playback.src;
    player.load();
    tryStartPlayback();
    return () => {
      player.removeAttribute('src');
      player.load();
    };
  }, [video, playback]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !video) return undefined;
    const saved = progress[video.id]?.currentTime;
    if (!saved || saved <= 5) return undefined;

    function restoreProgress() {
      player.currentTime = saved;
    }
    player.addEventListener('loadedmetadata', restoreProgress, { once: true });
    return () => player.removeEventListener('loadedmetadata', restoreProgress);
  }, [video, progress]);

  if (!video) return null;

  function rememberProgress() {
    const player = playerRef.current;
    if (!player) return;
    setProgress((current) => {
      const next = {
        ...current,
        [video.id]: {
          currentTime: player.currentTime,
          duration: player.duration || video.durationMs / 1000 || 0,
          updatedAt: Date.now()
        }
      };
      setJson(STORAGE_KEYS.progress, next);
      return next;
    });
  }

  return (
    <section className="watch-player" aria-label={`Playing ${video.title}`}>
      <div ref={shellRef} className={`player-shell ${isFullscreen ? 'fullscreen-mode' : ''}`}>
        <div className="player-topline">
          <h2>{video.title} <span>({video.folderPathLabel})</span></h2>
          <button className="close" onClick={closePlayer} aria-label="Close player">
            <span aria-hidden="true">×</span>
            <span className="close-label">Close</span>
          </button>
        </div>
        <div className="player-video-wrap">
          {drivePreviewMode && video.drivePreviewUrl ? (
            <div className="drive-preview-shell">
              <div className="drive-preview-toolbar">
                <span>Google Drive preview</span>
                <div>
                  {video.driveViewUrl ? (
                    <a href={video.driveViewUrl} target="_blank" rel="noreferrer">Open in Drive</a>
                  ) : null}
                  {video.driveDownloadUrl ? (
                    <a href={video.driveDownloadUrl} target="_blank" rel="noreferrer">Download</a>
                  ) : null}
                </div>
              </div>
              <iframe
                className="drive-preview-frame"
                src={video.drivePreviewUrl}
                title={`Google Drive preview for ${video.title}`}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          ) : (
            <video
              ref={playerRef}
              poster={video.thumbnailUrl}
              controls
              autoPlay
              preload="metadata"
              playsInline
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onPlay={() => setPlaybackStatus('')}
              onError={() => {
                if (!playback?.hls) {
                  setPlaybackStatus('Google Drive could not stream this video right now. It may be quota-limited; try again later.');
                }
              }}
              onVolumeChange={(event) => {
                if (!event.currentTarget.muted) setPlaybackStatus('');
              }}
              onTimeUpdate={rememberProgress}
              onPause={rememberProgress}
              onEnded={() => {
                rememberProgress();
                onEnded(video.id);
              }}
            />
          )}
          {isFullscreen ? (
            <button className="fullscreen-exit-btn" onClick={toggleFullscreen} type="button">
              Exit
            </button>
          ) : null}
        </div>
        <div className="player-footer">
          <span>
            🛡 Google Drive Approved Folder Stream · {playback.mode}
            {playbackStatus ? ` · ${playbackStatus}` : ''}
          </span>
          <div className="player-footer-actions">
            {showDrivePreview ? (
              <button
                className="player-close-btn drive-preview-link"
                onClick={openDrivePreview}
                type="button"
              >
                Open Here
              </button>
            ) : null}
            <button className="player-close-btn" onClick={toggleFullscreen} type="button">
              {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
            <button
              className="player-close-btn"
              onClick={onPrevious}
              type="button"
              disabled={!previousVideo}
              title={previousVideo ? previousVideo.title : 'No previous video'}
            >
              Previous
            </button>
            <button
              className="player-close-btn"
              onClick={onNext}
              type="button"
              disabled={!nextVideo}
              title={nextVideo ? nextVideo.title : 'No next video'}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function WatchPage({
  video,
  recommendations,
  previousVideo,
  nextVideo,
  onBack,
  onHome,
  collection,
  collectionOptions,
  onSelectCollection,
  onSelectVideo,
  onEnded,
  onPrevious,
  onNext,
  progress,
  setProgress,
  favorites,
  onToggleFavorite
}) {
  return (
    <section className="watch-page">
      <nav className="watch-nav" aria-label="Watch page navigation">
        <button className="watch-home-btn" type="button" onClick={onHome}>
          Home
        </button>
        <label className="watch-folder-picker">
          <span>Folders</span>
          <select
            value={collection}
            onChange={(event) => onSelectCollection(event.target.value)}
          >
            {collectionOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} ({item.count})
              </option>
            ))}
          </select>
        </label>
      </nav>

      <WatchPlayer
        video={video}
        onClose={onBack}
        onEnded={onEnded}
        onPrevious={onPrevious}
        onNext={onNext}
        previousVideo={previousVideo}
        nextVideo={nextVideo}
        progress={progress}
        setProgress={setProgress}
      />

      <section className="watch-recommendations" aria-label="Recommended videos">
        <div className="watch-heading">
          <div>
            <p className="section-kicker">Up next from this folder</p>
            <h2>Recommended videos</h2>
          </div>
          <span>{recommendations.length} queued</span>
        </div>
        {recommendations.length ? (
          <VideoGrid
            videos={recommendations}
            onPlay={onSelectVideo}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            progress={progress}
          />
        ) : (
          <div className="empty-state">
            <h2>No more videos in this folder</h2>
            <p>Go back to the library to pick another collection.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function ParentPanel({ reload, refreshedAt, videos, library }) {
  return (
    <aside className="parent-panel">
      <div>
        <h2>🧑‍🚀 Parent Control Center</h2>
        <p>
          Need to sync new videos added to your Drive folder? Perform a refresh scan below.
        </p>
        {library.warnings?.length ? (
          <div className="warning-list">
            {library.warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)}
          </div>
        ) : null}
      </div>
      <div className="panel-actions">
        <button className="pill-btn primary" onClick={() => reload({ refresh: true })}>Refresh Scan</button>
        <span>{videos.length} Files Found</span>
        <span>{library.folderCount || 0} Folders Scanned</span>
        {refreshedAt ? <span>Last sync: {new Date(refreshedAt).toLocaleTimeString()}</span> : null}
      </div>
    </aside>
  );
}

function App() {
  const { videos, library, loading, error, refreshedAt, reload } = useVideos();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [collection, setCollection] = useState('all');
  const [qualityFilter, setQualityFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');
  const [sortBy, setSortBy] = useState('title');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [favorites, setFavorites] = useState(() => getJson(STORAGE_KEYS.favorites, []));
  const [progress, setProgress] = useState(() => getJson(STORAGE_KEYS.progress, {}));
  const [parentUnlocked, setParentUnlocked] = useState(() => localStorage.getItem(STORAGE_KEYS.parentUnlocked) === 'yes');

  useEffect(() => {
    document.title = IS_MOVIE_SITE ? 'Drive Movies Cinema' : 'Kids Drive Cinema';
  }, []);

  const collectionOptions = useMemo(() => {
    const counts = new Map();
    for (const video of videos) {
      counts.set(video.collection, (counts.get(video.collection) || 0) + 1);
    }
    const folders = [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(([key, count]) => ({ key, label: key, count }));

    return [{ key: 'all', label: 'All Playlists', count: videos.length }, ...folders];
  }, [videos]);

  useEffect(() => {
    if (collection !== 'all' && !collectionOptions.some((option) => option.key === collection)) {
      setCollection('all');
    }
  }, [collection, collectionOptions]);

  const scopedVideos = useMemo(() => {
    if (collection === 'all') return videos;
    return videos.filter((video) => video.collection === collection);
  }, [videos, collection]);

  const featured = useMemo(() => {
    if (!scopedVideos.length) return null;
    const continueWatching = scopedVideos.find((video) => getProgressPercent(video, progress) > 5);
    return continueWatching || scopedVideos[0];
  }, [scopedVideos, progress]);

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedVideos
      .filter((video) => !q ||
        video.title.toLowerCase().includes(q) ||
        video.filename.toLowerCase().includes(q) ||
        video.folderPathLabel.toLowerCase().includes(q)
      )
      .filter((video) => {
        if (filter === 'favorites') return favorites.includes(video.id);
        if (filter === 'continue') return getProgressPercent(video, progress) > 5;
        if (filter === 'short') return video.durationMs && video.durationMs <= 20 * 60 * 1000;
        if (filter === 'hd') return video.isHd;
        return true;
      })
      .filter((video) => {
        if (qualityFilter === 'hd') return video.isHd;
        if (qualityFilter === 'sd') return !video.isHd;
        return true;
      })
      .filter((video) => {
        if (durationFilter === 'short') return video.durationMs && video.durationMs < 20 * 60 * 1000;
        if (durationFilter === 'medium') return video.durationMs && video.durationMs >= 20 * 60 * 1000 && video.durationMs <= 45 * 60 * 1000;
        if (durationFilter === 'long') return video.durationMs && video.durationMs > 45 * 60 * 1000;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.modifiedTime || b.createdTime || 0) - new Date(a.modifiedTime || a.createdTime || 0);
        }
        if (sortBy === 'longest') return (b.durationMs || 0) - (a.durationMs || 0);
        if (sortBy === 'shortest') return (a.durationMs || Number.MAX_SAFE_INTEGER) - (b.durationMs || Number.MAX_SAFE_INTEGER);
        if (sortBy === 'largest') return (b.size || 0) - (a.size || 0);
        if (collection === 'all') {
          return getShuffleRank(a) - getShuffleRank(b);
        }
        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [scopedVideos, search, filter, qualityFilter, durationFilter, sortBy, collection, favorites, progress]);

  const counts = useMemo(() => ({
    all: scopedVideos.length,
    favorites: scopedVideos.filter((video) => favorites.includes(video.id)).length,
    continue: scopedVideos.filter((video) => getProgressPercent(video, progress) > 5).length,
    short: scopedVideos.filter((video) => video.durationMs && video.durationMs <= 20 * 60 * 1000).length,
    hd: scopedVideos.filter((video) => video.isHd).length
  }), [scopedVideos, favorites, progress]);

  const sidebarCounts = useMemo(() => ({
    all: videos.length,
    favorites: videos.filter((video) => favorites.includes(video.id)).length,
    continue: videos.filter((video) => getProgressPercent(video, progress) > 5).length,
    short: videos.filter((video) => video.durationMs && video.durationMs <= 20 * 60 * 1000).length,
    hd: videos.filter((video) => video.isHd).length
  }), [videos, favorites, progress]);

  const recommendedVideos = useMemo(
    () => getRecommendedQueue(selectedVideo, videos),
    [selectedVideo, videos]
  );

  const watchNavigation = useMemo(
    () => getAdjacentFolderVideos(selectedVideo, videos),
    [selectedVideo, videos]
  );

  const hlsPrewarmCandidates = useMemo(() => {
    if (selectedVideo) {
      return [
        selectedVideo,
        watchNavigation.nextVideo,
        watchNavigation.previousVideo,
        ...recommendedVideos.slice(0, 3)
      ];
    }

    return [
      featured,
      ...filteredVideos.slice(0, 5)
    ];
  }, [selectedVideo, watchNavigation, recommendedVideos, featured, filteredVideos]);

  useHlsPrewarm(hlsPrewarmCandidates, selectedVideo ? 4 : 3);

  function leaveWatchPage() {
    setSelectedVideo(null);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function showLibraryHome() {
    setSearch('');
    setFilter('all');
    setCollection('all');
    leaveWatchPage();
  }

  function updateSearch(value) {
    setSearch(value);
    if (selectedVideo) {
      leaveWatchPage();
    }
  }

  function updateFilter(nextFilter) {
    setSearch('');
    setFilter(nextFilter);
    if (nextFilter !== 'all') {
      setCollection('all');
    }
    leaveWatchPage();
  }

  function updateCollection(nextCollection) {
    setSearch('');
    setCollection(nextCollection);
    leaveWatchPage();
  }

  function openVideo(video) {
    setSelectedVideo(video);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function playPreviousVideo() {
    if (!watchNavigation.previousVideo) return;
    setSelectedVideo(watchNavigation.previousVideo);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function playNextFromButton() {
    if (!watchNavigation.nextVideo) return;
    setSelectedVideo(watchNavigation.nextVideo);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function toggleFavorite(videoId) {
    setFavorites((current) => {
      const next = current.includes(videoId)
        ? current.filter((id) => id !== videoId)
        : [...current, videoId];
      setJson(STORAGE_KEYS.favorites, next);
      return next;
    });
  }

  function playNextVideo(videoId) {
    setProgress((current) => {
      const next = { ...current };
      delete next[videoId];
      setJson(STORAGE_KEYS.progress, next);
      return next;
    });

    const nextVideo = getRecommendedQueue(selectedVideo || videos.find((video) => video.id === videoId), videos)[0];
    if (nextVideo) {
      setSelectedVideo(nextVideo);
      return;
    }

    setSelectedVideo(null);
  }

  return (
    <div className="app-container">
      <Header
        search={search}
        setSearch={updateSearch}
        parentUnlocked={parentUnlocked}
        setParentUnlocked={setParentUnlocked}
        onRefresh={reload}
        loading={loading}
        onHome={showLibraryHome}
      />

      <Sidebar
        filter={filter}
        setFilter={updateFilter}
        collection={collection}
        setCollection={updateCollection}
        collectionOptions={collectionOptions}
        counts={sidebarCounts}
      />

      <main className="main-content">
        {error ? (
          <section className="error-card">
            <span>🚧</span>
            <div>
              <h1>Setup needs attention</h1>
              <p>{error}</p>
            </div>
          </section>
        ) : null}

        {loading && !videos.length ? (
          <section className="loading-card">
            <span className="spinner" />
            <h1>Loading cinema feed...</h1>
          </section>
        ) : (
          <>
            {selectedVideo ? (
              <WatchPage
                video={selectedVideo}
                recommendations={recommendedVideos}
                previousVideo={watchNavigation.previousVideo}
                nextVideo={watchNavigation.nextVideo}
                onBack={() => setSelectedVideo(null)}
                onHome={showLibraryHome}
                collection={collection}
                collectionOptions={collectionOptions}
                onSelectCollection={updateCollection}
                onSelectVideo={openVideo}
                onEnded={playNextVideo}
                onPrevious={playPreviousVideo}
                onNext={playNextFromButton}
                progress={progress}
                setProgress={setProgress}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
              />
            ) : (
              <>
                <Hero featured={featured} onPlay={openVideo} total={scopedVideos.length} />

                <LibraryToolbar
                  filter={filter}
                  setFilter={updateFilter}
                  collection={collection}
                  setCollection={updateCollection}
                  collectionOptions={collectionOptions}
                  qualityFilter={qualityFilter}
                  setQualityFilter={setQualityFilter}
                  durationFilter={durationFilter}
                  setDurationFilter={setDurationFilter}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  counts={counts}
                  visibleCount={filteredVideos.length}
                  search={search}
                  setSearch={updateSearch}
                />
                
                {parentUnlocked ? (
                  <ParentPanel
                    reload={reload}
                    refreshedAt={refreshedAt}
                    videos={videos}
                    library={library}
                  />
                ) : null}

                <VideoGrid
                  videos={filteredVideos}
                  onPlay={openVideo}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  progress={progress}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const rootElement = document.getElementById('root');
const root = rootElement._kidsCinemaRoot || createRoot(rootElement);
rootElement._kidsCinemaRoot = root;
root.render(<App />);
