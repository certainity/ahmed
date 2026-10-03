import {
  INK,
  PAPER,
  Sound,
  clamp,
  drawMirrorTiles,
  hearts,
  hintText,
  imageReady,
  loadImage,
  loop,
  makeCanvas,
  outlinedText,
  pick,
  pointIn,
  rand,
  say,
  scope,
  trackKeys
} from './kit.js';
import oceanArt from './art/sky-bg.webp';

const MAX_HP = 5;
const MAX_POWER = 4;
const STAGE_LENGTH = 50;
const POINTS = { drone: 10, diver: 15, gunship: 60, boss: 500 };

export function shooterGame(arena, api) {
  const s = scope();
  const cv = makeCanvas(arena);
  const { ctx, view, canvas } = cv;
  const keys = trackKeys(s);
  const ocean = loadImage(oceanArt);

  let stage = 1;
  let hp = MAX_HP;
  let power = 1;
  let score = 0;
  let paused = false;
  let hint = 1;
  let clock = 0;
  let waveIn = 2;
  let bossState = 'none';
  let warn = 0;
  let scroll = 0;
  let enemies = [];
  let shots = [];
  let orbs = [];
  let pickups = [];
  let puffs = [];
  let floaters = [];
  let pending = [];
  let fireIn = 0;
  let drag = null;
  const player = { x: 0, y: 0, inv: 0, tilt: 0 };
  const islands = Array.from({ length: 5 }, (_, i) => ({ x: rand(0, 1), y: i / 5, r: rand(0.08, 0.16), seed: rand(0, 6) }));
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: rand(-0.1, 1), y: i / 6, s: rand(0.8, 1.6) }));

  const unit = () => clamp(Math.min(view.w, view.h) / 620, 0.6, 1.3);

  function resetPlayer() {
    player.x = view.w / 2;
    player.y = view.h * 0.82;
    player.inv = 2;
  }

  function startStage() {
    clock = 0;
    waveIn = 2;
    bossState = 'none';
    enemies = [];
    orbs = [];
    pending = [];
    resetPlayer();
    paused = false;
    api.cheer(`Stage ${stage}`);
  }

  function newGame() {
    stage = 1;
    hp = MAX_HP;
    power = 1;
    score = 0;
    api.setScore(0);
    startStage();
  }

  function addScore(n) {
    score += n;
    api.setScore(score);
  }

  function hpScale() {
    return 1 + (stage - 1) * 0.35;
  }

  function addEnemy(type, props) {
    const u = unit();
    const base = { drone: { hp: 1, r: 20 }, diver: { hp: 2, r: 18 }, gunship: { hp: 8, r: 36 }, boss: { hp: 140, r: 0 } }[type];
    enemies.push({
      type,
      t: 0,
      hp: Math.ceil(base.hp * hpScale()),
      maxHp: Math.ceil(base.hp * hpScale()),
      r: base.r * u,
      fireIn: rand(1, 2),
      flash: 0,
      ...props
    });
  }

  function later(delay, fn) {
    pending.push({ at: clock + delay, fn });
  }

  const WAVES = [
    function column() {
      const u = unit();
      const x0 = rand(view.w * 0.2, view.w * 0.8);
      for (let i = 0; i < 5; i++) {
        later(i * 0.35, () => addEnemy('drone', { x: x0, x0, y: -30 * u, vy: (120 + stage * 10) * u, amp: 60 * u, freq: 2.2 }));
      }
    },
    function vee() {
      const u = unit();
      const cx = rand(view.w * 0.3, view.w * 0.7);
      const offsets = [0, -1, 1, -2, 2];
      offsets.forEach((o, i) =>
        addEnemy('drone', { x: cx + o * 46 * u, x0: cx + o * 46 * u, y: -30 * u - Math.abs(o) * 40 * u - i, vy: (100 + stage * 10) * u, amp: 0, freq: 0 })
      );
    },
    function sweep() {
      const u = unit();
      const fromLeft = Math.random() < 0.5;
      for (let i = 0; i < 6; i++) {
        later(i * 0.3, () =>
          addEnemy('drone', {
            x: fromLeft ? view.w * 0.25 : view.w * 0.75,
            x0: fromLeft ? view.w * 0.25 : view.w * 0.75,
            y: -30 * u,
            vy: (130 + stage * 10) * u,
            amp: view.w * 0.2,
            freq: 1.4
          })
        );
      }
    },
    function gunship() {
      const u = unit();
      const x = rand(view.w * 0.25, view.w * 0.75);
      addEnemy('gunship', { x, x0: x, y: -50 * u, stopY: rand(view.h * 0.14, view.h * 0.28) });
    },
    function divers() {
      const u = unit();
      for (let i = 0; i < 3; i++) {
        later(i * 0.45, () => {
          const x = rand(view.w * 0.1, view.w * 0.9);
          const ang = Math.atan2(player.y - -30, player.x - x);
          const sp = (220 + stage * 15) * u;
          addEnemy('diver', { x, y: -30 * u, vx: Math.cos(ang) * sp * 0.6, vy: Math.max(Math.sin(ang) * sp, sp * 0.7) });
        });
      }
    }
  ];

  function spawnBoss() {
    const u = unit();
    bossState = 'fight';
    addEnemy('boss', { x: view.w / 2, y: -120 * u, stopY: view.h * 0.17, w: Math.min(view.w * 0.62, 360 * u), h: 110 * u, pattern: 0 });
    say('Here comes the big boss!');
  }

  function puff(x, y, size = 1) {
    const u = unit();
    for (let i = 0; i < 6; i++) {
      puffs.push({ x: x + rand(-14, 14) * u * size, y: y + rand(-14, 14) * u * size, r: rand(8, 16) * u * size, grow: rand(40, 70) * u * size, life: 0.5, color: pick(['#ffffff', '#ffe08a', '#ffb347']) });
    }
  }

  function drop(e) {
    const u = unit();
    const r = Math.random();
    let kind = null;
    if (e.type === 'gunship') kind = hp < MAX_HP && Math.random() < 0.5 ? 'heart' : 'power';
    else if (r < 0.06 && power < MAX_POWER) kind = 'power';
    else if (r < 0.1 && hp < MAX_HP) kind = 'heart';
    else if (r < 0.28) kind = 'star';
    if (kind) pickups.push({ kind, x: e.x, y: e.y, vy: 70 * u, t: 0 });
  }

  function destroy(e) {
    e.dead = true;
    addScore(POINTS[e.type]);
    floaters.push({ x: e.x, y: e.y, text: `+${POINTS[e.type]}`, life: 0.9 });
    if (e.type === 'boss') {
      Sound.bigBoom();
      for (let i = 0; i < 8; i++) puff(e.x + rand(-e.w / 2, e.w / 2), e.y + rand(-e.h / 2, e.h / 2), 2);
      bossState = 'done';
      later(1.2, stageClear);
      return;
    }
    Sound.boom();
    puff(e.x, e.y, e.type === 'gunship' ? 1.6 : 1);
    drop(e);
  }

  function stageClear() {
    paused = true;
    Sound.win();
    api.celebrate();
    say(`Stage ${stage} clear!`);
    api.panel({
      title: `Stage ${stage} clear!`,
      text: `The big airship is gone. Score ${score}.`,
      button: `Fly to stage ${stage + 1}`,
      onClick: () => {
        stage++;
        startStage();
      }
    });
  }

  function hurt() {
    if (player.inv > 0 || paused) return;
    hp--;
    power = Math.max(1, power - 1);
    player.inv = 1.6;
    Sound.hurt();
    puff(player.x, player.y, 1);
    if (hp <= 0) {
      paused = true;
      say('Game over. Try again!');
      api.panel({ title: 'Game over', text: `You reached stage ${stage} with ${score} points.`, button: 'Fly again', onClick: newGame });
    }
  }

  function fire() {
    const u = unit();
    const sp = -720 * u;
    const y = player.y - 30 * u;
    const add = (dx, angle) => shots.push({ x: player.x + dx * u, y, vx: Math.sin(angle) * -sp, vy: sp * Math.cos(angle) });
    if (power === 1) add(0, 0);
    if (power >= 2) {
      add(-9, 0);
      add(9, 0);
    }
    if (power >= 3) {
      add(-16, -0.18);
      add(16, 0.18);
    }
    if (power >= 4) {
      add(-20, -0.36);
      add(20, 0.36);
    }
    Sound.shoot();
  }

  function enemyShoot(e, angle, speed = 170) {
    const u = unit();
    orbs.push({ x: e.x, y: e.y + (e.h ? e.h * 0.35 : e.r * 0.6), vx: Math.cos(angle) * speed * u, vy: Math.sin(angle) * speed * u, r: 8 * u });
  }

  const aimAt = (e) => Math.atan2(player.y - e.y, player.x - e.x);

  s.on(canvas, 'pointerdown', (e) => {
    drag = { id: e.pointerId, sx: pointIn(e, canvas).x, sy: pointIn(e, canvas).y, px: player.x, py: player.y };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
  });
  s.on(canvas, 'pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointIn(e, canvas);
    player.x = drag.px + (p.x - drag.sx) * 1.3;
    player.y = drag.py + (p.y - drag.sy) * 1.3;
    hint = Math.min(hint, 0.99);
  });
  const endDrag = () => {
    drag = null;
  };
  s.on(canvas, 'pointerup', endDrag);
  s.on(canvas, 'pointercancel', endDrag);

  /* ---------- update ---------- */

  function updateEnemies(dt) {
    const u = unit();
    for (const e of enemies) {
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.type === 'drone') {
        e.y += e.vy * dt;
        e.x = e.x0 + Math.sin(e.t * e.freq) * e.amp;
        if (stage >= 2) {
          e.fireIn -= dt;
          if (e.fireIn <= 0 && e.y > 40 && e.y < view.h * 0.5) {
            e.fireIn = rand(3, 5);
            if (Math.random() < 0.15 * stage) enemyShoot(e, aimAt(e));
          }
        }
      } else if (e.type === 'diver') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else if (e.type === 'gunship') {
        if (e.t < 9) {
          if (e.y < e.stopY) e.y += 90 * u * dt;
          else e.x = e.x0 + Math.sin((e.t - 1) * 0.9) * view.w * 0.22;
          e.fireIn -= dt;
          if (e.fireIn <= 0 && e.y >= e.stopY) {
            e.fireIn = Math.max(0.9, 1.8 - stage * 0.15);
            enemyShoot(e, aimAt(e));
            if (stage >= 2) {
              enemyShoot(e, aimAt(e) - 0.3);
              enemyShoot(e, aimAt(e) + 0.3);
            }
          }
        } else {
          e.y += 130 * u * dt;
        }
      } else if (e.type === 'boss') {
        if (e.y < e.stopY) e.y += 70 * u * dt;
        else {
          e.x = view.w / 2 + Math.sin(e.t * 0.6) * (view.w / 2 - e.w / 2 - 10);
          e.fireIn -= dt;
          if (e.fireIn <= 0) {
            e.pattern = (e.pattern + 1) % 3;
            e.fireIn = Math.max(1.1, 2.2 - stage * 0.2);
            if (e.pattern === 0) {
              for (let k = -2; k <= 2; k++) enemyShoot(e, Math.PI / 2 + k * 0.28, 150);
            } else if (e.pattern === 1) {
              const a = aimAt(e);
              [-0.15, 0, 0.15].forEach((d) => enemyShoot(e, a + d, 190));
            } else {
              for (const side of [-1, 1]) addEnemy('drone', { x: e.x + side * e.w * 0.4, x0: e.x + side * e.w * 0.4, y: e.y, vy: 120 * u, amp: 40 * u, freq: 2 });
            }
          }
        }
      }
      if (player.inv <= 0 && !e.dead) {
        const hit = e.type === 'boss' ? Math.abs(player.x - e.x) < e.w * 0.45 && Math.abs(player.y - e.y) < e.h * 0.4 : Math.hypot(player.x - e.x, player.y - e.y) < e.r + 14 * u;
        if (hit) {
          hurt();
          if (e.type !== 'boss') {
            e.hp = 0;
            destroy(e);
          }
        }
      }
    }
    enemies = enemies.filter((e) => !e.dead && e.y < view.h + 80 && e.x > -100 && e.x < view.w + 100);
  }

  function update(dt) {
    const u = unit();
    clock += dt;
    scroll += dt * 60 * u;

    const kx = (keys.has('ArrowRight', 'd') ? 1 : 0) - (keys.has('ArrowLeft', 'a') ? 1 : 0);
    const ky = (keys.has('ArrowDown', 's') ? 1 : 0) - (keys.has('ArrowUp', 'w') ? 1 : 0);
    if (kx || ky) {
      player.x += kx * 380 * u * dt;
      player.y += ky * 380 * u * dt;
      hint = Math.min(hint, 0.99);
    }
    player.x = clamp(player.x, 24 * u, view.w - 24 * u);
    player.y = clamp(player.y, view.h * 0.25, view.h - 30 * u);
    player.tilt += ((kx || (drag ? clamp((player.x - (drag.lastX ?? player.x)) / 6, -1, 1) : 0)) - player.tilt) * Math.min(1, dt * 8);
    if (drag) drag.lastX = player.x;
    player.inv = Math.max(0, player.inv - dt);

    fireIn -= dt;
    if (fireIn <= 0) {
      fire();
      fireIn = 0.15;
    }

    if (bossState === 'none') {
      if (clock < STAGE_LENGTH) {
        waveIn -= dt;
        if (waveIn <= 0) {
          const choices = stage === 1 && clock < 12 ? WAVES.slice(0, 3) : WAVES;
          pick(choices)();
          waveIn = Math.max(1.4, 3 - stage * 0.25) * rand(0.8, 1.2);
        }
      } else if (!enemies.length || clock > STAGE_LENGTH + 6) {
        bossState = 'warning';
        warn = 2.4;
        Sound.power();
      }
    } else if (bossState === 'warning') {
      warn -= dt;
      if (warn <= 0) spawnBoss();
    }

    const due = pending.filter((p) => p.at <= clock);
    pending = pending.filter((p) => p.at > clock);
    due.forEach((p) => p.fn());

    for (const b of shots) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    updateEnemies(dt);
    for (const b of shots) {
      for (const e of enemies) {
        if (e.dead || b.hit) continue;
        const hit = e.type === 'boss' ? Math.abs(b.x - e.x) < e.w * 0.48 && Math.abs(b.y - e.y) < e.h * 0.45 : Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4 * u;
        if (hit && (e.type !== 'boss' || e.y >= e.stopY - 4)) {
          b.hit = true;
          e.hp--;
          e.flash = 0.08;
          if (e.hp <= 0) destroy(e);
        }
      }
    }
    shots = shots.filter((b) => !b.hit && b.y > -20 && b.x > -20 && b.x < view.w + 20);
    enemies = enemies.filter((e) => !e.dead);

    for (const o of orbs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (Math.hypot(o.x - player.x, o.y - player.y) < o.r + 11 * u) {
        o.hit = true;
        hurt();
      }
    }
    orbs = orbs.filter((o) => !o.hit && o.y < view.h + 20 && o.y > -20 && o.x > -20 && o.x < view.w + 20);

    for (const p of pickups) {
      p.t += dt;
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 110 * u) {
        p.x += ((player.x - p.x) / d) * 300 * u * dt;
        p.y += ((player.y - p.y) / d) * 300 * u * dt;
      } else {
        p.y += p.vy * dt;
      }
      if (d < 26 * u) {
        p.taken = true;
        if (p.kind === 'star') {
          addScore(25);
          Sound.coin();
        } else if (p.kind === 'heart') {
          hp = Math.min(MAX_HP, hp + 1);
          Sound.ding();
          api.cheer('Extra heart!');
        } else {
          power = Math.min(MAX_POWER, power + 1);
          Sound.power();
          api.cheer(power === MAX_POWER ? 'Max power!' : 'Power up!');
        }
      }
    }
    pickups = pickups.filter((p) => !p.taken && p.y < view.h + 30);
  }

  /* ---------- drawing ---------- */

  function drawBackground() {
    const u = unit();
    if (imageReady(ocean)) {
      const w = view.w;
      const h = (ocean.naturalHeight / ocean.naturalWidth) * w;
      // Scrolling down means the offset runs backwards through the tiles.
      drawMirrorTiles(ctx, ocean, { axis: 'y', size: h, cross: w, offset: -scroll, length: view.h });
      return;
    }
    ctx.fillStyle = '#3aa3e3';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    const waveGap = 46 * u;
    const off = scroll % waveGap;
    for (let y = -waveGap + off; y < view.h; y += waveGap) {
      for (let x = ((y / waveGap) % 2) * 40 * u; x < view.w; x += 90 * u) {
        ctx.beginPath();
        ctx.arc(x, y, 10 * u, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    }
    const span = view.h * 1.6;
    for (const isl of islands) {
      const y = ((isl.y * span + scroll * 1) % span) - view.h * 0.3;
      const x = isl.x * view.w;
      const r = isl.r * Math.max(view.w, view.h);
      ctx.fillStyle = '#f2d48f';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.15, r * 0.85, isl.seed, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4cc96f';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.72, isl.seed, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a9a52';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.2, 0, Math.PI * 2);
      ctx.arc(x + r * 0.25, y + r * 0.15, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawClouds() {
    const span = view.h * 1.5;
    for (const c of clouds) {
      const y = ((c.y * span + scroll * 1.8) % span) - view.h * 0.25;
      const x = c.x * view.w;
      const u = unit() * c.s;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 26 * u, 0, Math.PI * 2);
      ctx.arc(x + 30 * u, y - 8 * u, 32 * u, 0, Math.PI * 2);
      ctx.arc(x + 62 * u, y, 24 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlane(t) {
    if (player.inv > 0 && Math.floor(t / 90) % 2 === 0) return;
    const u = unit();
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(u, u);
    ctx.rotate(player.tilt * 0.15);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(31,42,90,0.18)';
    ctx.beginPath();
    ctx.ellipse(10, 34, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(-42 * (1 - Math.abs(player.tilt) * 0.2), 2);
    ctx.lineTo(42 * (1 - Math.abs(player.tilt) * 0.2), 2);
    ctx.lineTo(36, 16);
    ctx.lineTo(-36, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, 30);
    ctx.lineTo(18, 30);
    ctx.lineTo(14, 38);
    ctx.lineTo(-14, 38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3d7fff';
    ctx.beginPath();
    ctx.ellipse(0, 6, 11, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d6f1ff';
    ctx.beginPath();
    ctx.ellipse(0, -6, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(0, -30, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5c5c';
    ctx.beginPath();
    ctx.arc(0, -28, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawDrone(e, t) {
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = INK;
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(side * r * 1.05, -r * 0.5, r * 0.55 * Math.abs(Math.sin(t / 30)) + 2, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(side * r * 0.6, -r * 0.2);
      ctx.lineTo(side * r * 1.05, -r * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = e.flash > 0 ? PAPER : e.type === 'diver' ? '#ff9f1c' : '#ff5c5c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, r * 0.15, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.35);
    ctx.lineTo(r * 0.4, -r * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGunship(e) {
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = e.flash > 0 ? PAPER : '#8a5ce6';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-r * 1.6, -r * 0.15, r * 0.4, r * 0.3);
    ctx.strokeRect(-r * 1.6, -r * 0.15, r * 0.4, r * 0.3);
    ctx.fillRect(r * 1.2, -r * 0.15, r * 0.4, r * 0.3);
    ctx.strokeRect(r * 1.2, -r * 0.15, r * 0.4, r * 0.3);
    ctx.fillStyle = '#5a3da8';
    ctx.beginPath();
    ctx.arc(0, r * 0.4, r * 0.35, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    for (const ex of [-0.4, 0.4]) {
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(ex * r, -r * 0.1, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex * r, -r * 0.02, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    bar(e.x - r, e.y - r - 10, r * 2, 6, e.hp / e.maxHp);
  }

  function drawBoss(e, t) {
    const { w, h } = e;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.fillStyle = e.flash > 0 ? PAPER : '#6a4bd1';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.08, w * 0.5, h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a5ce6';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * w * 0.15, -h * 0.08, w * 0.04, h * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-w * 0.3, h * 0.2, w * 0.6, h * 0.22);
    ctx.strokeRect(-w * 0.3, h * 0.2, w * 0.6, h * 0.22);
    for (const tx of [-0.22, 0, 0.22]) {
      ctx.fillStyle = INK;
      ctx.fillRect(tx * w - 5, h * 0.4, 10, h * 0.14);
    }
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(side * w * 0.52, -h * 0.08, 6, h * 0.3 * Math.abs(Math.sin(t / 40)) + 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const ex of [-0.12, 0.12]) {
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(ex * w, -h * 0.14, h * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex * w + Math.sign(player.x - e.x) * 4, -h * 0.1, h * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.3);
    ctx.lineTo(-w * 0.06, -h * 0.24);
    ctx.moveTo(w * 0.2, -h * 0.3);
    ctx.lineTo(w * 0.06, -h * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  function bar(x, y, w, h, frac) {
    ctx.fillStyle = 'rgba(255,253,246,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff5c5c';
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawPickup(p, t) {
    const u = unit();
    const bob = Math.sin(p.t * 5) * 3 * u;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    if (p.kind === 'star') {
      ctx.rotate(t / 400);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = (i % 2 ? 7 : 16) * u;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.kind === 'heart') {
      ctx.restore();
      hearts(ctx, p.x - 14 * u, p.y + bob - 12 * u, 28 * u, 1, 1);
      return;
    } else {
      ctx.fillStyle = '#4cc96f';
      ctx.beginPath();
      ctx.arc(0, 0, 16 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      outlinedText(ctx, 'P', 0, 1, 20 * u, { fill: PAPER, stroke: INK, width: 4 });
    }
    ctx.restore();
  }

  function draw(t) {
    const u = unit();
    drawBackground();
    for (const p of pickups) drawPickup(p, t);
    for (const e of enemies) {
      if (e.type === 'boss') drawBoss(e, t);
      else if (e.type === 'gunship') drawGunship(e);
      else drawDrone(e, t);
    }
    ctx.fillStyle = '#fff36b';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const b of shots) {
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 3.5 * u, 10 * u, Math.atan2(b.vx, -b.vy), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawPlane(t);
    for (const o of orbs) {
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = '#fff1c4';
      ctx.beginPath();
      ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of puffs) {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawClouds();
    for (const f of floaters) outlinedText(ctx, f.text, f.x, f.y, 20, { alpha: Math.max(0, f.life), width: 5 });

    hearts(ctx, 14, 14, 24, hp, MAX_HP);
    outlinedText(ctx, `Stage ${stage}`, view.w - 14, 28, 22, { align: 'right', width: 6 });
    for (let i = 0; i < MAX_POWER; i++) {
      ctx.fillStyle = i < power ? '#4cc96f' : 'rgba(255,253,246,0.6)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillRect(14 + i * 16, 48, 12, 12);
      ctx.strokeRect(14 + i * 16, 48, 12, 12);
    }
    const boss = enemies.find((e) => e.type === 'boss');
    if (boss) {
      const w = Math.min(view.w * 0.6, 320);
      bar((view.w - w) / 2, 64, w, 14, boss.hp / boss.maxHp);
      outlinedText(ctx, 'BIG BOSS', view.w / 2, 52, 16, { width: 5 });
    } else if (bossState === 'none' && clock < STAGE_LENGTH) {
      const w = Math.min(view.w * 0.4, 200);
      const y = view.w < 520 ? 52 : 22;
      ctx.fillStyle = 'rgba(255,253,246,0.6)';
      ctx.fillRect((view.w - w) / 2, y, w, 8);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect((view.w - w) / 2, y, w * (clock / STAGE_LENGTH), 8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect((view.w - w) / 2, y, w, 8);
    }
    if (bossState === 'warning' && Math.floor(warn * 4) % 2 === 0) {
      outlinedText(ctx, 'Big boss coming!', view.w / 2, view.h * 0.4, Math.min(44, view.w * 0.09), { fill: '#ff5c5c', stroke: PAPER });
    }
    if (hint > 0 && !paused) hintText(ctx, view, 'Drag to fly. Your plane shoots by itself!', hint);
  }

  newGame();

  s.add(
    loop((dt, t) => {
      if (!paused) update(dt);
      for (const p of puffs) {
        p.r += p.grow * dt;
        p.life -= dt;
      }
      puffs = puffs.filter((p) => p.life > 0);
      for (const f of floaters) {
        f.y -= 40 * dt;
        f.life -= dt;
      }
      floaters = floaters.filter((f) => f.life > 0);
      if (hint < 1) hint = Math.max(0, hint - dt * 1.2);
      draw(t);
    })
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}
