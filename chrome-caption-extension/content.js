(() => {
  const API_ORIGIN = 'https://kids-drive-cinema.onrender.com';
  const IS_MOVIE_SITE = location.hostname.includes('drive-movies-cinema');
  const LIBRARY = IS_MOVIE_SITE ? 'movie' : 'kids';
  const STATE = {
    wrap: null,
    video: null,
    currentVideoId: '',
    cues: [],
    enabled: true,
    overlay: null,
    text: null,
    button: null,
    videosPromise: null
  };

  function apiUrl(path) {
    const url = new URL(path, API_ORIGIN);
    if (url.pathname.startsWith('/api/') && !url.searchParams.has('library')) {
      url.searchParams.set('library', LIBRARY);
    }
    return url.href;
  }

  function normalizeTitle(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\([^)]*\)\s*$/, '')
      .trim()
      .toLowerCase();
  }

  function getCurrentTitle() {
    const heading = document.querySelector('.watch-player .player-topline h2');
    if (!heading) return '';
    const clone = heading.cloneNode(true);
    clone.querySelectorAll('span').forEach((item) => item.remove());
    return clone.textContent.trim();
  }

  async function getVideos() {
    if (!STATE.videosPromise) {
      STATE.videosPromise = fetch(apiUrl('/api/videos'), { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('Could not load video list.');
          return response.json();
        })
        .then((payload) => payload.videos || []);
    }
    return STATE.videosPromise;
  }

  async function findCurrentVideo() {
    const title = normalizeTitle(getCurrentTitle());
    if (!title) return null;
    const videos = await getVideos();
    return videos.find((video) => normalizeTitle(video.title) === title) ||
      videos.find((video) => title && normalizeTitle(video.title).startsWith(title)) ||
      null;
  }

  function parseTime(value) {
    const parts = String(value || '').trim().split(':');
    if (parts.length < 2) return 0;
    const seconds = Number(parts.pop().replace(',', '.')) || 0;
    const minutes = Number(parts.pop()) || 0;
    const hours = Number(parts.pop()) || 0;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  function parseVtt(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split('\n').filter(Boolean);
        const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
        if (timeLineIndex < 0) return null;
        const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((item) => item.trim().split(/\s+/)[0]);
        const body = lines.slice(timeLineIndex + 1)
          .join('\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (!body) return null;
        return {
          start: parseTime(startRaw),
          end: parseTime(endRaw),
          text: body
        };
      })
      .filter(Boolean);
  }

  async function loadCues(video) {
    if (!video?.captionUrl || !video.captionsReady) return [];
    const response = await fetch(apiUrl(video.captionUrl), { cache: 'no-store' });
    if (!response.ok) return [];
    return parseVtt(await response.text());
  }

  function ensureOverlay() {
    if (!STATE.wrap || !STATE.video) return;
    if (STATE.overlay && STATE.overlay.isConnected) return;

    STATE.overlay = document.createElement('div');
    STATE.overlay.className = 'kdc-caption-root';
    STATE.text = document.createElement('div');
    STATE.text.className = 'kdc-caption-text';
    STATE.overlay.appendChild(STATE.text);

    STATE.button = document.createElement('button');
    STATE.button.className = 'kdc-caption-toggle kdc-caption-on';
    STATE.button.type = 'button';
    STATE.button.textContent = 'CC';
    STATE.button.title = 'Toggle captions';
    STATE.button.addEventListener('click', () => {
      STATE.enabled = !STATE.enabled;
      STATE.button.classList.toggle('kdc-caption-on', STATE.enabled);
      renderCue();
    });

    STATE.wrap.appendChild(STATE.overlay);
    STATE.wrap.appendChild(STATE.button);
  }

  function activeCue(time) {
    return STATE.cues.find((cue) => time >= cue.start && time <= cue.end);
  }

  function renderCue() {
    if (!STATE.overlay || !STATE.text || !STATE.video) return;
    const cue = STATE.enabled ? activeCue(STATE.video.currentTime) : null;
    STATE.text.textContent = cue?.text || '';
    STATE.overlay.classList.toggle('kdc-caption-visible', Boolean(cue?.text));
  }

  async function refreshCaptionState() {
    const wrap = document.querySelector('.watch-player .player-video-wrap');
    const videoEl = wrap?.querySelector('video');
    if (!wrap || !videoEl) return;

    STATE.wrap = wrap;
    STATE.video = videoEl;
    ensureOverlay();

    const video = await findCurrentVideo().catch(() => null);
    const nextId = video?.id || '';
    if (nextId && nextId !== STATE.currentVideoId) {
      STATE.currentVideoId = nextId;
      STATE.cues = await loadCues(video).catch(() => []);
      STATE.button.hidden = STATE.cues.length === 0;
      renderCue();
    }
  }

  function tick() {
    refreshCaptionState();
    renderCue();
    window.setTimeout(tick, 500);
  }

  tick();
})();
