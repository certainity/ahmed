import React, { useEffect, useRef, useState } from 'react';
import { cleanTitle } from './media-utils.js';
import { mountPlayback, warmPlayback } from './playback.js';

function Glyph({ kind }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'pause' ? <><path d="M8 5v14M16 5v14" strokeWidth="4" /></> :
      kind === 'play' ? <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" /> :
      kind === 'up' ? <path d="m6 14 6-6 6 6" /> : kind === 'down' ? <path d="m6 10 6 6 6-6" /> :
      kind === 'save' ? <path d="M6 4h12v17l-6-4-6 4Z" /> : kind === 'open' ? <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></> :
      <><path d="m10 5-5 4H2v6h3l5 4Z" />{kind === 'mute' ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</>}
  </svg>;
}

function ShortSlide({ video, active, favorite, onSave, onOpen, onProgress, muted, setMuted }) {
  const player = useRef(null);
  const saveProgress = useRef(onProgress);
  saveProgress.current = onProgress;
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('Loading video…');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState(0);
  const lastSave = useRef(0);
  const duration = video.durationMs / 1000 || 0;
  const remember = (force = false) => {
    const media = player.current;
    if (!media || !media.readyState || (!force && Date.now() - lastSave.current < 5000)) return;
    lastSave.current = Date.now();
    saveProgress.current(video, { currentTime: media.currentTime, duration: duration || media.duration, completed: media.ended, updatedAt: Date.now() });
  };
  useEffect(() => {
    if (!active || !player.current) return;
    setFailed(false); setPaused(false); setPosition(0);
    const media = player.current;
    const dispose = mountPlayback(media, video, { muted, loop: true, onStatus: setStatus, onFailure: () => setFailed(true) });
    const flush = () => remember(true);
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); dispose(); };
  }, [active, video.id, retry]);
  useEffect(() => { if (player.current) player.current.muted = muted; }, [muted]);
  const togglePause = () => {
    const media = player.current;
    if (!media) return;
    if (media.paused) media.play().catch(() => setStatus('Tap play to start.'));
    else media.pause();
  };
  return <article className={`short-slide ${active ? 'is-active' : ''}`} aria-label={`Short: ${cleanTitle(video.title)}`}>
    <div className="short-canvas">
      {active ? <video ref={player} poster={video.thumbnailUrl} playsInline preload="metadata" aria-label={cleanTitle(video.title)}
        onClick={togglePause} onPlaying={() => { setPaused(false); setStatus(''); }} onPause={() => { setPaused(true); remember(true); }}
        onTimeUpdate={() => { setPosition(player.current?.currentTime || 0); remember(); }} /> : <img className="short-poster" src={video.thumbnailUrl} alt="" loading="lazy" />}
      <div className="short-top-controls">
        <button type="button" aria-label={paused ? 'Play short' : 'Pause short'} onClick={togglePause}><Glyph kind={paused ? 'play' : 'pause'} /></button>
        <button type="button" aria-label={muted ? 'Unmute short' : 'Mute short'} onClick={() => setMuted(!muted)}><Glyph kind={muted ? 'mute' : 'sound'} /></button>
      </div>
      {active && status ? <div className="short-status" role="status">{!failed ? <span className="loader" /> : null}<p>{status}</p>{failed ? <button type="button" onClick={() => setRetry(count => count + 1)}>Try again</button> : null}</div> : null}
      <div className="short-caption"><h2>{cleanTitle(video.title)}</h2><p>{cleanTitle(video.collection)}</p>
        <input type="range" aria-label="Short video position" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 1)}
          onChange={event => { if (player.current?.readyState) { player.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); } }} />
      </div>
    </div>
    <div className="short-actions">
      <button className={favorite ? 'saved' : ''} type="button" onClick={() => onSave(video.id)} aria-pressed={favorite}><span><Glyph kind="save" /></span>{favorite ? 'Saved' : 'Save'}</button>
      <button type="button" onClick={() => { remember(true); onOpen(video); }}><span><Glyph kind="open" /></span>Open video</button>
    </div>
  </article>;
}

export default function ShortsFeed({ videos, startId, favorites, onSave, onOpen, onProgress, onActiveChange }) {
  const first = Math.max(0, videos.findIndex(video => video.id === startId));
  const [index, setIndex] = useState(first);
  const [muted, setMuted] = useState(true);
  const feed = useRef(null);
  const moving = useRef(false);
  const touchStart = useRef(null);
  const wheelAmount = useRef(0);
  const currentIndex = useRef(index);
  currentIndex.current = index;
  useEffect(() => { setIndex(Math.max(0, videos.findIndex(video => video.id === startId))); }, [startId, videos]);
  useEffect(() => {
    const next = videos[index + 1];
    if (next) warmPlayback(next);
    onActiveChange?.(videos[index]?.id);
  }, [index, videos]);
  const go = direction => {
    if (moving.current) return;
    const next = Math.max(0, Math.min(videos.length - 1, currentIndex.current + direction));
    if (next === currentIndex.current) return;
    moving.current = true;
    setIndex(next);
    setTimeout(() => { moving.current = false; wheelAmount.current = 0; }, 400);
  };
  useEffect(() => {
    const node = feed.current;
    const onWheel = event => {
      event.preventDefault();
      wheelAmount.current += event.deltaY;
      if (Math.abs(wheelAmount.current) >= 45) go(wheelAmount.current > 0 ? 1 : -1);
    };
    node?.addEventListener('wheel', onWheel, { passive: false });
    return () => node?.removeEventListener('wheel', onWheel);
  }, [videos.length]);
  if (!videos.length) return <div className="empty-panel"><h2>No Shorts here yet</h2><p>Shorts shows videos up to three minutes long from your library.</p></div>;
  return <section className="shorts-view" ref={feed} aria-label="Shorts feed" tabIndex="0"
    onKeyDown={event => { if (/INPUT|BUTTON/.test(event.target.tagName)) return; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); go(event.key === 'ArrowDown' ? 1 : -1); } }}
    onTouchStart={event => { if (!event.target.closest('button,input')) touchStart.current = event.touches[0].clientY; }}
    onTouchEnd={event => { if (touchStart.current === null) return; const delta = touchStart.current - event.changedTouches[0].clientY; touchStart.current = null; if (Math.abs(delta) > 45) go(delta > 0 ? 1 : -1); }}>
    <div className="shorts-heading"><img src="/assets/cinema/kids-shorts-icon-v01.png" alt="" /><h1>Shorts</h1><span>{index + 1} / {videos.length}</span></div>
    <div className="shorts-stage">
      {videos.slice(Math.max(0, index - 1), index + 2).map(video => <ShortSlide key={video.id} video={video} active={video.id === videos[index]?.id}
        favorite={favorites.includes(video.id)} onSave={onSave} onOpen={onOpen} onProgress={onProgress} muted={muted} setMuted={setMuted} />)}
      <div className="short-navigation">
        <button type="button" aria-label="Previous short" disabled={index === 0} onClick={() => go(-1)}><Glyph kind="up" /></button>
        <button type="button" aria-label="Next short" disabled={index === videos.length - 1} onClick={() => go(1)}><Glyph kind="down" /></button>
      </div>
    </div>
  </section>;
}
