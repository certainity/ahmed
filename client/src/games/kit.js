export const INK = '#1f2a5a';
export const PAPER = '#fffdf6';
export const CRAYONS = ['#ff5c5c', '#ff9f1c', '#ffd23f', '#4cc96f', '#3d7fff', '#8a5ce6', '#ff6fb1'];
export const DISPLAY_FONT = 'Grandstander, "Comic Sans MS", "Chalkboard SE", sans-serif';
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const rand = (min, max) => min + Math.random() * (max - min);
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }
};

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

/* ---------- Sound and voice ---------- */

export const Sound = (() => {
  let ctx = null;
  let muted = store.get('playroom:muted', false);
  const listeners = new Set();

  function audio() {
    if (muted) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.2, from = 1200, to = 200) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(t);
  }

  const seq = (notes, gap, dur, type, vol) =>
    notes.forEach((f, i) => setTimeout(() => tone(f, dur, type, vol), i * gap));

  return {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      store.set('playroom:muted', muted);
      if (muted) {
        try {
          speechSynthesis.cancel();
        } catch {
          /* no speech */
        }
      }
      listeners.forEach((fn) => fn(muted));
      return muted;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    pop: () => tone(760, 0.13, 'triangle', 0.28, 110),
    plop: () => tone(320, 0.09, 'sine', 0.18, 620),
    flip: () => tone(440, 0.05, 'square', 0.05),
    ding: () => seq([660, 990], 90, 0.2, 'sine', 0.18),
    oops: () => tone(280, 0.25, 'sine', 0.16, 170),
    win: () => seq([523, 659, 784, 1047], 120, 0.26, 'triangle', 0.2),
    coin: () => seq([988, 1319], 70, 0.14, 'square', 0.07),
    jump: () => tone(300, 0.16, 'square', 0.06, 620),
    stomp: () => tone(220, 0.12, 'square', 0.09, 90),
    hurt: () => tone(400, 0.35, 'sawtooth', 0.08, 110),
    chomp: () => tone(180, 0.08, 'square', 0.12, 420),
    grow: () => seq([392, 523, 659, 784, 1047], 70, 0.15, 'triangle', 0.16),
    shoot: () => tone(880, 0.06, 'square', 0.025, 440),
    boom: () => noise(0.35, 0.25, 1600, 120),
    bigBoom: () => noise(0.9, 0.35, 900, 60),
    power: () => seq([523, 784, 1047, 1568], 60, 0.12, 'square', 0.07)
  };
})();

export function say(text) {
  if (Sound.muted || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = 1.25;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}

export function stopSpeech() {
  try {
    speechSynthesis.cancel();
  } catch {
    /* no speech */
  }
}

/* ---------- Confetti ---------- */

export const Confetti = (() => {
  let canvas = null;
  let ctx = null;
  let parts = [];
  let raf = 0;
  let last = 0;

  function ensure() {
    if (canvas && canvas.isConnected) return;
    canvas = document.createElement('canvas');
    canvas.className = 'pr-confetti';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
  }

  function fit() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * d);
    canvas.height = Math.round(innerHeight * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  function step(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 900 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      p.life -= dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
    if (parts.length) {
      raf = requestAnimationFrame(step);
    } else {
      raf = 0;
      last = 0;
      canvas.remove();
    }
  }

  return {
    burst() {
      if (reduceMotion()) return;
      ensure();
      fit();
      for (let i = 0; i < 140; i++) {
        parts.push({
          x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
          y: innerHeight * 0.4,
          vx: (Math.random() - 0.5) * 900,
          vy: -350 - Math.random() * 550,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 12,
          w: 7 + Math.random() * 6,
          h: 11 + Math.random() * 8,
          color: pick(CRAYONS),
          life: 2.8
        });
      }
      if (!raf) raf = requestAnimationFrame(step);
    }
  };
})();

/* ---------- Lifecycle, canvas, loop ---------- */

export function scope() {
  const timers = new Set();
  const offs = [];
  return {
    later(fn, ms) {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    },
    on(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      offs.push(() => el.removeEventListener(type, fn, opts));
    },
    add(fn) {
      offs.push(fn);
    },
    dispose() {
      timers.forEach(clearTimeout);
      offs.forEach((fn) => fn());
    }
  };
}

export function makeCanvas(host, { paper } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pr-canvas';
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const view = { w: 0, h: 0, dpr: 1 };
  function fit() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let snapshot = null;
    if (paper && canvas.width) {
      snapshot = document.createElement('canvas');
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d').drawImage(canvas, 0, 0);
    }
    const oldW = view.w;
    const oldH = view.h;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (paper) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, view.w, view.h);
      if (snapshot) ctx.drawImage(snapshot, 0, 0, oldW, oldH);
    }
  }
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  return {
    canvas,
    ctx,
    view,
    destroy() {
      ro.disconnect();
      canvas.remove();
    }
  };
}

export function loop(fn) {
  let id = 0;
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    fn(dt, t);
    id = requestAnimationFrame(frame);
  }
  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
}

export function pointIn(e, el) {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function drawSky(ctx, view, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, view.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
}

export function drawCloud(ctx, x, y, s, color = 'rgba(255,255,255,0.9)') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y - 10 * s, 28 * s, 0, Math.PI * 2);
  ctx.arc(x + 56 * s, y, 22 * s, 0, Math.PI * 2);
  ctx.rect(x, y, 56 * s, 22 * s);
  ctx.fill();
}

export function outlinedText(ctx, text, x, y, size, { fill = INK, stroke = PAPER, width = 8, align = 'center', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${Math.round(size)}px ${DISPLAY_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function hintText(ctx, view, text, alpha) {
  let size = Math.min(40, view.w * 0.08);
  ctx.font = `900 ${Math.round(size)}px ${DISPLAY_FONT}`;
  const width = ctx.measureText(text).width;
  if (width > view.w * 0.9) size *= (view.w * 0.9) / width;
  outlinedText(ctx, text, view.w / 2, view.h * 0.42, size, { alpha, width: Math.max(4, size * 0.2) });
}

export function hearts(ctx, x, y, size, count, max) {
  for (let i = 0; i < max; i++) {
    const cx = x + i * size * 1.15;
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(size / 24, size / 24);
    ctx.beginPath();
    ctx.moveTo(12, 21);
    ctx.bezierCurveTo(-6, 9, 3, -3, 12, 5);
    ctx.bezierCurveTo(21, -3, 30, 9, 12, 21);
    ctx.closePath();
    ctx.fillStyle = i < count ? '#ff4d6d' : 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- Input ---------- */

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar']);

export function trackKeys(s) {
  const down = new Set();
  s.on(window, 'keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, button')) {
      if (e.key === ' ') return;
    }
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    down.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  s.on(window, 'keyup', (e) => {
    down.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  s.on(window, 'blur', () => down.clear());
  return {
    has: (...keys) => keys.some((k) => down.has(k)),
    clear: () => down.clear()
  };
}

/* On-screen buttons for touch play. Each button follows its own pointer so two thumbs work at once. */
export function touchPad(host, s, layout) {
  const pad = document.createElement('div');
  pad.className = 'pr-pad';
  const state = {};
  for (const side of ['left', 'right']) {
    const group = document.createElement('div');
    group.className = `pr-pad-group pr-pad-${side}`;
    for (const btn of layout[side] || []) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pr-pad-btn';
      el.setAttribute('aria-label', btn.label);
      el.innerHTML = btn.icon;
      state[btn.key] = false;
      const press = (e) => {
        e.preventDefault();
        state[btn.key] = true;
        el.classList.add('down');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture unsupported */
        }
      };
      const release = () => {
        state[btn.key] = false;
        el.classList.remove('down');
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      group.append(el);
    }
    pad.append(group);
  }
  host.append(pad);
  s.add(() => pad.remove());
  return state;
}

export const ARROW_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ARROW_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ARROW_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15 8-8 8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- In-game panels ---------- */

export function panel(host, { title, text, button, onClick }) {
  const wrap = document.createElement('div');
  wrap.className = 'pr-panel';
  const card = document.createElement('div');
  card.className = 'pr-panel-card';
  const h = document.createElement('h3');
  h.textContent = title;
  card.append(h);
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    card.append(p);
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pr-big-btn';
  b.textContent = button;
  b.addEventListener('click', () => {
    wrap.remove();
    onClick();
  });
  card.append(b);
  wrap.append(card);
  host.append(wrap);
  b.focus({ preventScroll: true });
  return () => wrap.remove();
}
