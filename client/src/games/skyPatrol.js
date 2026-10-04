import {
  INK,
  PAPER,
  Sound,
  clamp,
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
  const oceanLayer = makeLayer(cv);
  const shake = makeShake();

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
  let rings = [];
  let sparks = [];
  let flashes = [];
  let trail = [];
  let trailIn = 0;
  let hurtFlash = 0;
  let floaters = [];
  let pending = [];
  let fireIn = 0;
  let drag = null;
  const player = { x: 0, y: 0, inv: 0, tilt: 0 };
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
    flashes.push({ x, y, r: 46 * u * size, life: 0.18, max: 0.18 });
    rings.push({ x, y, r: 10 * u * size, grow: 220 * u * size, life: 0.35, max: 0.35, width: 5 });
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(220, 420) * u * Math.sqrt(size);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35 });
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
      shake.kick(20);
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
    shake.kick(12);
    hurtFlash = 0.35;
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

  function paintCloud(x, w, h, variant, shadow) {
    const blobs = [
      [[0.25, 0.6, 0.22], [0.45, 0.42, 0.3], [0.68, 0.55, 0.24], [0.5, 0.68, 0.26]],
      [[0.2, 0.62, 0.18], [0.38, 0.45, 0.24], [0.6, 0.4, 0.27], [0.8, 0.6, 0.18], [0.5, 0.68, 0.28]],
      [[0.3, 0.55, 0.26], [0.55, 0.45, 0.28], [0.75, 0.6, 0.2], [0.45, 0.68, 0.24]]
    ][variant];
    if (shadow) {
      x.fillStyle = 'rgba(10,50,90,1)';
      for (const [bx, by, br] of blobs) {
        x.beginPath();
        x.arc(bx * w, by * h, br * h, 0, Math.PI * 2);
        x.fill();
      }
      return;
    }
    for (const [bx, by, br] of blobs) {
      const g = x.createRadialGradient(bx * w - br * h * 0.3, by * h - br * h * 0.4, br * h * 0.1, bx * w, by * h, br * h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#f3f8ff');
      g.addColorStop(1, '#d8e6f5');
      x.fillStyle = g;
      x.beginPath();
      x.arc(bx * w, by * h, br * h, 0, Math.PI * 2);
      x.fill();
    }
  }

  const cloudSprites = [0, 1, 2].map((variant) => {
    const make = (shadow) => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      const x = c.getContext('2d');
      if (shadow) x.filter = 'blur(10px)';
      paintCloud(x, 320, 240, variant, shadow);
      return c;
    };
    return { cloud: make(false), shadow: make(true) };
  });

  function drawBackground() {
    if (imageReady(ocean)) {
      const w = view.w;
      const h = (ocean.naturalHeight / ocean.naturalWidth) * w;
      const strip = mirrorStrip(oceanLayer, ocean, 'y', h, w);
      // Flying forward means the sea slides down the screen.
      drawStrip(ctx, strip, { axis: 'y', size: h, cross: w, offset: -scroll, length: view.h });
      return;
    }
    ctx.fillStyle = '#3aa3e3';
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function cloudPos(c) {
    const span = view.h * 1.5;
    const u = unit() * c.s;
    return { x: c.x * view.w, y: ((c.y * span + scroll * 1.8) % span) - view.h * 0.25, w: 150 * u, h: 112 * u };
  }

  function drawCloudShadows() {
    ctx.globalAlpha = 0.09;
    clouds.forEach((c, i) => {
      const p = cloudPos(c);
      ctx.drawImage(cloudSprites[i % 3].shadow, p.x + 40 * unit(), p.y + 70 * unit(), p.w, p.h);
    });
    ctx.globalAlpha = 1;
  }

  function drawClouds() {
    ctx.globalAlpha = 0.88;
    clouds.forEach((c, i) => {
      const p = cloudPos(c);
      ctx.drawImage(cloudSprites[i % 3].cloud, p.x, p.y, p.w, p.h);
    });
    ctx.globalAlpha = 1;
  }

  const SHADOW = 'rgba(8,45,85,0.22)';
  const shadowOffset = () => ({ x: 18 * unit(), y: 46 * unit() });

  function drawShadows() {
    const o = shadowOffset();
    ctx.fillStyle = SHADOW;
    for (const e of enemies) {
      ctx.beginPath();
      if (e.type === 'boss') ctx.ellipse(e.x + o.x * 1.6, e.y + o.y * 1.6, e.w * 0.48, e.h * 0.34, 0, 0, Math.PI * 2);
      else if (e.type === 'gunship') ctx.ellipse(e.x + o.x, e.y + o.y, e.r * 1.3, e.r * 0.7, 0, 0, Math.PI * 2);
      else ctx.ellipse(e.x + o.x, e.y + o.y, e.r * 0.8, e.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    {
      const u = unit();
      ctx.save();
      ctx.translate(player.x + o.x, player.y + o.y);
      ctx.scale(u * 0.9, u * 0.9);
      ctx.rotate(player.tilt * 0.15);
      ctx.beginPath();
      ctx.ellipse(0, 6, 10, 32, 0, 0, Math.PI * 2);
      ctx.ellipse(0, 9, 40, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(0, 34, 16, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTrail() {
    for (const p of trail) {
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlane(t) {
    const u = unit();
    ctx.save();
    if (player.inv > 0) ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t / 55);
    ctx.translate(player.x, player.y);
    ctx.scale(u, u);
    ctx.rotate(player.tilt * 0.15);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    const span = 42 * (1 - Math.abs(player.tilt) * 0.2);
    // wings
    const wg = ctx.createLinearGradient(0, 2, 0, 16);
    wg.addColorStop(0, '#ffe680');
    wg.addColorStop(1, '#f2b21c');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(-span, 4);
    ctx.quadraticCurveTo(-span, 0, -span + 6, 0);
    ctx.lineTo(span - 6, 0);
    ctx.quadraticCurveTo(span, 0, span, 4);
    ctx.lineTo(36, 16);
    ctx.lineTo(-36, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ff5c5c';
      ctx.beginPath();
      ctx.arc(side * 26, 8, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(side * 26, 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // tail
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(-18, 30);
    ctx.lineTo(18, 30);
    ctx.lineTo(14, 38);
    ctx.lineTo(-14, 38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // body
    const bg = ctx.createLinearGradient(-11, 0, 11, 0);
    bg.addColorStop(0, '#2a5fd1');
    bg.addColorStop(0.45, '#5b9bff');
    bg.addColorStop(1, '#2a5fd1');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, 6, 11, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // cockpit
    const cg = ctx.createLinearGradient(0, -16, 0, 4);
    cg.addColorStop(0, '#e9f8ff');
    cg.addColorStop(1, '#8cc8ee');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -6, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(-2, -10, 1.6, 3.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // propeller
    ctx.save();
    ctx.translate(0, -29);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(31,42,90,0.6)';
    ctx.lineWidth = 3;
    const a = t / 18;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(a) * 18, -Math.sin(a) * 2);
    ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff5c5c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawDrone(e, t) {
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.6, -r * 0.2);
      ctx.lineTo(side * r * 1.05, -r * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(side * r * 1.05, -r * 0.5, r * 0.55, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(31,42,90,0.55)';
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      const a = t / 25 + side;
      ctx.beginPath();
      ctx.moveTo(side * r * 1.05 - Math.cos(a) * r * 0.5, -r * 0.5);
      ctx.lineTo(side * r * 1.05 + Math.cos(a) * r * 0.5, -r * 0.5);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, r * 0.12);
    }
    const base = e.type === 'diver' ? ['#ffd08a', '#ff9f1c', '#d97a00'] : ['#ffb3b3', '#ff5c5c', '#c73e3e'];
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r * 0.8);
    g.addColorStop(0, e.flash > 0 ? PAPER : base[0]);
    g.addColorStop(0.55, e.flash > 0 ? PAPER : base[1]);
    g.addColorStop(1, e.flash > 0 ? PAPER : base[2]);
    ctx.fillStyle = g;
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
    ctx.arc((player.x > e.x ? 1 : -1) * r * 0.06, r * 0.15, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(r * 0.04, r * 0.08, r * 0.05, 0, Math.PI * 2);
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
    const g = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
    g.addColorStop(0, e.flash > 0 ? PAPER : '#b79cff');
    g.addColorStop(0.5, e.flash > 0 ? PAPER : '#8a5ce6');
    g.addColorStop(1, e.flash > 0 ? PAPER : '#5d36c2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.38, r * 0.8, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-r * 1.6, -r * 0.15, r * 0.4, r * 0.3);
    ctx.strokeRect(-r * 1.6, -r * 0.15, r * 0.4, r * 0.3);
    ctx.fillRect(r * 1.2, -r * 0.15, r * 0.4, r * 0.3);
    ctx.strokeRect(r * 1.2, -r * 0.15, r * 0.4, r * 0.3);
    ctx.fillStyle = '#4b2f94';
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
    ctx.translate(e.x, e.y + Math.sin(t / 500) * 3);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    const g = ctx.createLinearGradient(0, -h * 0.44, 0, h * 0.28);
    g.addColorStop(0, e.flash > 0 ? PAPER : '#9a7cf0');
    g.addColorStop(0.55, e.flash > 0 ? PAPER : '#6a4bd1');
    g.addColorStop(1, e.flash > 0 ? PAPER : '#4a2fa6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.08, w * 0.5, h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * w * 0.15, -h * 0.08, w * 0.035, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.1, -h * 0.32, w * 0.32, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.08, w * 0.5, h * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    const gg = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.42);
    gg.addColorStop(0, '#ffe680');
    gg.addColorStop(1, '#f2b21c');
    ctx.fillStyle = gg;
    ctx.fillRect(-w * 0.3, h * 0.2, w * 0.6, h * 0.22);
    ctx.strokeRect(-w * 0.3, h * 0.2, w * 0.6, h * 0.22);
    const charge = e.y >= e.stopY && e.fireIn < 0.4;
    for (const tx of [-0.22, 0, 0.22]) {
      ctx.fillStyle = INK;
      ctx.fillRect(tx * w - 5, h * 0.4, 10, h * 0.14);
      if (charge) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite('rgba(255,120,60,0.9)'), tx * w - 14, h * 0.5 - 10, 28, 28);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
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
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ff8a8a');
    g.addColorStop(1, '#e03c3c');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x, y + 1, w * clamp(frac, 0, 1), h * 0.3);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawPickup(p, t) {
    const u = unit();
    const bob = Math.sin(p.t * 5) * 3 * u;
    const halo = { star: 'rgba(255,220,90,0.9)', heart: 'rgba(255,120,150,0.9)', power: 'rgba(120,240,150,0.9)' }[p.kind];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t / 150 + p.x);
    ctx.drawImage(glowSprite(halo), p.x - 34 * u, p.y + bob - 34 * u, 68 * u, 68 * u);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    if (p.kind === 'star') {
      ctx.rotate(t / 400);
      const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 16 * u);
      g.addColorStop(0, '#fff6c2');
      g.addColorStop(1, '#ffc21f');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = (i % 2 ? 7 : 16) * u;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (p.kind === 'heart') {
      ctx.restore();
      hearts(ctx, p.x - 14 * u, p.y + bob - 12 * u, 28 * u, 1, 1);
      return;
    }
    const g = ctx.createRadialGradient(-5 * u, -6 * u, 2, 0, 0, 16 * u);
    g.addColorStop(0, '#b6f5c8');
    g.addColorStop(1, '#2fb36a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    outlinedText(ctx, 'P', p.x, p.y + bob + 1, 20 * u, { fill: PAPER, stroke: INK, width: 4 });
  }

  function drawShots() {
    const u = unit();
    ctx.globalCompositeOperation = 'lighter';
    const glow = glowSprite('rgba(255,230,90,0.85)');
    for (const b of shots) ctx.drawImage(glow, b.x - 12 * u, b.y - 16 * u, 24 * u, 32 * u);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fffbd1';
    ctx.strokeStyle = '#e0a400';
    ctx.lineWidth = 1.5;
    for (const b of shots) {
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 3 * u, 9 * u, Math.atan2(b.vx, -b.vy), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawOrbs(t) {
    ctx.globalCompositeOperation = 'lighter';
    const glow = glowSprite('rgba(255,110,60,0.8)');
    for (const o of orbs) ctx.drawImage(glow, o.x - o.r * 2.4, o.y - o.r * 2.4, o.r * 4.8, o.r * 4.8);
    ctx.globalCompositeOperation = 'source-over';
    for (const o of orbs) {
      const pulse = 1 + Math.sin(t / 80 + o.x) * 0.08;
      const g = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 1, o.x, o.y, o.r * pulse);
      g.addColorStop(0, '#fff1c4');
      g.addColorStop(0.5, '#ff9a3d');
      g.addColorStop(1, '#e8501f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  function drawEffects() {
    ctx.globalCompositeOperation = 'lighter';
    for (const f of flashes) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.drawImage(glowSprite('rgba(255,240,180,1)'), f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const p of puffs) {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of rings) {
      ctx.globalAlpha = Math.max(0, r.life / r.max);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = r.width * (r.life / r.max) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffd23f';
    ctx.lineCap = 'round';
    for (const p of sparks) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function draw(t, dt) {
    ctx.save();
    shake.apply(ctx, dt);
    drawBackground();
    drawCloudShadows();
    drawShadows();
    for (const p of pickups) drawPickup(p, t);
    drawTrail();
    for (const e of enemies) {
      if (e.type === 'boss') drawBoss(e, t);
      else if (e.type === 'gunship') drawGunship(e);
      else drawDrone(e, t);
    }
    drawShots();
    drawPlane(t);
    drawOrbs(t);
    drawEffects();
    drawClouds();
    for (const f of floaters) outlinedText(ctx, f.text, f.x, f.y, 20, { alpha: Math.max(0, f.life), width: 5 });
    ctx.restore();
    if (hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,70,70,${hurtFlash})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    hearts(ctx, 14, 14, 24, hp, MAX_HP);
    outlinedText(ctx, `Stage ${stage}`, view.w - 14, 28, 22, { align: 'right', width: 6 });
    for (let i = 0; i < MAX_POWER; i++) {
      ctx.fillStyle = i < power ? '#4cc96f' : 'rgba(255,253,246,0.6)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(20 + i * 18, 54, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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
      const u = unit();
      if (!paused) {
        trailIn -= dt;
        if (trailIn <= 0) {
          trailIn = 0.05;
          trail.push({ x: player.x + rand(-3, 3) * u, y: player.y + 40 * u, r: rand(3, 5) * u, vy: 120 * u, life: 0.5, max: 0.5 });
        }
      }
      for (const p of trail) {
        p.y += p.vy * dt;
        p.r += 6 * u * dt;
        p.life -= dt;
      }
      trail = trail.filter((p) => p.life > 0);
      for (const p of puffs) {
        p.r += p.grow * dt;
        p.life -= dt;
      }
      puffs = puffs.filter((p) => p.life > 0);
      for (const r of rings) {
        r.r += r.grow * dt;
        r.life -= dt;
      }
      rings = rings.filter((r) => r.life > 0);
      for (const f of flashes) f.life -= dt;
      flashes = flashes.filter((f) => f.life > 0);
      for (const p of sparks) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt;
      }
      sparks = sparks.filter((p) => p.life > 0);
      for (const f of floaters) {
        f.y -= 40 * dt;
        f.life -= dt;
      }
      floaters = floaters.filter((f) => f.life > 0);
      hurtFlash = Math.max(0, hurtFlash - dt);
      if (hint < 1) hint = Math.max(0, hint - dt * 1.2);
      draw(t, dt);
    }, cv)
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}
