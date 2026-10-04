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
  drawStrip,
  glowSprite,
  hearts,
  hintText,
  imageReady,
  loadImage,
  loop,
  makeCanvas,
  makeLayer,
  makeShake,
  mirrorStrip,
  outlinedText,
  say,
  scope,
  touchPad,
  trackKeys
} from './kit.js';
import landscapeArt from './art/jump-bg.webp';

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
  const landscape = loadImage(landscapeArt);
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
  let dust = [];
  let dustTimer = 0;
  const shake = makeShake();
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

  function burst(x, y, color, n = 10, sparkle = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 0.6, color, sparkle, spin: Math.random() * 6 });
    }
  }

  function puff(x, y, n, spread = 1) {
    for (let i = 0; i < n; i++) {
      dust.push({ x: x + (Math.random() - 0.5) * 0.4 * spread, y, vx: (Math.random() - 0.5) * 2.5 * spread, vy: -Math.random() * 1.2, r: 0.12 + Math.random() * 0.12, life: 0.45, max: 0.45 });
    }
  }

  function hurt() {
    if (player.inv > 0 || paused) return;
    lives--;
    Sound.hurt();
    shake.kick(14);
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
    if (wasAir && player.onGround) {
      player.squash = 0.2;
      puff(player.x + player.w / 2, player.y + player.h, 6, 1.4);
    }
    dustTimer -= dt;
    if (player.onGround && Math.abs(player.vx) > 4 && dustTimer <= 0) {
      dustTimer = 0.14;
      puff(player.x + player.w / 2 - player.face * 0.3, player.y + player.h, 1);
    }
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
          burst(e.x + e.w / 2, e.y, '#ffe27a', 6, true);
          shake.kick(4);
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
    for (const d of dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.r += dt * 0.5;
      d.life -= dt;
    }
    dust = dust.filter((d) => d.life > 0);
    for (const [k, v] of bumps) {
      if (v - dt <= 0) bumps.delete(k);
      else bumps.set(k, v - dt);
    }
    const targetCam = clamp(player.x - vt * 0.4, 0, Math.max(0, lvl.w - vt));
    camX += (targetCam - camX) * Math.min(1, dt * 8);
  }

  /* ---------- drawing ---------- */

  const skyLayer = makeLayer(cv);
  const stripLayer = makeLayer(cv);
  const bushLayer = makeLayer(cv);
  const tileCache = new Map();
  let tileCacheKey = '';

  function bevel(x, w, h, light, dark) {
    x.fillStyle = light;
    x.fillRect(0, 0, w, h * 0.12);
    x.fillRect(0, 0, w * 0.1, h);
    x.fillStyle = dark;
    x.fillRect(0, h * 0.88, w, h * 0.12);
    x.fillRect(w * 0.9, 0, w * 0.1, h);
  }

  function rivets(x, T, color) {
    x.fillStyle = color;
    for (const [rx, ry] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
      x.beginPath();
      x.arc(rx * T, ry * T, T * 0.05, 0, Math.PI * 2);
      x.fill();
    }
  }

  const TILE_PAINTERS = {
    dirt(x, T, { top, left, right }) {
      x.fillStyle = '#c98a4f';
      x.fillRect(0, 0, T, T);
      x.fillStyle = 'rgba(120,70,30,0.35)';
      for (const [px, py, pr] of [[0.22, 0.55, 0.06], [0.68, 0.72, 0.05], [0.45, 0.88, 0.04], [0.82, 0.42, 0.04]]) {
        x.beginPath();
        x.ellipse(px * T, py * T, pr * T * 1.4, pr * T, 0, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = 'rgba(255,240,210,0.35)';
      x.beginPath();
      x.arc(0.26 * T, 0.5 * T, 0.025 * T, 0, Math.PI * 2);
      x.fill();
      if (top) {
        const gg = x.createLinearGradient(0, 0, 0, T * 0.36);
        gg.addColorStop(0, '#7fe39a');
        gg.addColorStop(1, '#3fbf66');
        x.fillStyle = gg;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(T, 0);
        x.lineTo(T, T * 0.26);
        for (let i = 4; i >= 0; i--) {
          x.quadraticCurveTo((i + 0.5) * (T / 5), T * 0.42, i * (T / 5), T * 0.26);
        }
        x.closePath();
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.35)';
        x.fillRect(0, T * 0.04, T, T * 0.05);
        x.strokeStyle = INK;
        x.lineWidth = Math.max(1.5, T * 0.06);
        x.beginPath();
        x.moveTo(0, x.lineWidth / 2);
        x.lineTo(T, x.lineWidth / 2);
        x.stroke();
      }
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, T * 0.06);
      if (left) {
        x.beginPath();
        x.moveTo(x.lineWidth / 2, 0);
        x.lineTo(x.lineWidth / 2, T);
        x.stroke();
      }
      if (right) {
        x.beginPath();
        x.moveTo(T - x.lineWidth / 2, 0);
        x.lineTo(T - x.lineWidth / 2, T);
        x.stroke();
      }
    },
    stone(x, T) {
      const g = x.createLinearGradient(0, 0, T, T);
      g.addColorStop(0, '#d9d4e8');
      g.addColorStop(1, '#a9a2c2');
      x.fillStyle = g;
      x.fillRect(0, 0, T, T);
      bevel(x, T, T, 'rgba(255,255,255,0.45)', 'rgba(60,50,100,0.25)');
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, T * 0.06);
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, T - x.lineWidth, T - x.lineWidth);
    },
    brick(x, T) {
      const g = x.createLinearGradient(0, 0, 0, T);
      g.addColorStop(0, '#f08a55');
      g.addColorStop(1, '#d35f2c');
      x.fillStyle = g;
      x.fillRect(0, 0, T, T);
      x.fillStyle = 'rgba(255,255,255,0.28)';
      x.fillRect(0, T * 0.04, T, T * 0.07);
      x.fillRect(0, T * 0.54, T, T * 0.07);
      x.strokeStyle = '#9c4019';
      x.lineWidth = Math.max(1, T * 0.05);
      x.beginPath();
      x.moveTo(0, T / 2);
      x.lineTo(T, T / 2);
      x.moveTo(T / 2, 0);
      x.lineTo(T / 2, T / 2);
      x.moveTo(T / 4, T / 2);
      x.lineTo(T / 4, T);
      x.moveTo((T * 3) / 4, T / 2);
      x.lineTo((T * 3) / 4, T);
      x.stroke();
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, T * 0.06);
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, T - x.lineWidth, T - x.lineWidth);
    },
    question(x, T) {
      const g = x.createLinearGradient(0, 0, 0, T);
      g.addColorStop(0, '#ffe680');
      g.addColorStop(1, '#ffb21f');
      x.fillStyle = g;
      x.fillRect(0, 0, T, T);
      bevel(x, T, T, 'rgba(255,255,255,0.55)', 'rgba(170,90,0,0.35)');
      rivets(x, T, '#c97d0c');
      x.font = `900 ${Math.round(T * 0.68)}px ${DISPLAY_FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = 'rgba(150,80,0,0.55)';
      x.fillText('?', T / 2 + T * 0.04, T / 2 + T * 0.07);
      x.lineJoin = 'round';
      x.lineWidth = Math.max(2, T * 0.08);
      x.strokeStyle = INK;
      x.strokeText('?', T / 2, T / 2 + T * 0.03);
      x.fillStyle = PAPER;
      x.fillText('?', T / 2, T / 2 + T * 0.03);
      x.lineWidth = Math.max(1.5, T * 0.06);
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, T - x.lineWidth, T - x.lineWidth);
    },
    used(x, T) {
      const g = x.createLinearGradient(0, 0, 0, T);
      g.addColorStop(0, '#d9a066');
      g.addColorStop(1, '#a8682f');
      x.fillStyle = g;
      x.fillRect(0, 0, T, T);
      bevel(x, T, T, 'rgba(255,255,255,0.3)', 'rgba(90,40,0,0.3)');
      rivets(x, T, '#7a4a2a');
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, T * 0.06);
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, T - x.lineWidth, T - x.lineWidth);
    },
    plank(x, T) {
      const h = T * 0.4;
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#d39a62');
      g.addColorStop(1, '#9a5f33');
      x.fillStyle = g;
      x.fillRect(0, 0, T, h);
      x.strokeStyle = 'rgba(90,45,15,0.45)';
      x.lineWidth = Math.max(1, T * 0.03);
      x.beginPath();
      x.moveTo(T * 0.08, h * 0.45);
      x.quadraticCurveTo(T * 0.5, h * 0.25, T * 0.92, h * 0.5);
      x.stroke();
      x.fillStyle = '#5b3a24';
      x.beginPath();
      x.arc(T * 0.15, h * 0.5, T * 0.035, 0, Math.PI * 2);
      x.arc(T * 0.85, h * 0.5, T * 0.035, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, T * 0.06);
      x.beginPath();
      x.moveTo(0, x.lineWidth / 2);
      x.lineTo(T, x.lineWidth / 2);
      x.moveTo(0, h - x.lineWidth / 2);
      x.lineTo(T, h - x.lineWidth / 2);
      x.stroke();
    },
    coin(x, T) {
      const r = T * 0.36;
      const c = T / 2;
      const g = x.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
      g.addColorStop(0, '#fff6c2');
      g.addColorStop(0.45, '#ffd23f');
      g.addColorStop(1, '#f0a21a');
      x.fillStyle = g;
      x.beginPath();
      x.arc(c, c, r, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#c97d0c';
      x.lineWidth = Math.max(1, T * 0.05);
      x.beginPath();
      x.arc(c, c, r * 0.68, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.beginPath();
      x.ellipse(c - r * 0.35, c - r * 0.35, r * 0.18, r * 0.1, -0.7, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, T * 0.06);
      x.beginPath();
      x.arc(c, c, r, 0, Math.PI * 2);
      x.stroke();
    }
  };

  function sprite(kind, T, opts = {}) {
    const dpr = view.dpr;
    const cacheKey = `${T.toFixed(2)}@${dpr}`;
    if (cacheKey !== tileCacheKey) {
      tileCache.clear();
      tileCacheKey = cacheKey;
    }
    const key = `${kind}:${opts.top ? 1 : 0}${opts.left ? 1 : 0}${opts.right ? 1 : 0}`;
    let c = tileCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil(T * dpr);
      c.height = Math.ceil(T * dpr);
      const x = c.getContext('2d');
      x.scale(dpr, dpr);
      TILE_PAINTERS[kind](x, T, opts);
      tileCache.set(key, c);
    }
    return c;
  }

  function paintSky(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7cc8ff');
    g.addColorStop(1, '#e2f4ff');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  }

  // A seamless band of round bushes; anything crossing the right edge is drawn again on the left.
  function paintBushes(x, w, h) {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const [color, scale, lift] of [['#58b86f', 1, 0], ['#6fcf84', 0.75, 0.05]]) {
      x.fillStyle = color;
      for (let i = 0; i < 14; i++) {
        const bx = rnd() * w;
        const r = h * (0.25 + rnd() * 0.25) * scale;
        for (const off of [-w, 0, w]) {
          x.beginPath();
          x.arc(bx + off, h - lift * h, r, Math.PI, 0);
          x.arc(bx + off + r * 0.8, h - lift * h, r * 0.75, Math.PI, 0);
          x.fill();
        }
      }
    }
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(0, h - 2, w, 2);
  }

  function drawBackdrop(t) {
    const T = tileSize();
    const base = offsetY() + GROUND * T;
    ctx.drawImage(skyLayer('sky', view.w, view.h, paintSky), 0, 0, view.w, view.h);
    if (imageReady(landscape)) {
      const h = base + T * 0.6;
      const w = (landscape.naturalWidth / landscape.naturalHeight) * h;
      const strip = mirrorStrip(stripLayer, landscape, 'x', w, h);
      drawStrip(ctx, strip, { axis: 'x', size: w, cross: h, offset: camX * T * 0.2, length: view.w });
    } else {
      for (let i = -1; i < view.w / (T * 5) + 2; i++) {
        const off = (camX * T * 0.15) % (T * 9);
        drawCloud(ctx, i * T * 9 - off + ((i * 37) % 5) * T, offsetY() + T * (1.5 + (i % 3)), T / 30);
      }
    }
    const bw = T * 24;
    const bh = T * 1.6;
    const bushes = bushLayer('bushes', bw, bh, paintBushes);
    const period = bw;
    const start = -((((camX * T * 0.55) % period) + period) % period);
    for (let p = start; p < view.w; p += period) ctx.drawImage(bushes, p, base - bh, bw, bh);
  }

  function drawTiles(T, t, x0, x1) {
    const oy = offsetY();
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const ch = lvl.grid[cy][cx];
        if (ch === '.') continue;
        const sx = Math.floor((cx - camX) * T);
        let sy = Math.floor(oy + cy * T);
        const bump = bumps.get(`${cx},${cy}`);
        if (bump) sy -= Math.sin((bump / 0.18) * Math.PI) * T * 0.25;
        if (ch === '#') {
          const opts = { top: tileAt(cx, cy - 1) !== '#', left: tileAt(cx - 1, cy) === '.', right: tileAt(cx + 1, cy) === '.' };
          ctx.drawImage(sprite('dirt', T, opts), sx, sy, Math.ceil(T) + 1, Math.ceil(T) + 1);
        } else if (ch === 'X') ctx.drawImage(sprite('stone', T), sx, sy, T, T);
        else if (ch === 'B') ctx.drawImage(sprite('brick', T), sx, sy, T, T);
        else if (ch === 'U') ctx.drawImage(sprite('used', T), sx, sy, T, T);
        else if (ch === '=') ctx.drawImage(sprite('plank', T), sx, sy, T + 0.6, T);
        else if (ch === '?') {
          const bob = Math.sin(t / 300 + cx) * T * 0.03;
          ctx.drawImage(sprite('question', T), sx, sy + bob, T, T);
          const phase = (t / 1000 + cx * 0.37) % 3;
          if (phase < 0.45) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy + bob, T, T);
            ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.translate(sx - T * 0.4 + (phase / 0.45) * T * 1.8, sy + bob);
            ctx.rotate(0.5);
            ctx.fillRect(-T * 0.08, -T, T * 0.16, T * 3);
            ctx.restore();
          }
        }
      }
    }
  }

  function drawCoinAt(x, y, T, spin) {
    const w = Math.max(0.14, Math.abs(Math.cos(spin)));
    ctx.drawImage(sprite('coin', T), x - (T * w) / 2, y - T / 2, T * w, T);
  }

  function groundBelow(cx, fromY) {
    for (let cy = Math.max(0, Math.floor(fromY)); cy < ROWS; cy++) {
      const ch = tileAt(cx, cy);
      if (SOLID.has(ch) || ch === '=') return cy;
    }
    return null;
  }

  function drawShadow(cxTiles, bottom, widthTiles, T) {
    const gy = groundBelow(Math.floor(cxTiles), bottom - 0.05);
    if (gy == null) return;
    const dist = gy - bottom;
    if (dist > 6) return;
    const k = 1 - dist / 6;
    ctx.fillStyle = `rgba(40,30,20,${0.22 * k})`;
    ctx.beginPath();
    ctx.ellipse((cxTiles - camX) * T, offsetY() + gy * T, (widthTiles * T * (0.5 + 0.3 * k)) / 1.2, T * 0.1 * k + 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemy(e, T, t) {
    const sx = (e.x - camX) * T;
    const sy = offsetY() + e.y * T;
    const w = e.w * T;
    const h = e.h * T;
    if (e.dead <= 0) drawShadow(e.x + e.w / 2, e.y + e.h, e.w, T);
    ctx.save();
    ctx.translate(sx + w / 2, sy + h);
    if (e.dead > 0) ctx.scale(1.25, 0.3);
    else ctx.scale(1 + Math.sin(t / 120 + e.x) * 0.04, 1 - Math.sin(t / 120 + e.x) * 0.04);
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = INK;
    const step = Math.sin(t / 90 + e.x) * T * 0.08;
    ctx.fillStyle = '#4b2f94';
    ctx.beginPath();
    ctx.ellipse(-w * 0.25, -T * 0.05 + step, w * 0.2, T * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.25, -T * 0.05 - step, w * 0.2, T * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-w * 0.18, -h * 0.75, h * 0.1, 0, -h * 0.4, h);
    g.addColorStop(0, '#c9b3ff');
    g.addColorStop(0.5, '#8a5ce6');
    g.addColorStop(1, '#5d36c2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -T * 0.08);
    ctx.bezierCurveTo(-w / 2, -h * 1.3, w / 2, -h * 1.3, w / 2, -T * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.2, -h * 0.82, w * 0.12, h * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
    const look = e.vx > 0 ? 1 : -1;
    const blink = (t / 1000 + e.x * 0.7) % 4 < 0.12;
    for (const ex of [-0.18, 0.18]) {
      ctx.save();
      ctx.translate(ex * w, -h * 0.55);
      ctx.scale(1, blink ? 0.15 : 1);
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(0, 0, T * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, T * 0.04);
      ctx.stroke();
      if (!blink) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(look * T * 0.04, T * 0.01, T * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.lineWidth = Math.max(2, T * 0.06);
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, -h * 0.82);
    ctx.lineTo(-w * 0.08, -h * 0.74);
    ctx.moveTo(w * 0.32, -h * 0.82);
    ctx.lineTo(w * 0.08, -h * 0.74);
    ctx.stroke();
    ctx.restore();
  }

  function drawPip(T, t) {
    drawShadow(player.x + player.w / 2, player.y + player.h, player.w, T);
    const cx = (player.x + player.w / 2 - camX) * T;
    const by = offsetY() + (player.y + player.h) * T;
    const w = player.w * T;
    const h = player.h * T;
    const sq = clamp(player.squash, -0.3, 0.3);
    ctx.save();
    if (player.inv > 0) ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t / 60);
    ctx.translate(cx, by);
    ctx.scale(1 + sq, 1 - sq);
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    const moving = player.onGround && Math.abs(player.vx) > 0.5;
    const step = moving ? Math.sin(player.run * 3) * T * 0.1 : 0;
    ctx.fillStyle = '#2f6fe0';
    ctx.beginPath();
    ctx.ellipse(-w * 0.22, -T * 0.06 - Math.max(0, step), w * 0.21, T * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.22, -T * 0.06 - Math.max(0, -step), w * 0.21, T * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // scarf tail behind the body
    const flap = Math.sin(t / 70) * T * 0.08 + (player.onGround ? 0 : -T * 0.06);
    ctx.fillStyle = '#ff5c8a';
    ctx.beginPath();
    ctx.moveTo(-player.face * w * 0.4, -h * 0.4);
    ctx.quadraticCurveTo(-player.face * w * 0.8, -h * 0.5 + flap, -player.face * w * 1.0, -h * 0.42 + flap);
    ctx.lineTo(-player.face * w * 0.9, -h * 0.26 + flap);
    ctx.quadraticCurveTo(-player.face * w * 0.7, -h * 0.3, -player.face * w * 0.4, -h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const g = ctx.createRadialGradient(-w * 0.18, -h * 0.75, h * 0.08, 0, -h * 0.5, h * 0.62);
    g.addColorStop(0, '#ffd08a');
    g.addColorStop(0.5, '#ff9f1c');
    g.addColorStop(1, '#e57c0a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.52, w * 0.56, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.22, -h * 0.82, w * 0.14, h * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
    const sg = ctx.createLinearGradient(0, -h * 0.42, 0, -h * 0.3);
    sg.addColorStop(0, '#ff86a8');
    sg.addColorStop(1, '#e8406f');
    ctx.fillStyle = sg;
    ctx.fillRect(-w * 0.52, -h * 0.42, w * 1.04, h * 0.12);
    ctx.strokeRect(-w * 0.52, -h * 0.42, w * 1.04, h * 0.12);
    ctx.fillStyle = 'rgba(255,92,138,0.5)';
    ctx.beginPath();
    ctx.ellipse(player.face * w * 0.32, -h * 0.5, w * 0.1, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    const blink = (t / 1000) % 3.4 < 0.12;
    for (const ex of [-0.05, 0.25]) {
      const x = (ex + 0.05) * w * player.face;
      ctx.save();
      ctx.translate(x, -h * 0.68);
      ctx.scale(1, blink ? 0.15 : 1);
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.14, h * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, T * 0.04);
      ctx.stroke();
      if (!blink) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(player.face * w * 0.05, h * 0.02, w * 0.065, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.arc(player.face * w * 0.07, -h * 0.02, w * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFlag(T, t) {
    const x = (lvl.flagX + 0.5 - camX) * T;
    if (x < -T * 6 || x > view.w + T * 6) return;
    const top = offsetY() + (GROUND - 9) * T;
    const base = offsetY() + GROUND * T;
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.strokeStyle = INK;
    const pg = ctx.createLinearGradient(x - T * 0.1, 0, x + T * 0.1, 0);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(1, '#c9c4dd');
    ctx.fillStyle = pg;
    ctx.fillRect(x - T * 0.08, top, T * 0.16, base - top);
    ctx.strokeRect(x - T * 0.08, top, T * 0.16, base - top);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x, top, T * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const fg = ctx.createLinearGradient(x, 0, x + T * 1.7, 0);
    fg.addColorStop(0, '#ff5c8a');
    fg.addColorStop(1, '#ff8fb0');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(x + T * 0.08, top + T * 0.3);
    for (let i = 0; i <= 8; i++) {
      const fx = x + T * 0.08 + (i / 8) * T * 1.6;
      ctx.lineTo(fx, top + T * 0.3 + Math.sin(t / 180 - i * 0.7) * T * 0.08 * (i / 8) + (i / 8) * T * 0.55);
    }
    for (let i = 8; i >= 0; i--) {
      const fx = x + T * 0.08 + (i / 8) * T * 1.6;
      ctx.lineTo(fx, top + T * 1.5 + Math.sin(t / 180 - i * 0.7) * T * 0.08 * (i / 8) - (i / 8) * T * 0.55);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const hx = (lvl.houseX - camX) * T;
    const hg = ctx.createLinearGradient(0, base - T * 3, 0, base);
    hg.addColorStop(0, '#fff6d6');
    hg.addColorStop(1, '#ffe2a0');
    ctx.fillStyle = hg;
    ctx.fillRect(hx, base - T * 3, T * 4, T * 3);
    ctx.strokeRect(hx, base - T * 3, T * 4, T * 3);
    ctx.fillStyle = '#c94b4b';
    ctx.fillRect(hx + T * 2.8, base - T * 5, T * 0.6, T * 1.4);
    ctx.strokeRect(hx + T * 2.8, base - T * 5, T * 0.6, T * 1.4);
    const rg = ctx.createLinearGradient(0, base - T * 5, 0, base - T * 3);
    rg.addColorStop(0, '#ff7a7a');
    rg.addColorStop(1, '#e04848');
    ctx.fillStyle = rg;
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
    ctx.fillStyle = '#8fd3ff';
    ctx.fillRect(hx + T * 0.4, base - T * 2.4, T * 0.8, T * 0.7);
    ctx.strokeRect(hx + T * 0.4, base - T * 2.4, T * 0.8, T * 0.7);
    ctx.fillRect(hx + T * 2.8, base - T * 2.4, T * 0.8, T * 0.7);
    ctx.strokeRect(hx + T * 2.8, base - T * 2.4, T * 0.8, T * 0.7);
  }

  function drawCheckpoints(T, t) {
    for (const cp of lvl.checkpoints) {
      const x = (cp.x + 0.5 - camX) * T;
      if (x < -T * 2 || x > view.w + T * 2) continue;
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
      ctx.lineTo(x + T * 0.9, base - T * 1.9 + Math.sin(t / 200) * T * 0.05);
      ctx.lineTo(x, base - T * 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (cp.reached) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t / 150);
        ctx.drawImage(glowSprite('rgba(255,240,150,0.9)'), x - T * 0.5, base - T * 2.7, T, T);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawStarBit(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.4 : r;
      const a = (i / 8) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw(t, dt) {
    const T = tileSize();
    ctx.save();
    shake.apply(ctx, dt);
    drawBackdrop(t);
    const x0 = Math.max(0, Math.floor(camX) - 1);
    const x1 = Math.min(lvl.w - 1, Math.ceil(camX + viewTiles()) + 1);
    const oy = offsetY();
    drawCheckpoints(T, t);
    drawFlag(T, t);
    drawTiles(T, t, x0, x1);
    for (const c of lvl.coins) {
      if (!c.taken && c.x > x0 && c.x < x1 + 1) drawCoinAt((c.x - camX) * T, oy + c.y * T, T, t / 220 + c.x);
    }
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      drawCoinAt((p.x - camX) * T, oy + p.y * T, T, t / 60);
      ctx.globalAlpha = 1;
    }
    for (const e of lvl.enemies) {
      if (e.dead >= 0 && e.x > x0 - 1 && e.x < x1 + 1) drawEnemy(e, T, t);
    }
    for (const d of dust) {
      ctx.globalAlpha = Math.max(0, d.life / d.max) * 0.8;
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath();
      ctx.arc((d.x - camX) * T, oy + d.y * T, d.r * T, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawPip(T, t);
    for (const b of bits) {
      ctx.globalAlpha = Math.max(0, b.life / 0.6);
      ctx.fillStyle = b.color;
      if (b.sparkle) drawStarBit((b.x - camX) * T, oy + b.y * T, T * 0.16, b.spin + t / 200);
      else {
        ctx.beginPath();
        ctx.arc((b.x - camX) * T, oy + b.y * T, T * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const tray = padSpace();
    if (tray > 0) {
      const tg = ctx.createLinearGradient(0, view.h - tray, 0, view.h);
      tg.addColorStop(0, '#9a6a40');
      tg.addColorStop(1, '#6e4524');
      ctx.fillStyle = tg;
      ctx.fillRect(0, view.h - tray, view.w, tray);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, view.h - tray);
      ctx.lineTo(view.w, view.h - tray);
      ctx.stroke();
    }
    hearts(ctx, 14, 14, 24, lives, MAX_LIVES);
    ctx.drawImage(sprite('coin', T), view.w - 92 - 16, 12, 32, 32);
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
      draw(t, dt);
    }, cv)
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}
