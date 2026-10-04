let hlsModule;
export function warmPlayback(video) {
  if (!video.directPlayable) hlsModule ||= import('hls.js');
}

// Shared by the watch page and Shorts. Each mount owns and releases its player.
export function mountPlayback(player, video, options = {}) {
  const { resumeAt = 0, quality = 'auto', muted = false, loop = false, onStatus = () => {}, onFailure = () => {} } = options;
  const hd = quality === '720p' || quality === '1080p';
  const aborter = new AbortController();
  let hls, disposed = false, startedConversion = false, copy = false;
  let silenceTicks = 0, networkRetries = 0, mediaRetries = 0, directTimer;
  let restoreTime = resumeAt;
  let timelineFrom = 0, conversionGeneration = 0, engineReady = false;
  const timers = new Set();
  const later = (callback, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback(); }, ms);
    timers.add(timer);
    return timer;
  };
  const report = message => { if (!disposed) onStatus(message); };
  const fail = message => { if (!disposed) { report(message); onFailure(message); } };
  const play = () => player.play().catch(() => report('Tap play to start.'));
  const restore = () => {
    if (restoreTime && Number.isFinite(player.duration) && restoreTime < player.duration - 1) player.currentTime = restoreTime;
  };
  const decodedFrames = () => player.getVideoPlaybackQuality?.().totalVideoFrames || player.webkitDecodedFrameCount || 0;
  const cleanupEngine = () => { engineReady = false; hls?.destroy(); hls = null; clearTimeout(directTimer); };

  const startConverted = async (start, copyVideo = false) => {
    if (disposed) return;
    cleanupEngine();
    startedConversion = true;
    copy = copyVideo;
    restoreTime = start;
    const generation = ++conversionGeneration;
    report(hd ? `Preparing ${quality} HD…` : 'Getting your video ready…');
    try {
      const startedAt = Date.now();
      hlsModule ||= import('hls.js');
      const { default: Hls } = await hlsModule;
      if (disposed || generation !== conversionGeneration) return;
      // HLS.js offsets partial conversions onto the original movie timeline.
      // Native HLS players retain the complete timeline starting at zero.
      timelineFrom = hd && Hls.isSupported() ? Math.max(0, Math.floor(start) - 4) : 0;
      const url = `${video.hlsUrl}${hd ? `&quality=${quality}&from=${timelineFrom}` : copyVideo ? '&vcopy=1' : ''}${start ? `&start=${Math.floor(start)}` : ''}`;
      for (;;) {
        const response = await fetch(url, { signal: aborter.signal, cache: 'no-store' });
        if (disposed || generation !== conversionGeneration) return;
        if (response.ok && response.headers.get('content-type')?.includes('mpegurl')) break;
        const error = await response.json().catch(() => ({}));
        if (response.status !== 202) throw new Error(response.status === 429 ? 'This video is busy on Drive. Try again later.' : error.message || 'Could not load this video.');
        if (Date.now() - startedAt > 120000) throw new Error('This video is taking longer than expected. Try again.');
        await new Promise(resolve => {
          const timer = later(resolve, 650);
          aborter.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
        if (disposed || generation !== conversionGeneration) return;
      }
      if (!Hls.isSupported()) {
        if (!player.canPlayType('application/vnd.apple.mpegurl')) throw new Error('This device cannot play this video.');
        player.addEventListener('loadedmetadata', restore, { once: true });
        player.src = url; player.load(); play(); return;
      }
      hls = new Hls({ startPosition: Math.max(0, start - timelineFrom), timelineOffset: timelineFrom, maxBufferLength: loop ? 12 : 24, maxBufferSize: 24 * 1024 * 1024, backBufferLength: 12 });
      hls.loadSource(url); hls.attachMedia(player);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!disposed) { engineReady = true; play(); } });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || generation !== conversionGeneration || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries++ < 2) { later(() => hls?.startLoad(), 1000); return; }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) { hls?.recoverMediaError(); return; }
        if (copy) { startConverted(player.currentTime || start, false); return; }
        cleanupEngine(); fail('Could not play this video. Try again or open the video page.');
      });
    } catch (error) {
      if (disposed || generation !== conversionGeneration || error.name === 'AbortError') return;
      if (copyVideo) { startConverted(start, false); return; }
      fail(error.message || 'Could not play this video. Try again.');
    }
  };
  const onError = () => {
    if (!startedConversion) startConverted(player.currentTime || resumeAt, decodedFrames() > 0);
    else if (!hls && player.src.includes('master.m3u8')) fail('Could not play this video. Try again.');
  };
  const onPlaying = () => { clearTimeout(directTimer); report(''); };
  const onWaiting = () => report('Loading video…');
  const onSeeking = () => {
    if (hd && engineReady && timelineFrom && player.currentTime < timelineFrom - 0.5) {
      startConverted(player.currentTime);
    }
  };
  const checkAudio = () => {
    if (startedConversion || player.paused || player.muted || player.currentTime < 3 || typeof player.webkitAudioDecodedByteCount !== 'number') return;
    if (player.webkitAudioDecodedByteCount > 0) return;
    if (++silenceTicks >= 2) startConverted(player.currentTime, decodedFrames() > 0);
  };
  const visibility = () => { if (document.hidden) player.pause(); };
  player.muted = muted; player.loop = loop; player.playsInline = true;
  player.addEventListener('error', onError);
  player.addEventListener('playing', onPlaying);
  player.addEventListener('waiting', onWaiting);
  player.addEventListener('seeking', onSeeking);
  player.addEventListener('timeupdate', checkAudio);
  document.addEventListener('visibilitychange', visibility);
  report('Loading video…');
  if (video.directPlayable && !hd) {
    player.addEventListener('loadedmetadata', restore, { once: true });
    player.src = video.streamUrl; player.load(); play();
    directTimer = later(() => { if (player.readyState < 2) onError(); }, 12000);
  } else startConverted(resumeAt);
  return () => {
    disposed = true; aborter.abort(); cleanupEngine();
    timers.forEach(clearTimeout);
    player.removeEventListener('error', onError);
    player.removeEventListener('playing', onPlaying);
    player.removeEventListener('waiting', onWaiting);
    player.removeEventListener('seeking', onSeeking);
    player.removeEventListener('timeupdate', checkAudio);
    player.removeEventListener('loadedmetadata', restore);
    document.removeEventListener('visibilitychange', visibility);
    player.pause(); player.removeAttribute('src'); player.load();
  };
}
