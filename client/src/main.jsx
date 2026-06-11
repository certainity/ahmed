import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEYS = {
  favorites: 'kids-drive-cinema:favorites',
  progress: 'kids-drive-cinema:progress',
  parentUnlocked: 'kids-drive-cinema:parent-unlocked'
};

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
  if (!item || !video.durationMs) return 0;
  return Math.min(98, Math.max(0, (item.currentTime / (video.durationMs / 1000)) * 100));
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
      const response = await fetch(`/api/videos${refresh ? '?refresh=1' : ''}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Could not load videos.');
      setVideos(payload.videos || []);
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

function Header({ search, setSearch, parentUnlocked, setParentUnlocked }) {
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
      <a className="brand" href="#top" aria-label="Kids Cinema home">
        <span className="brand-logo" />
        <span>
          <strong>Kids Cinema</strong>
          <small>Safe Drive Player</small>
        </span>
      </a>

      <div className="search-container">
        <label className="searchbox">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cartoons, shows, or folders..."
            aria-label="Search movies"
          />
        </label>
        <button className="search-button" aria-label="Search button">🔍</button>
      </div>

      <div className="header-actions">
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
        const isActive = filter === item.key;
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
        <div className="hero-actions">
          <button className="pill-btn primary" onClick={() => onPlay(featured)}>▶ Play Video</button>
          {featured.durationMs ? <span className="pill-btn">⏱ {formatDuration(featured.durationMs)}</span> : null}
          {featured.isHd ? <span className="pill-btn">✨ HD</span> : null}
        </div>
      </div>
    </section>
  );
}

function VideoCard({ video, onPlay, favorite, onToggleFavorite, progress }) {
  const progressPercent = getProgressPercent(video, progress);
  const channelLetter = (video.collection || 'Main').charAt(0);

  return (
    <article className="video-card">
      <button className="thumbnail" onClick={() => onPlay(video)} aria-label={`Play ${video.title}`}>
        <img src={video.thumbnailUrl} alt="" loading="lazy" />
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
            <span className="video-channel" title={video.collection}>{video.collection}</span>
            <div className="video-stats">
              <span>{video.isHd ? '1080p HD' : 'SD'}</span>
              {video.size ? <span>• {formatSize(video.size)}</span> : null}
            </div>
            {video.folderPathLabel ? (
              <span className="video-path" title={video.folderPathLabel}>
                {video.folderPathLabel}
              </span>
            ) : null}
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
        <h2>No videos found</h2>
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

function PlayerModal({ video, onClose, onEnded, progress, setProgress }) {
  const playerRef = useRef(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !video) return;
    const saved = progress[video.id]?.currentTime;
    if (saved && saved > 5) {
      player.currentTime = saved;
    }
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
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Playing ${video.title}`}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="player-shell">
        <div className="player-topline">
          <h2>{video.title} <span>({video.folderPathLabel})</span></h2>
          <button className="close" onClick={onClose} aria-label="Close player">×</button>
        </div>
        <video
          ref={playerRef}
          src={video.streamUrl}
          poster={video.thumbnailUrl}
          controls
          autoPlay
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onTimeUpdate={rememberProgress}
          onPause={rememberProgress}
          onEnded={() => {
            rememberProgress();
            onEnded(video.id);
          }}
        />
        <div className="player-footer">
          <span>🛡 Google Drive Approved Folder Stream</span>
          <span>Tip: Press Esc to close player</span>
        </div>
      </div>
    </div>
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
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [favorites, setFavorites] = useState(() => getJson(STORAGE_KEYS.favorites, []));
  const [progress, setProgress] = useState(() => getJson(STORAGE_KEYS.progress, {}));
  const [parentUnlocked, setParentUnlocked] = useState(() => localStorage.getItem(STORAGE_KEYS.parentUnlocked) === 'yes');

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
      });
  }, [scopedVideos, search, filter, favorites, progress]);

  const counts = useMemo(() => ({
    all: scopedVideos.length,
    favorites: scopedVideos.filter((video) => favorites.includes(video.id)).length,
    continue: scopedVideos.filter((video) => getProgressPercent(video, progress) > 5).length,
    short: scopedVideos.filter((video) => video.durationMs && video.durationMs <= 20 * 60 * 1000).length,
    hd: scopedVideos.filter((video) => video.isHd).length
  }), [scopedVideos, favorites, progress]);

  function toggleFavorite(videoId) {
    setFavorites((current) => {
      const next = current.includes(videoId)
        ? current.filter((id) => id !== videoId)
        : [...current, videoId];
      setJson(STORAGE_KEYS.favorites, next);
      return next;
    });
  }

  function markEnded(videoId) {
    setProgress((current) => {
      const next = { ...current };
      delete next[videoId];
      setJson(STORAGE_KEYS.progress, next);
      return next;
    });
  }

  return (
    <div className="app-container">
      <Header
        search={search}
        setSearch={setSearch}
        parentUnlocked={parentUnlocked}
        setParentUnlocked={setParentUnlocked}
      />

      <Sidebar
        filter={filter}
        setFilter={setFilter}
        collection={collection}
        setCollection={setCollection}
        collectionOptions={collectionOptions}
        counts={counts}
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
            <Hero featured={featured} onPlay={setSelectedVideo} total={scopedVideos.length} />
            
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
              onPlay={setSelectedVideo}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              progress={progress}
            />
          </>
        )}
      </main>

      <PlayerModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onEnded={markEnded}
        progress={progress}
        setProgress={setProgress}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
