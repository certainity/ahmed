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
      subtitle: 'Private Drive theater',
      search: 'Search movies, folders, or collections',
      empty: 'No movies found'
    }
  : {
      title: 'Kids Cinema',
      subtitle: 'Private Drive theater',
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
    streamUrl: apiUrl(video.streamUrl)
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

function pickInitialVideo(videos) {
  return videos.find((video) => video.directPlayable) || videos[0] || null;
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

function Player({ video, queue, progress, setProgress, onPick, onClose, favorite, onToggleFavorite }) {
  const videoRef = useRef(null);
  const [mode, setMode] = useState('browser');
  const [status, setStatus] = useState('');

  const currentIndex = queue.findIndex((item) => item.id === video?.id);
  const previous = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;

  useEffect(() => {
    setMode('browser');
    setStatus('');
  }, [video?.id]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player || !video || mode !== 'browser') return undefined;

    player.src = video.streamUrl;
    player.load();
    player.volume = 1;
    player.muted = false;

    const saved = progress[video.id]?.currentTime;
    const restore = () => {
      if (saved && saved > 5 && Number.isFinite(saved)) player.currentTime = saved;
    };

    player.addEventListener('loadedmetadata', restore, { once: true });
    player.play().then(() => setStatus('')).catch(() => setStatus('Press play to start.'));

    return () => {
      player.removeEventListener('loadedmetadata', restore);
      player.pause();
      player.removeAttribute('src');
      player.load();
    };
  }, [video, mode]);

  if (!video) return null;

  function remember() {
    const player = videoRef.current;
    if (!player || mode !== 'browser') return;
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
    remember();
    setStatus('');
    setMode(nextMode);
  }

  return (
    <section className="player-stage">
      <div className="player-header">
        <div>
          <p className="eyebrow">{video.folderPathLabel}</p>
          <h1>{cleanTitle(video.title)}</h1>
          <div className="video-meta">
            <span>{episodeLabel(video)}</span>
            {video.width && video.height ? <span>{video.width}x{video.height}</span> : null}
            {video.size ? <span>{formatSize(video.size)}</span> : null}
          </div>
        </div>
        <div className="header-button-row">
          <button className="icon-button" onClick={() => onToggleFavorite(video.id)} type="button" title="Favorite">
            {favorite ? 'Saved' : 'Save'}
          </button>
          <button className="icon-button" onClick={onClose} type="button">Close</button>
        </div>
      </div>

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
            onTimeUpdate={remember}
            onPause={remember}
            onEnded={() => {
              remember();
              if (next) onPick(next);
            }}
            onError={() => setStatus(video.drivePreviewUrl ? 'Browser player could not play this file. Try Drive Preview.' : 'This file could not be streamed right now.')}
          />
        )}
      </div>

      <div className="player-actions">
        <div className="segmented" aria-label="Player mode">
          <button className={mode === 'browser' ? 'active' : ''} onClick={() => chooseMode('browser')} type="button">Browser Player</button>
          <button className={mode === 'drive' ? 'active' : ''} onClick={() => chooseMode('drive')} type="button" disabled={!video.drivePreviewUrl}>Drive Preview</button>
        </div>
        <div className="player-links">
          {status ? <span className="status-text">{status}</span> : <span className="status-text">Source: approved Google Drive folder</span>}
          {video.driveViewUrl ? <a href={video.driveViewUrl} target="_blank" rel="noreferrer">Open Drive</a> : null}
          {video.driveDownloadUrl ? <a href={video.driveDownloadUrl} target="_blank" rel="noreferrer">Download</a> : null}
          <button onClick={() => previous && onPick(previous)} disabled={!previous} type="button">Previous</button>
          <button onClick={() => next && onPick(next)} disabled={!next} type="button">Next</button>
        </div>
      </div>
    </section>
  );
}

function VideoCard({ video, onPick, progressValue, favorite, onToggleFavorite }) {
  return (
    <article className="video-card">
      <button className="thumbnail-button" onClick={() => onPick(video)} type="button" aria-label={`Play ${video.title}`}>
        <img src={video.thumbnailUrl} alt="" loading="lazy" />
        <span className="play-mark" aria-hidden="true" />
        <span className="duration-badge">{episodeLabel(video)}</span>
        {progressValue > 0 ? <span className="progress-bar" style={{ width: `${progressValue}%` }} /> : null}
      </button>
      <div className="card-body">
        <button className="title-button" onClick={() => onPick(video)} type="button">{cleanTitle(video.title)}</button>
        <button className={`favorite-button ${favorite ? 'active' : ''}`} onClick={() => onToggleFavorite(video.id)} type="button" title="Favorite">
          {favorite ? 'Saved' : 'Save'}
        </button>
      </div>
      <p className="card-meta">{video.folderPathLabel}</p>
      <p className="card-submeta">
        {video.directPlayable ? 'Browser ready' : 'Drive preview available'}
        {video.size ? ` · ${formatSize(video.size)}` : ''}
      </p>
    </article>
  );
}

function Sidebar({ folders, activeFolder, setActiveFolder, counts }) {
  return (
    <aside className="sidebar">
      <button className={activeFolder === 'all' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveFolder('all')} type="button">
        <span>Home</span>
        <strong>{counts.all}</strong>
      </button>
      <button className={activeFolder === 'continue' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveFolder('continue')} type="button">
        <span>Continue</span>
        <strong>{counts.continue}</strong>
      </button>
      <button className={activeFolder === 'favorites' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveFolder('favorites')} type="button">
        <span>Saved</span>
        <strong>{counts.favorites}</strong>
      </button>
      <button className={activeFolder === 'shorts' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveFolder('shorts')} type="button">
        <span>Shorts</span>
        <strong>{counts.shorts}</strong>
      </button>
      <div className="sidebar-heading">Folders</div>
      <div className="folder-list">
        {folders.map((folder) => (
          <button
            key={folder.name}
            className={activeFolder === folder.name ? 'folder-item active' : 'folder-item'}
            onClick={() => setActiveFolder(folder.name)}
            type="button"
          >
            <span>{folder.name}</span>
            <strong>{folder.count}</strong>
          </button>
        ))}
      </div>
    </aside>
  );
}

function App() {
  const { videos, library, loading, error, refreshedAt, refresh } = useVideos();
  const didSelectInitialVideo = useRef(false);
  const [query, setQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState('all');
  const [sortMode, setSortMode] = useState('title');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [progress, setProgress] = useState(() => readJson(STORAGE_KEYS.progress, {}));
  const [favorites, setFavorites] = useState(() => readJson(STORAGE_KEYS.favorites, []));

  useEffect(() => {
    if (!didSelectInitialVideo.current && videos.length) {
      didSelectInitialVideo.current = true;
      setSelectedVideo(pickInitialVideo(videos));
    }
  }, [videos, selectedVideo]);

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
        video.filename,
        video.collection,
        video.folderPathLabel
      ].filter(Boolean).join(' ').toLowerCase().includes(search));
    }

    return sortVideos(list, sortMode);
  }, [videos, activeFolder, query, sortMode, progress, favorites]);

  const queue = filteredVideos.length ? filteredVideos : videos;
  const featured = selectedVideo || filteredVideos[0] || videos[0] || null;

  function toggleFavorite(id) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeJson(STORAGE_KEYS.favorites, next);
      return next;
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveFolder('all')} type="button">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            {APP_COPY.title}
            <small>{APP_COPY.subtitle}</small>
          </span>
        </button>
        <label className="search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={APP_COPY.search} />
        </label>
        <div className="top-actions">
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort videos">
            <option value="title">Title A-Z</option>
            <option value="recent">Recently updated</option>
            <option value="short">Shortest first</option>
            <option value="long">Longest first</option>
          </select>
          <button className="primary-button" onClick={refresh} disabled={loading} type="button">
            {loading ? 'Syncing' : 'Sync Drive'}
          </button>
        </div>
      </header>

      <Sidebar folders={folders} activeFolder={activeFolder} setActiveFolder={setActiveFolder} counts={counts} />

      <main className="content">
        {error ? <div className="notice error">{error}</div> : null}
        {library.warnings?.length ? <div className="notice">{library.warnings.join(' ')}</div> : null}

        {featured ? (
          <Player
            video={featured}
            queue={queue}
            progress={progress}
            setProgress={setProgress}
            onPick={setSelectedVideo}
            onClose={() => setSelectedVideo(null)}
            favorite={favorites.includes(featured.id)}
            onToggleFavorite={toggleFavorite}
          />
        ) : null}

        <section className="section-head">
          <div>
            <p className="eyebrow">{activeFolder === 'all' ? 'All folders' : activeFolder}</p>
            <h2>{filteredVideos.length ? `${filteredVideos.length} videos` : APP_COPY.empty}</h2>
          </div>
          <p>{refreshedAt ? `Synced ${new Date(refreshedAt).toLocaleString()}` : 'Loading Drive folder'}</p>
        </section>

        {loading && !videos.length ? (
          <div className="loading-panel">
            <span className="loader" />
            <p>Loading Drive folder...</p>
          </div>
        ) : (
          <section className="video-grid">
            {filteredVideos.map((video) => (
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
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
