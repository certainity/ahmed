import {
  CRAYONS,
  DISPLAY_FONT,
  EMOJI_FONT,
  INK,
  PAPER,
  Sound,
  drawCloud,
  drawEmoji,
  glowSprite,
  hintText,
  loop,
  makeCanvas,
  makeLayer,
  pick,
  pointIn,
  say,
  scope,
  shade,
  shuffle,
  store
} from './kit.js';

const $ = (sel, el) => el.querySelector(sel);

/* ---------- Balloon Pop ---------- */

export function balloonGame(arena, api) {
  const s = scope();
  const cv = makeCanvas(arena);
  const { ctx, view, canvas } = cv;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let balloons = [];
  let bits = [];
  let floaters = [];
  let spawnIn = 0.2;
  let popped = 0;
  let hint = 1;
  const clouds = [0.15, 0.55, 0.85].map((f, i) => ({ f, y: 50 + i * 70, s: 0.8 + i * 0.25, v: 0.006 + i * 0.004 }));
  const baseRadius = () => Math.max(34, Math.min(62, view.w * 0.07));
  const skyLayer = makeLayer(cv);

  function paintSky(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7cc4ff');
    g.addColorStop(1, '#e9f6ff');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const sun = x.createRadialGradient(w - 60, 60, 10, w - 60, 60, 120);
    sun.addColorStop(0, 'rgba(255,240,170,0.9)');
    sun.addColorStop(1, 'rgba(255,240,170,0)');
    x.fillStyle = sun;
    x.fillRect(w - 200, 0, 200, 200);
    const disc = x.createRadialGradient(w - 70, 50, 4, w - 60, 60, 34);
    disc.addColorStop(0, '#fff6c2');
    disc.addColorStop(1, '#ffc93c');
    x.fillStyle = disc;
    x.beginPath();
    x.arc(w - 60, 60, 34, 0, Math.PI * 2);
    x.fill();
  }

  function spawn() {
    const r = baseRadius() * (0.85 + Math.random() * 0.3);
    balloons.push({
      x: r + Math.random() * Math.max(1, view.w - 2 * r),
      dx: 0,
      y: view.h + r * 1.4,
      r,
      color: pick(CRAYONS),
      letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
      vy: 55 + Math.random() * 45 + Math.min(popped * 1.2, 70),
      phase: Math.random() * Math.PI * 2
    });
  }

  function pop(b) {
    balloons = balloons.filter((other) => other !== b);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 240;
      bits.push({ x: b.dx, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, color: b.color, size: 4 + Math.random() * 7 });
    }
    floaters.push({ x: b.dx, y: b.y, text: b.letter, life: 1 });
    popped++;
    hint = Math.min(hint, 0.99);
    api.setScore(popped);
    Sound.pop();
    say(b.letter);
    if (popped % 10 === 0) {
      s.later(() => {
        api.cheer(`${popped} balloons!`);
        Sound.win();
      }, 250);
    }
  }

  function hit(b, x, y) {
    const nx = (x - b.dx) / b.r;
    const ny = (y - b.y) / (b.r * 1.18);
    return nx * nx + ny * ny <= 1.2;
  }

  s.on(canvas, 'pointerdown', (e) => {
    const p = pointIn(e, canvas);
    for (let i = balloons.length - 1; i >= 0; i--) {
      if (hit(balloons[i], p.x, p.y)) {
        pop(balloons[i]);
        return;
      }
    }
  });
  s.on(window, 'keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (!key || !LETTERS.includes(key)) return;
    const match = balloons.filter((b) => b.letter === key && b.y < view.h).sort((a, b) => b.y - a.y)[0];
    if (match) pop(match);
  });

  function drawBalloon(b) {
    const { dx: x, y, r } = b;
    const bottom = y + r * 1.18;
    ctx.strokeStyle = 'rgba(31,42,90,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, bottom + 6);
    ctx.quadraticCurveTo(x - 12, bottom + r * 0.7, x + 5, bottom + r * 1.5);
    ctx.stroke();
    ctx.fillStyle = shade(b.color, -0.15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, bottom - 4);
    ctx.lineTo(x - 8, bottom + 9);
    ctx.lineTo(x + 8, bottom + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.2);
    g.addColorStop(0, shade(b.color, 0.45));
    g.addColorStop(0.55, b.color);
    g.addColorStop(1, shade(b.color, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.4, y - r * 0.48, r * 0.16, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `900 ${Math.round(r * 0.95)}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeText(b.letter, x, y + r * 0.08);
    ctx.fillStyle = PAPER;
    ctx.fillText(b.letter, x, y + r * 0.08);
  }

  s.add(
    loop((dt, t) => {
      spawnIn -= dt;
      if (spawnIn <= 0 && balloons.length < 9) {
        spawn();
        spawnIn = 0.55 + Math.random() * 0.6;
      }
      for (const b of balloons) {
        b.y -= b.vy * dt;
        b.dx = b.x + Math.sin(t / 600 + b.phase) * 7;
      }
      balloons = balloons.filter((b) => b.y > -b.r * 3);
      for (const p of bits) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 520 * dt;
        p.life -= dt;
      }
      bits = bits.filter((p) => p.life > 0);
      for (const f of floaters) {
        f.y -= 70 * dt;
        f.life -= dt * 0.9;
      }
      floaters = floaters.filter((f) => f.life > 0);
      if (hint < 1) hint = Math.max(0, hint - dt * 2);

      ctx.drawImage(skyLayer('sky', view.w, view.h, paintSky), 0, 0, view.w, view.h);
      for (const c of clouds) {
        c.f = (c.f + c.v * dt) % 1.2;
        drawCloud(ctx, c.f * (view.w + 160) - 120, c.y, c.s);
      }
      for (const b of balloons) drawBalloon(b);
      for (const p of bits) {
        ctx.globalAlpha = Math.max(0, p.life / 0.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      for (const f of floaters) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.font = `900 ${Math.round(baseRadius() * 1.6)}px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8;
        ctx.strokeStyle = INK;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }
      if (hint > 0) hintText(ctx, view, 'Tap a balloon!', hint);
    }, cv)
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}

/* ---------- Animal Pairs ---------- */

export function memoryGame(arena, api) {
  const s = scope();
  const ANIMALS = [
    ['🐶', 'dog'], ['🐱', 'cat'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐼', 'panda'], ['🦁', 'lion'],
    ['🐷', 'pig'], ['🐰', 'bunny'], ['🐻', 'bear'], ['🐨', 'koala'], ['🐯', 'tiger'], ['🐮', 'cow']
  ];
  const LEVELS = {
    easy: { cols: 3, rows: 2, label: '3 pairs' },
    medium: { cols: 4, rows: 3, label: '6 pairs' },
    hard: { cols: 4, rows: 4, label: '8 pairs' }
  };
  let level = store.get('playroom:memory-level', 'medium');
  if (!LEVELS[level]) level = 'medium';

  const root = document.createElement('div');
  root.className = 'pr-mem';
  root.innerHTML = `
    <div class="pr-mem-bar">
      <div class="pr-seg" role="group" aria-label="How many pairs"></div>
      <span class="pr-mem-tries"></span>
    </div>
    <div class="pr-mem-area"><div class="pr-mem-grid"></div></div>`;
  arena.append(root);
  s.add(() => root.remove());
  const seg = $('.pr-seg', root);
  const triesEl = $('.pr-mem-tries', root);
  const area = $('.pr-mem-area', root);
  const grid = $('.pr-mem-grid', root);

  let deck = [];
  let open = [];
  let tries = 0;
  let found = 0;
  let lock = false;
  let closePanel = null;

  for (const [key, cfg] of Object.entries(LEVELS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = cfg.label;
    b.dataset.level = key;
    seg.append(b);
  }
  s.on(seg, 'click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    level = b.dataset.level;
    store.set('playroom:memory-level', level);
    deal();
  });

  function layout() {
    const w = area.clientWidth - 32;
    const h = area.clientHeight - 32;
    if (w <= 0 || h <= 0) return;
    let { cols, rows } = LEVELS[level];
    if (h > w * 1.15 && cols > rows) [cols, rows] = [rows, cols];
    const gap = Math.round(Math.max(8, Math.min(16, w * 0.02)));
    const byWidth = (w - gap * (cols - 1)) / cols;
    const byHeight = ((h - gap * (rows - 1)) / rows) * 0.8;
    const size = Math.max(44, Math.floor(Math.min(byWidth, byHeight, 170)));
    grid.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    grid.style.gap = `${gap}px`;
    grid.style.setProperty('--card', `${size}px`);
  }
  const ro = new ResizeObserver(layout);
  ro.observe(area);
  s.add(() => ro.disconnect());

  function setFlipped(card, flipped) {
    card.el.classList.toggle('flipped', flipped);
    card.el.setAttribute('aria-label', flipped ? card.name : 'Hidden card');
  }

  function deal() {
    if (closePanel) closePanel();
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.level === level));
    const { cols, rows } = LEVELS[level];
    const picks = shuffle(ANIMALS).slice(0, (cols * rows) / 2);
    deck = shuffle([...picks, ...picks]).map(([glyph, name]) => ({ glyph, name, matched: false, el: null }));
    grid.textContent = '';
    for (const card of deck) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pr-card';
      el.setAttribute('aria-label', 'Hidden card');
      el.innerHTML =
        '<span class="pr-card-inner"><span class="pr-card-face pr-card-back" aria-hidden="true">?</span><span class="pr-card-face pr-card-front" aria-hidden="true"></span></span>';
      $('.pr-card-front', el).textContent = card.glyph;
      el.addEventListener('click', () => choose(card));
      card.el = el;
      grid.append(el);
    }
    open = [];
    tries = 0;
    found = 0;
    lock = false;
    api.setScore(0);
    triesEl.textContent = 'Tries: 0';
    layout();
  }

  function choose(card) {
    if (lock || card.matched || open.includes(card)) return;
    setFlipped(card, true);
    Sound.flip();
    open.push(card);
    if (open.length < 2) return;
    tries++;
    triesEl.textContent = `Tries: ${tries}`;
    const [a, b] = open;
    if (a.glyph === b.glyph) {
      a.matched = b.matched = true;
      a.el.classList.add('matched');
      b.el.classList.add('matched');
      open = [];
      found++;
      api.setScore(found);
      s.later(() => {
        Sound.ding();
        say(a.name);
      }, 250);
      if (found === deck.length / 2) s.later(win, 900);
    } else {
      lock = true;
      s.later(() => {
        setFlipped(a, false);
        setFlipped(b, false);
        open = [];
        lock = false;
      }, 1000);
    }
  }

  function win() {
    Sound.win();
    say('You found them all!');
    api.celebrate();
    closePanel = api.panel({
      title: 'You found them all!',
      text: `${deck.length / 2} pairs in ${tries} tries.`,
      button: 'Play again',
      onClick: deal
    });
  }

  deal();
  return () => s.dispose();
}

/* ---------- Fruit Catch ---------- */

export function catchGame(arena, api) {
  const s = scope();
  const cv = makeCanvas(arena);
  const { ctx, view, canvas } = cv;
  const FRUIT = ['🍎', '🍌', '🍓', '🍊', '🍇', '🍐', '🍑', '🍉', '🍒'];
  let items = [];
  let floaters = [];
  let basketX = null;
  let targetX = null;
  let spawnIn = 0.4;
  let score = 0;
  let hint = 1;
  const keys = { left: false, right: false };

  const basketW = () => Math.max(100, Math.min(180, view.w * 0.24));
  const basketH = () => basketW() * 0.48;
  const groundY = () => view.h - Math.max(26, view.h * 0.06);
  const fieldLayer = makeLayer(cv);

  function paintField(x, w, h) {
    const gy = groundY();
    const g = x.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, '#ffe2a8');
    g.addColorStop(1, '#fff7e2');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const hill = (cx, r, color) => {
      x.fillStyle = color;
      x.beginPath();
      x.arc(cx, gy + r * 0.25, r, Math.PI, 0);
      x.fill();
    };
    hill(w * 0.15, w * 0.3, '#ffd0de');
    hill(w * 0.8, w * 0.36, '#ffc4d6');
    hill(w * 0.45, w * 0.22, '#bfeccc');
    const grass = x.createLinearGradient(0, gy, 0, h);
    grass.addColorStop(0, '#7fdc95');
    grass.addColorStop(1, '#4cb96c');
    x.fillStyle = grass;
    x.fillRect(0, gy, w, h - gy);
    x.strokeStyle = INK;
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(0, gy);
    x.lineTo(w, gy);
    x.stroke();
    x.strokeStyle = 'rgba(40,120,60,0.5)';
    x.lineWidth = 2;
    for (let i = 0; i < w; i += 18) {
      x.beginPath();
      x.moveTo(i, gy + 3);
      x.lineTo(i + 4, gy + 10 + ((i * 7) % 6));
      x.stroke();
    }
  }

  function spawn() {
    const star = Math.random() < 0.08;
    const size = Math.max(42, Math.min(66, view.w * 0.08));
    items.push({
      x: size / 2 + Math.random() * Math.max(1, view.w - size),
      y: -size,
      size,
      glyph: star ? '⭐' : pick(FRUIT),
      value: star ? 3 : 1,
      vy: 120 + Math.random() * 60 + Math.min(score * 3, 200),
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 3
    });
  }

  s.on(canvas, 'pointerdown', (e) => {
    targetX = pointIn(e, canvas).x;
  });
  s.on(canvas, 'pointermove', (e) => {
    targetX = pointIn(e, canvas).x;
  });
  s.on(window, 'keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      keys.left = true;
      targetX = null;
      e.preventDefault();
    }
    if (e.key === 'ArrowRight') {
      keys.right = true;
      targetX = null;
      e.preventDefault();
    }
  });
  s.on(window, 'keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  });

  function drawBasket(x) {
    const w = basketW();
    const h = basketH();
    const top = groundY() - h;
    ctx.lineJoin = 'round';
    const bg = ctx.createLinearGradient(0, top, 0, top + h);
    bg.addColorStop(0, '#f0b26a');
    bg.addColorStop(1, '#c97a35');
    ctx.fillStyle = bg;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w * 0.38, top + h);
    ctx.lineTo(x - w * 0.38, top + h);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(31,42,90,0.35)';
    ctx.lineWidth = 3;
    for (let yy = top + h * 0.3; yy < top + h; yy += h * 0.24) {
      ctx.beginPath();
      ctx.moveTo(x - w / 2, yy);
      ctx.lineTo(x + w / 2, yy);
      ctx.stroke();
    }
    for (let xx = x - w / 2; xx < x + w / 2; xx += w / 7) {
      ctx.beginPath();
      ctx.moveTo(xx, top);
      ctx.lineTo(xx + 6, top + h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w * 0.38, top + h);
    ctx.lineTo(x - w * 0.38, top + h);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#b86d2a';
    ctx.beginPath();
    ctx.rect(x - w / 2 - 6, top - 8, w + 12, 14);
    ctx.fill();
    ctx.stroke();
  }


  s.add(
    loop((dt) => {
      const w = basketW();
      if (basketX === null) basketX = view.w / 2;
      if (keys.left) basketX -= 560 * dt;
      if (keys.right) basketX += 560 * dt;
      if (targetX !== null) basketX += (targetX - basketX) * Math.min(1, dt * 14);
      basketX = Math.max(w / 2, Math.min(view.w - w / 2, basketX));

      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = Math.max(0.45, 1.1 - score * 0.012) * (0.7 + Math.random() * 0.6);
      }
      const top = groundY() - basketH();
      const kept = [];
      for (const it of items) {
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
        const inBasket = it.y + it.size * 0.3 >= top && it.y <= top + basketH() * 0.5 && Math.abs(it.x - basketX) < w / 2;
        if (inBasket) {
          score += it.value;
          hint = Math.min(hint, 0.99);
          api.setScore(score);
          Sound.plop();
          floaters.push({ x: it.x, y: top - 10, text: `+${it.value}`, life: 1 });
          if (it.value > 1) say('Star!');
          if (Math.floor(score / 15) > Math.floor((score - it.value) / 15)) {
            s.later(() => {
              api.cheer(`${score} caught!`);
              Sound.win();
            }, 200);
          }
        } else if (it.y < view.h + it.size) {
          kept.push(it);
        }
      }
      items = kept;
      for (const f of floaters) {
        f.y -= 60 * dt;
        f.life -= dt * 1.2;
      }
      floaters = floaters.filter((f) => f.life > 0);
      if (hint < 1) hint = Math.max(0, hint - dt * 2);

      ctx.drawImage(fieldLayer('field', view.w, view.h, paintField), 0, 0, view.w, view.h);
      for (const it of items) {
        const k = Math.max(0, Math.min(1, it.y / groundY()));
        ctx.fillStyle = `rgba(40,80,40,${0.25 * k})`;
        ctx.beginPath();
        ctx.ellipse(it.x, groundY() + 6, it.size * 0.4 * (0.5 + k * 0.5), 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const it of items) {
        if (it.value > 1) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('rgba(255,220,90,0.8)'), it.x - it.size, it.y - it.size, it.size * 2, it.size * 2);
          ctx.globalCompositeOperation = 'source-over';
        }
        drawEmoji(ctx, it.glyph, it.x, it.y, it.size, it.rot);
      }
      drawBasket(basketX);
      for (const f of floaters) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.font = `900 30px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = PAPER;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = INK;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }
      if (hint > 0) hintText(ctx, view, 'Slide the basket!', hint);
    }, cv)
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}

/* ---------- Count With Me ---------- */

export function countGame(arena, api) {
  const s = scope();
  const CRITTERS = [
    ['🐞', 'ladybugs'], ['🐟', 'fish'], ['🍎', 'apples'], ['⭐', 'stars'],
    ['🐥', 'chicks'], ['🌸', 'flowers'], ['🚗', 'cars'], ['🦋', 'butterflies'], ['🐢', 'turtles']
  ];
  const root = document.createElement('div');
  root.className = 'pr-count';
  root.innerHTML = `
    <p class="pr-count-q"></p>
    <p class="pr-count-hint">Tap each one to count out loud.</p>
    <div class="pr-tray"></div>
    <div class="pr-choices" role="group" aria-label="Pick the number"></div>`;
  arena.append(root);
  s.add(() => root.remove());
  const q = $('.pr-count-q', root);
  const tray = $('.pr-tray', root);
  const choices = $('.pr-choices', root);
  let correct = 0;
  let n = 0;
  let tapped = 0;
  let busy = false;

  function round() {
    busy = false;
    const [glyph, name] = pick(CRITTERS);
    const max = Math.min(10, 4 + correct);
    n = 1 + Math.floor(Math.random() * max);
    tapped = 0;
    q.textContent = `How many ${name}?`;
    tray.textContent = '';
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pr-critter';
      b.textContent = glyph;
      b.setAttribute('aria-label', 'Tap to count');
      b.style.animationDelay = `${i * 70}ms`;
      b.addEventListener('click', () => {
        if (b.classList.contains('counted')) return;
        tapped++;
        b.classList.add('counted');
        const tag = document.createElement('span');
        tag.className = 'pr-tag';
        tag.textContent = String(tapped);
        b.append(tag);
        b.setAttribute('aria-label', `Counted ${tapped}`);
        Sound.plop();
        say(String(tapped));
      });
      tray.append(b);
    }
    const opts = new Set([n]);
    while (opts.size < 3) {
      const d = n + Math.floor(Math.random() * 5) - 2;
      if (d >= 1 && d <= 10) opts.add(d);
    }
    choices.textContent = '';
    for (const v of shuffle([...opts])) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pr-num-btn';
      b.textContent = String(v);
      b.addEventListener('click', () => answer(v, b));
      choices.append(b);
    }
  }

  function answer(v, btn) {
    if (busy) return;
    if (v === n) {
      busy = true;
      correct++;
      api.setScore(correct);
      btn.classList.add('right');
      Sound.ding();
      const praise = pick(['Great counting!', 'You got it!', 'Super!']);
      say(`${n}! ${praise}`);
      api.cheer(praise);
      if (correct % 5 === 0) api.celebrate();
      s.later(round, 1500);
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      Sound.oops();
      say('Try again');
    }
  }

  round();
  return () => s.dispose();
}

/* ---------- Paint Pad ---------- */

export function paintGame(arena, api) {
  const s = scope();
  api.setScore(null);
  const COLORS = [
    ['#ff5c5c', 'Red'], ['#ff9f1c', 'Orange'], ['#ffd23f', 'Yellow'], ['#4cc96f', 'Green'],
    ['#3d7fff', 'Blue'], ['#8a5ce6', 'Purple'], ['#ff6fb1', 'Pink'], ['#7a4a2a', 'Brown'], [INK, 'Navy']
  ];
  const SIZES = [[6, 'Thin brush'], [14, 'Medium brush'], [30, 'Fat brush']];
  const STAMPS = [['⭐', 'Star stamp'], ['❤️', 'Heart stamp'], ['🌸', 'Flower stamp'], ['🐟', 'Fish stamp']];

  const root = document.createElement('div');
  root.className = 'pr-paint';
  root.innerHTML = `
    <div class="pr-paint-tools" role="toolbar" aria-label="Paint tools">
      <div class="pr-tool-group pr-swatches"></div>
      <div class="pr-tool-group pr-sizes"></div>
      <div class="pr-tool-group pr-stamps"></div>
      <button class="pr-tool-btn pr-eraser" type="button" aria-pressed="false" aria-label="Eraser">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 16l9-9 6 6-6 6H7z M9 11l6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>
      </button>
      <button class="pr-tool-btn pr-clear-btn" type="button">Clear</button>
    </div>
    <div class="pr-paint-board"></div>`;
  arena.append(root);
  s.add(() => root.remove());
  const swatches = $('.pr-swatches', root);
  const sizes = $('.pr-sizes', root);
  const stamps = $('.pr-stamps', root);
  const eraser = $('.pr-eraser', root);
  const clearBtn = $('.pr-clear-btn', root);
  const cv = makeCanvas($('.pr-paint-board', root), { paper: PAPER });
  const { ctx, canvas, view } = cv;

  let color = COLORS[4][0];
  let size = SIZES[1][0];
  let stamp = null;
  let erasing = false;

  function syncTools() {
    for (const b of swatches.children) b.setAttribute('aria-pressed', String(!stamp && !erasing && b.dataset.color === color));
    for (const b of sizes.children) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === size));
    for (const b of stamps.children) b.setAttribute('aria-pressed', String(b.dataset.stamp === stamp));
    eraser.setAttribute('aria-pressed', String(erasing));
  }

  for (const [c, label] of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pr-swatch';
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      color = c;
      stamp = null;
      erasing = false;
      syncTools();
    });
    swatches.append(b);
  }
  for (const [px, label] of SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pr-tool-btn';
    b.dataset.size = String(px);
    b.setAttribute('aria-label', label);
    const dot = document.createElement('span');
    dot.className = 'pr-dot';
    dot.style.width = dot.style.height = `${Math.max(6, px * 0.8)}px`;
    b.append(dot);
    b.addEventListener('click', () => {
      size = px;
      stamp = null;
      syncTools();
    });
    sizes.append(b);
  }
  for (const [glyph, label] of STAMPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pr-tool-btn';
    b.dataset.stamp = glyph;
    b.textContent = glyph;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      stamp = stamp === glyph ? null : glyph;
      erasing = false;
      syncTools();
    });
    stamps.append(b);
  }
  s.on(eraser, 'click', () => {
    erasing = !erasing;
    stamp = null;
    syncTools();
  });

  let armed = false;
  function disarm() {
    armed = false;
    clearBtn.classList.remove('armed');
    clearBtn.textContent = 'Clear';
  }
  s.on(clearBtn, 'click', () => {
    if (!armed) {
      armed = true;
      clearBtn.classList.add('armed');
      clearBtn.textContent = 'Tap again to clear';
      s.later(disarm, 2500);
      return;
    }
    disarm();
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, view.w, view.h);
    Sound.oops();
  });

  let drawing = false;
  let last = null;
  function strokeTo(p) {
    ctx.strokeStyle = erasing ? PAPER : color;
    ctx.lineWidth = erasing ? size * 2 : size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }
  s.on(canvas, 'pointerdown', (e) => {
    e.preventDefault();
    const p = pointIn(e, canvas);
    if (stamp) {
      ctx.font = `${Math.round(size * 2.4 + 24)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stamp, p.x, p.y);
      Sound.plop();
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
    drawing = true;
    last = { x: p.x - 0.01, y: p.y };
    strokeTo(p);
  });
  s.on(canvas, 'pointermove', (e) => {
    if (!drawing) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) strokeTo(pointIn(ev, canvas));
  });
  const end = () => {
    drawing = false;
  };
  s.on(canvas, 'pointerup', end);
  s.on(canvas, 'pointercancel', end);

  // A starter doodle so the pad opens looking like a pad, not a blank screen.
  if (view.w && view.h) {
    const { w, h } = view;
    const m = Math.min(w, h);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.2, m * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.82 + Math.cos(a) * m * 0.12, h * 0.2 + Math.sin(a) * m * 0.12);
      ctx.lineTo(w * 0.82 + Math.cos(a) * m * 0.16, h * 0.2 + Math.sin(a) * m * 0.16);
      ctx.stroke();
    }
    ctx.strokeStyle = '#4cc96f';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.9);
    ctx.bezierCurveTo(w * 0.3, h * 0.8, w * 0.6, h * 0.97, w, h * 0.86);
    ctx.stroke();
  }

  syncTools();
  s.add(() => cv.destroy());
  return () => s.dispose();
}
