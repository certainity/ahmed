import React, { useEffect, useRef, useState } from 'react';
import './games.css';
import { Confetti, Sound, panel, stopSpeech } from './kit.js';
import { balloonGame, catchGame, countGame, memoryGame, paintGame } from './classic.js';
import { fishGame } from './fishFeast.js';
import { platformGame } from './jumpQuest.js';
import { shooterGame } from './skyPatrol.js';

export const GAMES = [
  { id: 'fish', shelf: 'arcade', name: 'Fish Feast', skill: 'Eat and grow', blurb: 'Eat smaller fish, dodge the grumpy big ones, grow into the biggest fish in the sea.', glyph: '🐠', tone: 'ocean', start: fishGame },
  { id: 'jump', shelf: 'arcade', name: "Pip's Jump Quest", skill: 'Run and jump', blurb: 'Run, jump on blobs, bump the ? blocks for coins and reach the flag.', glyph: '🚩', tone: 'sun', start: platformGame },
  { id: 'sky', shelf: 'arcade', name: 'Sky Patrol', skill: 'Fly and shoot', blurb: 'Fly over the islands, pop robot drones and beat the big airship.', glyph: '✈️', tone: 'berry', start: shooterGame },
  { id: 'balloons', shelf: 'little', name: 'Balloon Pop', skill: 'Letters A–Z', blurb: 'Pop balloons and hear every letter.', glyph: '🎈', tone: 'berry', start: balloonGame },
  { id: 'pairs', shelf: 'little', name: 'Animal Pairs', skill: 'Memory', blurb: 'Flip two cards to find matching animals.', glyph: '🐼', tone: 'ocean', start: memoryGame },
  { id: 'catch', shelf: 'little', name: 'Fruit Catch', skill: 'Hand and eye', blurb: 'Slide the basket and catch falling fruit.', glyph: '🧺', tone: 'leaf', start: catchGame },
  { id: 'count', shelf: 'little', name: 'Count With Me', skill: 'Numbers 1–10', blurb: 'Tap to count, then pick the number.', glyph: '🐞', tone: 'sun', start: countGame },
  { id: 'paint', shelf: 'little', name: 'Paint Pad', skill: 'Drawing', blurb: 'Draw with crayons and stamp stars.', glyph: '🖍️', tone: 'grape', start: paintGame }
];

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Grandstander:wght@700;900&display=swap';

function useGameFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-playroom-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    link.dataset.playroomFonts = '';
    document.head.append(link);
  }, []);
}

function useMuted() {
  const [muted, setMuted] = useState(Sound.muted);
  useEffect(() => Sound.subscribe(setMuted), []);
  return muted;
}

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const StarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2-4.6-4.4 6.3-.9z" fill="#fffdf6" stroke="#1f2a5a" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const SoundIcon = ({ muted }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    {muted ? (
      <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    ) : (
      <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    )}
  </svg>
);

function GameTile({ game, big }) {
  return (
    <a className={`pr-tile${big ? ' pr-tile-big' : ''}`} href={`#games/${game.id}`} data-tone={game.tone}>
      <span className="pr-tile-glyph" aria-hidden="true">{game.glyph}</span>
      <span className="pr-tile-text">
        <span className="pr-tile-name">{game.name}</span>
        <span className="pr-tile-skill">{game.skill}</span>
        <span className="pr-tile-blurb">{game.blurb}</span>
      </span>
    </a>
  );
}

function GamesHome({ exitHref }) {
  const arcade = GAMES.filter((g) => g.shelf === 'arcade');
  const little = GAMES.filter((g) => g.shelf === 'little');
  return (
    <main className="pr-home">
      <header className="pr-home-head">
        <div className="pr-home-top">
          <span className="pr-eyebrow">Kids Cinema</span>
          {exitHref ? (
            <a className="pr-back-link" href={exitHref}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to videos
            </a>
          ) : null}
        </div>
        <h1 className="pr-wordmark" aria-label="Playroom">
          {'Playroom'.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </h1>
        <p className="pr-lede">Pick a game. Every game makes sounds, so turn the volume up.</p>
      </header>

      <section className="pr-shelf-block" aria-labelledby="pr-arcade">
        <h2 className="pr-shelf-title" id="pr-arcade">Arcade</h2>
        <nav className="pr-shelf pr-shelf-arcade">
          {arcade.map((g) => (
            <GameTile key={g.id} game={g} big />
          ))}
        </nav>
      </section>

      <section className="pr-shelf-block" aria-labelledby="pr-little">
        <h2 className="pr-shelf-title" id="pr-little">Little games</h2>
        <nav className="pr-shelf pr-shelf-little">
          {little.map((g) => (
            <GameTile key={g.id} game={g} />
          ))}
        </nav>
      </section>

      <p className="pr-grown-ups">
        For grown-ups: no ads, no links out, no accounts. Everything runs on this device. The arcade games use arrow keys and Space on a
        computer, and on-screen buttons or dragging on a phone or tablet.
      </p>
    </main>
  );
}

function GameStage({ game }) {
  const arenaRef = useRef(null);
  const [score, setScore] = useState(0);
  const [cheer, setCheer] = useState(null);
  const muted = useMuted();

  useEffect(() => {
    const arena = arenaRef.current;
    let cheerTimer = 0;
    const api = {
      setScore: (n) => setScore(n),
      cheer(text) {
        clearTimeout(cheerTimer);
        setCheer({ text, key: Math.random() });
        cheerTimer = setTimeout(() => setCheer(null), 1700);
      },
      celebrate: () => Confetti.burst(),
      panel: (opts) => panel(arena, opts)
    };
    setScore(0);
    const stop = game.start(arena, api);
    return () => {
      stop();
      clearTimeout(cheerTimer);
      stopSpeech();
      arena.textContent = '';
    };
  }, [game]);

  useEffect(() => {
    document.title = `${game.name} · Kids Cinema Playroom`;
  }, [game]);

  return (
    <section className="pr-stage">
      <div className="pr-stage-bar">
        <a className="pr-round-btn" href="#games" aria-label="Back to all games">
          <HomeIcon />
        </a>
        <h2 className="pr-stage-title">{game.name}</h2>
        <div className="pr-stage-end">
          {score == null ? null : (
            <span className="pr-score" key={score} aria-live="polite">
              <StarIcon />
              <span>{score}</span>
            </span>
          )}
          <button className="pr-round-btn" type="button" onClick={() => Sound.toggle()} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
            <SoundIcon muted={muted} />
          </button>
        </div>
      </div>
      <div className="pr-arena" ref={arenaRef} data-game={game.id} />
      {cheer ? (
        <div className="pr-cheer" key={cheer.key} role="status">
          {cheer.text}
        </div>
      ) : null}
    </section>
  );
}

export default function GamesApp({ gameId, exitHref = '#' }) {
  useGameFonts();
  const game = GAMES.find((g) => g.id === gameId);

  useEffect(() => {
    if (!game) document.title = 'Kids Cinema Playroom';
  }, [game]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [gameId]);

  return <div className={`pr-root${game ? ' pr-playing' : ''}`}>{game ? <GameStage game={game} /> : <GamesHome exitHref={exitHref} />}</div>;
}
