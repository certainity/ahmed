import {
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  DISPLAY_FONT,
  INK,
  PAPER,
  Sound,
  clamp,
  coarsePointer,
  drawCloud,
  hearts,
  hintText,
  loop,
  makeCanvas,
  outlinedText,
  say,
  scope,
  touchPad,
  trackKeys
} from './kit.js';

const ROWS = 14;
const GROUND = 12;
const MAX_LIVES = 5;
const SOLID = new Set(['#', 'B', 'X', '?', 'U']);

// Physics in tiles and seconds. Jump apex is about 4 tiles; gaps in level chunks never exceed 4.
const GRAVITY = 55;
const JUMP_V = 20.5;
const RUN = 7.5;
const MAX_FALL = 18;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLevel(n) {
  const rng = mulberry32(n * 9973 + 17);
  const R = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const MAXW = 700;
  const grid = Array.from({ length: ROWS }, () => new Array(MAXW).fill('.'));
  const coins = [];
  const enemies = [];
  const checkpoints = [];
  const set = (x, y, ch) => {
    if (x >= 0 && x < MAXW && y >= 0 && y < ROWS) grid[y][x] = ch;
  };
  const ground = (x0, x1) => {
    for (let x = x0; x <= x1; x++) {
      set(x, GROUND, '#');
      set(x, GROUND + 1, '#');
    }
  };
  const column = (x, h) => {
    for (let k = 1; k <= h; k++) set(x, GROUND - k, 'X');
  };
  const coin = (x, y) => coins.push({ x: x + 0.5, y: y + 0.5, taken: false });
  const enemy = (x, y = GROUND) =>
    enemies.push({ x: x + 0.05, y: y - 0.8, w: 0.9, h: 0.8, vx: -(1.8 + Math.min(n, 6) * 0.25), vy: 0, dead: 0, active: false, onGround: false });

  const CHUNKS = [
    {
      weight: 3,
      build(x) {
        ground(x, x + 7);
        for (let i = 2; i <= 5; i++) coin(x + i, i === 3 || i === 4 ? 8 : 9);
        return 8;
      }
    },
    {
      weight: 3,
      build(x) {
        ground(x, x + 9);
        enemy(x + 6);
        if (n >= 2) enemy(x + 8);
        return 10;
      }
    },
    {
      weight: 2,
      build(x) {
        const gap = Math.min(2 + R(0, 1) + (n >= 3 ? 1 : 0), 4);
        ground(x, x + 1);
        ground(x + 2 + gap, x + 4 + gap);
        for (let i = 0; i < gap; i++) coin(x + 2 + i, 8);
        return 5 + gap;
      }
    },
    {
      weight: 3,
      build(x) {
        ground(x, x + 10);
        ['B', '?', 'B', '?', 'B'].forEach((ch, i) => set(x + 3 + i, 8, ch));
        if (n >= 2 && rng() < 0.6) enemy(x + 9);
        return 11;
      }
    },
    {
      weight: 2,
      build(x) {
        const h = R(3, 4);
        ground(x, x + 11);
        for (let i = 0; i < h; i++) column(x + 2 + i, i + 1);
        column(x + 2 + h, h);
        for (let i = 0; i < h; i++) column(x + 3 + h + i, h - i);
        for (let i = 0; i < 3; i++) coin(x + 1 + h + i, GROUND - h - 1);
        return 12;
      }
    },
    {
      weight: n >= 2 ? 2 : 1,
      build(x) {
        ground(x, x + 1);
        set(x + 3, 10, '=');
        set(x + 4, 10, '=');
        set(x + 6, 9, '=');
        set(x + 7, 9, '=');
        coin(x + 6, 8);
        coin(x + 7, 8);
        ground(x + 10, x + 12);
        return 13;
      }
    },
    {
      weight: 2,
      build(x) {
        ground(x, x + 9);
        for (let i = 2; i <= 6; i++) {
          set(x + i, 9, '=');
          coin(x + i, 8);
        }
        set(x + 4, 5, '?');
        if (n >= 3) enemy(x + 8);
        return 10;
      }
    }
  ];
  const total = CHUNKS.reduce((sum, c) => sum + c.weight, 0);
  const pickChunk = () => {
    let r = rng() * total;
    for (const c of CHUNKS) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return CHUNKS[0];
  };

  ground(0, 9);
  let x = 10;
  const count = 8 + n * 2;
  let last = null;
  for (let i = 0; i < count; i++) {
    if (i === Math.floor(count / 2)) {
      ground(x, x + 3);
      checkpoints.push({ x: x + 1, reached: false });
      x += 4;
    }
    let chunk = pickChunk();
    if (chunk === last) chunk = pickChunk();
    last = chunk;
    x += chunk.build(x);
  }
  ground(x, x + 19);
  for (let i = 0; i < 6; i++) column(x + 2 + i, i + 1);
  const flagX = x + 12;
  const houseX = x + 15;
  const w = x + 20;
  return {
    n,
    w,
    grid: grid.map((row) => row.slice(0, w)),
    coins,
    enemies,
    checkpoints,
    flagX,
    houseX,
    start: { x: 2, y: GROUND - 1 }
  };
}

export function platformGame(arena, api) {
  const s = scope();
  const cv = makeCanvas(arena);
  const { ctx, view } = cv;
  const keys = trackKeys(s);
  const touch = coarsePointer();
  const pad = touch
    ? touchPad(arena, s, {
        left: [
          { key: 'left', label: 'Run left', icon: ARROW_LEFT },
          { key: 'right', label: 'Run right', icon: ARROW_RIGHT }
        ],
        right: [{ key: 'jump', label: 'Jump', icon: ARROW_UP }]
      })
    : { left: false, right: false, jump: false };

  let levelNo = 1;
  let lives = MAX_LIVES;
  let score = 0;
  let coinCount = 0;
  let lvl = null;
  let camX = 0;
  let paused = false;
  let hint = 1;
  let prevJump = false;
  let pops = [];
  let bits = [];
  let respawnAt = null;
  const bumps = new Map();
  const player = { x: 0, y: 0, w: 0.72, h: 0.92, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, face: 1, inv: 0, squash: 0, run: 0 };

  // On tall touch screens the spare height below the level becomes a tray for the buttons, so they never cover Pip.
  const padSpace = () => (touch ? clamp(view.h - ROWS * (view.w / 11), 0, 100) : 0);
  const tileSize = () => Math.max(14, Math.min((view.h - padSpace()) / ROWS, view.w / 11));
  const offsetY = () => view.h - padSpace() - ROWS * tileSize();
  const viewTiles = () => view.w / tileSize();

  function tileAt(cx, cy) {
    if (cx < 0 || cx >= lvl.w) return '#';
    if (cy < 0 || cy >= ROWS) return '.';
    return lvl.grid[cy][cx];
  }

  function placePlayer(x, y) {
    player.x = x;
    player.y = y - player.h + 1;
    player.vx = 0;
    player.vy = 0;
    player.inv = 2;
    camX = clamp(player.x - viewTiles() * 0.4, 0, Math.max(0, lvl.w - viewTiles()));
  }

  function startLevel(n) {
    levelNo = n;
    lvl = makeLevel(n);
    respawnAt = { ...lvl.start };
    pops = [];
    bits = [];
    bumps.clear();
    placePlayer(lvl.start.x, lvl.start.y);
    paused = false;
  }

  function newGame() {
    lives = MAX_LIVES;
    score = 0;
    coinCount = 0;
    api.setScore(0);
    startLevel(1);
  }

  function addScore(n) {
    score += n;
    api.setScore(score);
  }

  function moveX(body, dt) {
    body.x += body.vx * dt;
    const top = Math.floor(body.y + 0.02);
    const bottom = Math.floor(body.y + body.h - 0.02);
    let hit = false;
    if (body.vx > 0) {
      const cx = Math.floor(body.x + body.w);
      for (let cy = top; cy <= bottom; cy++) {
        if (SOLID.has(tileAt(cx, cy))) {
          body.x = cx - body.w - 0.001;
          hit = true;
          break;
        }
      }
    } else if (body.vx < 0) {
      const cx = Math.floor(body.x);
      for (let cy = top; cy <= bottom; cy++) {
        if (SOLID.has(tileAt(cx, cy))) {
          body.x = cx + 1.001;
          hit = true;
          break;
        }
      }
    }
    if (hit) body.vx = 0;
    return hit;
  }

  function moveY(body, dt, onHead) {
    const prevBottom = body.y + body.h;
    body.y += body.vy * dt;
    body.onGround = false;
    const left = Math.floor(body.x + 0.02);
    const right = Math.floor(body.x + body.w - 0.02);
    if (body.vy > 0) {
      const cy = Math.floor(body.y + body.h);
      for (let cx = left; cx <= right; cx++) {
        const ch = tileAt(cx, cy);
        if (SOLID.has(ch) || (ch === '=' && prevBottom <= cy + 0.05)) {
          body.y = cy - body.h;
          body.vy = 0;
          body.onGround = true;
          break;
        }
      }
    } else if (body.vy < 0) {
      const cy = Math.floor(body.y);
      const center = Math.floor(body.x + body.w / 2);
      const order = [center, left, right];
      for (const cx of order) {
        if (SOLID.has(tileAt(cx, cy))) {
          body.y = cy + 1;
          body.vy = 0;
          if (onHead) onHead(cx, cy);
          break;
        }
      }
    }
  }

  function headBump(cx, cy) {
    const ch = tileAt(cx, cy);
    bumps.set(`${cx},${cy}`, 0.18);
    if (ch === '?') {
      lvl.grid[cy][cx] = 'U';
      pops.push({ x: cx + 0.5, y: cy - 0.5, life: 0.6 });
      coinCount++;
      addScore(10);
      Sound.coin();
    } else {
      Sound.stomp();
    }
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 0.6, color });
    }
  }

  function hurt() {
    if (player.inv > 0 || paused) return;
    lives--;
    Sound.hurt();
    burst(player.x + player.w / 2, player.y + player.h / 2, '#ff9f1c', 14);
    if (lives <= 0) {
      paused = true;
      say('Game over. Try again!');
      api.panel({ title: 'Game over', text: `You reached level ${levelNo} with ${coinCount} coins.`, button: 'Play again', onClick: newGame });
      return;
    }
    say('Oops! Try again');
    placePlayer(respawnAt.x, respawnAt.y);
  }

  function finishLevel() {
    paused = true;
    addScore(200);
    Sound.win();
    api.celebrate();
    say(`Level ${levelNo} done!`);
    api.panel({
      title: `Level ${levelNo} done!`,
      text: `${coinCount} coins so far. Ready for the next one?`,
      button: `Play level ${levelNo + 1}`,
      onClick: () => startLevel(levelNo + 1)
    });
  }

  function updatePlayer(dt) {
    const left = keys.has('ArrowLeft', 'a') || pad.left;
    const right = keys.has('ArrowRight', 'd') || pad.right;
    const jumpHeld = keys.has(' ', 'ArrowUp', 'w', 'z') || pad.jump;
    if (jumpHeld && !prevJump) player.buffer = 0.13;
    if (!jumpHeld && prevJump && player.vy < 0) player.vy *= 0.45;
    prevJump = jumpHeld;

    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const accel = player.onGround ? 42 : 28;
    if (dir) {
      player.vx = clamp(player.vx + dir * accel * dt, -RUN, RUN);
      player.face = dir;
      hint = Math.min(hint, 0.99);
    } else {
      const drop = (player.onGround ? 34 : 10) * dt;
      player.vx = Math.abs(player.vx) <= drop ? 0 : player.vx - Math.sign(player.vx) * drop;
    }
    player.coyote = player.onGround ? 0.1 : Math.max(0, player.coyote - dt);
    player.buffer = Math.max(0, player.buffer - dt);
    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = -JUMP_V;
      player.buffer = 0;
      player.coyote = 0;
      player.squash = -0.25;
      Sound.jump();
    }
    const wasAir = !player.onGround;
    for (let k = 0; k < 2; k++) {
      player.vy = Math.min(MAX_FALL, player.vy + (GRAVITY * dt) / 2);
      moveX(player, dt / 2);
      moveY(player, dt / 2, headBump);
    }
    if (wasAir && player.onGround) player.squash = 0.2;
    player.squash *= Math.pow(0.001, dt);
    player.run += Math.abs(player.vx) * dt;
    player.inv = Math.max(0, player.inv - dt);
    if (player.y > ROWS + 1) {
      player.inv = 0;
      hurt();
    }
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateWorld(dt) {
    const vt = viewTiles();
    for (const e of lvl.enemies) {
      if (e.dead > 0) {
        e.dead -= dt;
        continue;
      }
      if (e.dead < 0) continue;
      if (!e.active && e.x < camX + vt + 2) e.active = true;
      if (!e.active) continue;
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
      const v = e.vx;
      if (moveX(e, dt)) e.vx = -v;
      moveY(e, dt);
      if (e.onGround) {
        const fx = e.vx > 0 ? Math.floor(e.x + e.w + 0.05) : Math.floor(e.x - 0.05);
        const below = tileAt(fx, Math.floor(e.y + e.h + 0.1));
        if (!SOLID.has(below) && below !== '=') e.vx = -e.vx;
      }
      if (e.y > ROWS + 2) e.dead = -1;
      if (overlaps(player, e)) {
        const stomp = player.vy > 0 && player.y + player.h - e.y < 0.5;
        if (stomp) {
          e.dead = 0.5;
          player.vy = -13;
          addScore(50);
          Sound.stomp();
          burst(e.x + e.w / 2, e.y + e.h / 2, '#b39cff', 8);
        } else {
          hurt();
        }
      }
    }
    for (const c of lvl.coins) {
      if (c.taken) continue;
      if (Math.abs(player.x + player.w / 2 - c.x) < 0.65 && Math.abs(player.y + player.h / 2 - c.y) < 0.75) {
        c.taken = true;
        coinCount++;
        addScore(10);
        Sound.coin();
        pops.push({ x: c.x, y: c.y, life: 0.4 });
      }
    }
    for (const cp of lvl.checkpoints) {
      if (!cp.reached && player.x > cp.x) {
        cp.reached = true;
        respawnAt = { x: cp.x, y: GROUND - 1 };
        Sound.ding();
        api.cheer('Checkpoint!');
      }
    }
    if (player.x + player.w > lvl.flagX + 0.3) finishLevel();
    for (const p of pops) {
      p.y -= 3 * dt;
      p.life -= dt;
    }
    pops = pops.filter((p) => p.life > 0);
    for (const b of bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 20 * dt;
      b.life -= dt;
    }
    bits = bits.filter((b) => b.life > 0);
    for (const [k, v] of bumps) {
      if (v - dt <= 0) bumps.delete(k);
      else bumps.set(k, v - dt);
    }
    const targetCam = clamp(player.x - vt * 0.4, 0, Math.max(0, lvl.w - vt));
    camX += (targetCam - camX) * Math.min(1, dt * 8);
  }

  /* ---------- drawing ---------- */

  function drawBackdrop(t) {
    const T = tileSize();
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#7cc8ff');
    g.addColorStop(1, '#e2f4ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    const base = offsetY() + GROUND * T;
    for (let i = -1; i < view.w / (T * 5) + 2; i++) {
      const off = (camX * T * 0.15) % (T * 9);
      drawCloud(ctx, i * T * 9 - off + ((i * 37) % 5) * T, offsetY() + T * (1.5 + (i % 3)), T / 30);
    }
    const hills = [
      { speed: 0.25, color: '#a8e6b8', r: 5, gap: 11 },
      { speed: 0.5, color: '#7fd394', r: 3.4, gap: 8 }
    ];
    for (const h of hills) {
      ctx.fillStyle = h.color;
      const off = (camX * T * h.speed) % (h.gap * T);
      for (let i = -1; i < view.w / (h.gap * T) + 2; i++) {
        ctx.beginPath();
        ctx.arc(i * h.gap * T - off, base, h.r * T, Math.PI, 0);
        ctx.fill();
      }
    }
  }

  function drawTile(ch, cx, cy, sx, sy, T, t) {
    const bump = bumps.get(`${cx},${cy}`);
    if (bump) sy -= Math.sin((bump / 0.18) * Math.PI) * T * 0.25;
    ctx.lineWidth = Math.max(1.5, T * 0.06);
    ctx.strokeStyle = INK;
    if (ch === '#') {
      const top = tileAt(cx, cy - 1) !== '#';
      ctx.fillStyle = '#c98a4f';
      ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
      ctx.fillStyle = '#b07440';
      ctx.fillRect(sx + T * 0.2, sy + T * 0.55, T * 0.12, T * 0.12);
      ctx.fillRect(sx + T * 0.65, sy + T * 0.75, T * 0.1, T * 0.1);
      if (top) {
        ctx.fillStyle = '#4cc96f';
        ctx.fillRect(sx, sy, T + 0.5, T * 0.3);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + T + 0.5, sy);
        ctx.stroke();
      }
    } else if (ch === 'X') {
      ctx.fillStyle = '#c3bdd6';
      ctx.fillRect(sx, sy, T, T);
      ctx.fillStyle = '#e4e0ef';
      ctx.fillRect(sx + T * 0.1, sy + T * 0.1, T * 0.8, T * 0.15);
      ctx.strokeRect(sx, sy, T, T);
    } else if (ch === 'B') {
      ctx.fillStyle = '#e57240';
      ctx.fillRect(sx, sy, T, T);
      ctx.strokeStyle = '#a3471f';
      ctx.beginPath();
      ctx.moveTo(sx, sy + T / 2);
      ctx.lineTo(sx + T, sy + T / 2);
      ctx.moveTo(sx + T / 2, sy);
      ctx.lineTo(sx + T / 2, sy + T / 2);
      ctx.moveTo(sx + T / 4, sy + T / 2);
      ctx.lineTo(sx + T / 4, sy + T);
      ctx.moveTo(sx + (T * 3) / 4, sy + T / 2);
      ctx.lineTo(sx + (T * 3) / 4, sy + T);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.strokeRect(sx, sy, T, T);
    } else if (ch === '?' || ch === 'U') {
      ctx.fillStyle = ch === '?' ? '#ffc93c' : '#c9935a';
      ctx.fillRect(sx, sy, T, T);
      ctx.strokeRect(sx + 1, sy + 1, T - 2, T - 2);
      if (ch === '?') {
        ctx.font = `900 ${Math.round(T * 0.7)}px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PAPER;
        ctx.lineWidth = Math.max(2, T * 0.08);
        ctx.strokeText('?', sx + T / 2, sy + T / 2 + Math.sin(t / 250) * T * 0.04);
        ctx.fillText('?', sx + T / 2, sy + T / 2 + Math.sin(t / 250) * T * 0.04);
      }
    } else if (ch === '=') {
      ctx.fillStyle = '#a8673a';
      ctx.fillRect(sx, sy, T + 0.5, T * 0.38);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + T, sy);
      ctx.moveTo(sx, sy + T * 0.38);
      ctx.lineTo(sx + T, sy + T * 0.38);
      ctx.stroke();
    }
  }

  function drawCoin(x, y, T, t) {
    const wob = Math.abs(Math.cos(t / 200 + x));
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, T * 0.06);
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(2, T * 0.3 * wob), T * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawEnemy(e, T, t) {
    const sx = (e.x - camX) * T;
    const sy = offsetY() + e.y * T;
    const w = e.w * T;
    const h = e.h * T;
    ctx.save();
    ctx.translate(sx + w / 2, sy + h);
    if (e.dead > 0) ctx.scale(1.2, 0.3);
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = INK;
    const step = Math.sin(t / 90 + e.x) * T * 0.08;
    ctx.fillStyle = '#5a3da8';
    ctx.beginPath();
    ctx.ellipse(-w * 0.25, -T * 0.05 + step, w * 0.2, T * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.25, -T * 0.05 - step, w * 0.2, T * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a5ce6';
    ctx.beginPath();
    ctx.moveTo(-w / 2, -T * 0.08);
    ctx.bezierCurveTo(-w / 2, -h * 1.3, w / 2, -h * 1.3, w / 2, -T * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const look = e.vx > 0 ? 1 : -1;
    for (const ex of [-0.18, 0.18]) {
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(ex * w, -h * 0.55, T * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, T * 0.04);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex * w + look * T * 0.04, -h * 0.55, T * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPip(T, t) {
    if (player.inv > 0 && Math.floor(t / 100) % 2 === 0) return;
    const cx = (player.x + player.w / 2 - camX) * T;
    const by = offsetY() + (player.y + player.h) * T;
    const w = player.w * T;
    const h = player.h * T;
    const sq = clamp(player.squash, -0.3, 0.3);
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(1 + sq, 1 - sq);
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    const step = player.onGround && Math.abs(player.vx) > 0.5 ? Math.sin(player.run * 3) * T * 0.1 : 0;
    ctx.fillStyle = '#3d7fff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.22, -T * 0.06 - Math.max(0, step), w * 0.2, T * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.22, -T * 0.06 - Math.max(0, -step), w * 0.2, T * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.52, w * 0.56, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // scarf with a tail that trails behind
    ctx.fillStyle = '#ff5c8a';
    ctx.fillRect(-w * 0.5, -h * 0.42, w, h * 0.12);
    ctx.strokeRect(-w * 0.5, -h * 0.42, w, h * 0.12);
    const flap = Math.sin(t / 80) * T * 0.08;
    ctx.beginPath();
    ctx.moveTo(-player.face * w * 0.45, -h * 0.38);
    ctx.lineTo(-player.face * w * 0.95, -h * 0.45 + flap);
    ctx.lineTo(-player.face * w * 0.9, -h * 0.28 + flap);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const ex of [-0.05, 0.25]) {
      const x = (ex + 0.05) * w * player.face;
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.ellipse(x, -h * 0.68, w * 0.14, h * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, T * 0.04);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x + player.face * w * 0.05, -h * 0.66, w * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlag(T, t) {
    const x = (lvl.flagX + 0.5 - camX) * T;
    const top = offsetY() + (GROUND - 9) * T;
    const base = offsetY() + GROUND * T;
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#eceaf5';
    ctx.fillRect(x - T * 0.08, top, T * 0.16, base - top);
    ctx.strokeRect(x - T * 0.08, top, T * 0.16, base - top);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x, top, T * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const wave = Math.sin(t / 200) * T * 0.15;
    ctx.fillStyle = '#ff5c8a';
    ctx.beginPath();
    ctx.moveTo(x + T * 0.08, top + T * 0.3);
    ctx.quadraticCurveTo(x + T * 0.9, top + T * 0.5 + wave, x + T * 1.6, top + T * 0.9);
    ctx.lineTo(x + T * 0.08, top + T * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const hx = (lvl.houseX - camX) * T;
    ctx.fillStyle = '#fff1c4';
    ctx.fillRect(hx, base - T * 3, T * 4, T * 3);
    ctx.strokeRect(hx, base - T * 3, T * 4, T * 3);
    ctx.fillStyle = '#ff5c5c';
    ctx.beginPath();
    ctx.moveTo(hx - T * 0.4, base - T * 3);
    ctx.lineTo(hx + T * 2, base - T * 5);
    ctx.lineTo(hx + T * 4.4, base - T * 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(hx + T * 1.5, base - T * 1.7, T, T * 1.7);
    ctx.strokeRect(hx + T * 1.5, base - T * 1.7, T, T * 1.7);
  }

  function drawCheckpoints(T) {
    for (const cp of lvl.checkpoints) {
      const x = (cp.x + 0.5 - camX) * T;
      const base = offsetY() + GROUND * T;
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, T * 0.06);
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - T * 2.2);
      ctx.stroke();
      ctx.fillStyle = cp.reached ? '#4cc96f' : '#c3bdd6';
      ctx.beginPath();
      ctx.moveTo(x, base - T * 2.2);
      ctx.lineTo(x + T * 0.9, base - T * 1.9);
      ctx.lineTo(x, base - T * 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function draw(t) {
    const T = tileSize();
    drawBackdrop(t);
    const x0 = Math.max(0, Math.floor(camX) - 1);
    const x1 = Math.min(lvl.w - 1, Math.ceil(camX + viewTiles()) + 1);
    const oy = offsetY();
    drawCheckpoints(T);
    drawFlag(T, t);
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const ch = lvl.grid[cy][cx];
        if (ch !== '.') drawTile(ch, cx, cy, Math.floor((cx - camX) * T), Math.floor(oy + cy * T), T, t);
      }
    }
    for (const c of lvl.coins) {
      if (!c.taken && c.x > x0 && c.x < x1 + 1) drawCoin((c.x - camX) * T, oy + c.y * T, T, t);
    }
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      drawCoin((p.x - camX) * T, oy + p.y * T, T, t * 3);
      ctx.globalAlpha = 1;
    }
    for (const e of lvl.enemies) {
      if (e.dead >= 0 && e.x > x0 - 1 && e.x < x1 + 1) drawEnemy(e, T, t);
    }
    drawPip(T, t);
    for (const b of bits) {
      ctx.globalAlpha = Math.max(0, b.life / 0.6);
      ctx.fillStyle = b.color;
      ctx.fillRect((b.x - camX) * T - 3, oy + b.y * T - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    const tray = padSpace();
    if (tray > 0) {
      ctx.fillStyle = '#8b5a33';
      ctx.fillRect(0, view.h - tray, view.w, tray);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, view.h - tray);
      ctx.lineTo(view.w, view.h - tray);
      ctx.stroke();
    }
    hearts(ctx, 14, 14, 24, lives, MAX_LIVES);
    drawCoin(view.w - 92, 28, 28, 0);
    outlinedText(ctx, `× ${coinCount}`, view.w - 74, 29, 22, { align: 'left', width: 6 });
    if (view.w < 520) outlinedText(ctx, `Level ${levelNo}`, 14, 58, 18, { align: 'left', width: 5 });
    else outlinedText(ctx, `Level ${levelNo}`, view.w / 2, 28, 22, { width: 6 });
    if (hint > 0 && !paused) {
      hintText(ctx, view, touch ? 'Use the arrows to run and jump!' : 'Arrow keys to run, Space to jump!', hint);
    }
  }

  newGame();

  s.add(
    loop((dt, t) => {
      if (!paused) {
        updatePlayer(dt);
        if (!paused) updateWorld(dt);
      }
      if (hint < 1) hint = Math.max(0, hint - dt * 1.2);
      draw(t);
    })
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}
