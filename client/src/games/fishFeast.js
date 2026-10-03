import { INK, PAPER, Sound, clamp, hearts, hintText, imageReady, loadImage, loop, makeCanvas, outlinedText, pick, pointIn, rand, say, scope, trackKeys } from './kit.js';
import seaArt from './art/fish-bg.webp';

const STAGE_SIZES = [16, 25, 36];
const STAGE_NEED = [10, 16, 22];
const MAX_LIVES = 5;
const FISH_COLORS = [
  ['#ffd23f', '#ff9f1c'],
  ['#4cc96f', '#2a9a52'],
  ['#5ec8ff', '#2f86d9'],
  ['#ff8fc7', '#e0569a'],
  ['#b39cff', '#7d5ce6']
];

export function fishGame(arena, api) {
  const s = scope();
  const cv = makeCanvas(arena);
  const { ctx, view, canvas } = cv;
  const keys = trackKeys(s);
  const sea = loadImage(seaArt);

  let level = 1;
  let lives = MAX_LIVES;
  let stage = 0;
  let growth = 0;
  let score = 0;
  let paused = false;
  let hint = 1;
  let hintTime = 5;
  let fish = [];
  let bubbles = [];
  let bits = [];
  let floaters = [];
  let spawnIn = 0.3;
  let target = null;
  const player = { x: 0, y: 0, vx: 0, vy: 0, size: STAGE_SIZES[0], face: 1, inv: 2.5, mouth: 0 };
  const weeds = Array.from({ length: 9 }, (_, i) => ({ f: (i + 0.5) / 9 + rand(-0.03, 0.03), h: rand(0.12, 0.26), phase: rand(0, 6) }));

  const unit = () => clamp(Math.min(view.w, view.h) / 560, 0.65, 1.5);
  const seaFloor = () => view.h - 26 * unit();

  function resetPlayer() {
    player.x = view.w / 2;
    player.y = view.h * 0.45;
    player.vx = 0;
    player.vy = 0;
    player.inv = 2.5;
    target = null;
  }

  function startLevel() {
    stage = 0;
    growth = 0;
    player.size = STAGE_SIZES[0];
    fish = [];
    spawnIn = 0.3;
    resetPlayer();
  }

  function newGame() {
    level = 1;
    lives = MAX_LIVES;
    score = 0;
    api.setScore(0);
    startLevel();
    paused = false;
  }

  function spawn() {
    const p = player.size;
    const r = Math.random();
    const predatorChance = Math.min(0.06 + level * 0.04, 0.22);
    const huntersOut = fish.filter((f) => f.predator).length;
    let size;
    let predator = false;
    if (r < 0.68 || (r >= 1 - predatorChance && huntersOut >= Math.min(level, 3))) size = p * rand(0.35, 0.8);
    else if (r < 1 - predatorChance) size = p * rand(1.2, 1.6);
    else {
      size = p * rand(1.8, 2.5);
      predator = true;
    }
    size = clamp(size, 7, 90);
    const fromLeft = Math.random() < 0.5;
    const u = unit();
    const speed = (rand(55, 95) + level * 8) * (predator ? 0.9 : 1) * clamp(30 / size, 0.6, 1.6);
    fish.push({
      x: fromLeft ? -size * 2 * u : view.w + size * 2 * u,
      y: rand(view.h * 0.12, seaFloor() - size * u),
      baseY: 0,
      size,
      face: fromLeft ? 1 : -1,
      speed,
      predator,
      colors: predator ? ['#ff6b6b', '#c73e3e'] : pick(FISH_COLORS),
      phase: rand(0, 6),
      mouth: 0
    });
    fish[fish.length - 1].baseY = fish[fish.length - 1].y;
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 200);
      bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, color, r: rand(2, 5) });
    }
  }

  function eat(f) {
    fish = fish.filter((o) => o !== f);
    const points = Math.max(1, Math.round(f.size / 4)) * 10;
    score += points;
    api.setScore(score);
    growth += clamp((f.size / player.size) * 2, 0.6, 2);
    player.mouth = 0.25;
    hint = Math.min(hint, 0.99);
    Sound.chomp();
    const u = unit();
    burst(player.x + player.face * player.size * u, player.y, '#ffffff', 8);
    floaters.push({ x: f.x, y: f.y, text: `+${points}`, life: 1 });
    if (growth >= STAGE_NEED[stage]) {
      if (stage < STAGE_SIZES.length - 1) {
        stage++;
        growth = 0;
        Sound.grow();
        api.cheer('You grew!');
        say('You grew bigger!');
      } else {
        levelClear();
      }
    }
  }

  function levelClear() {
    paused = true;
    Sound.win();
    api.celebrate();
    say(`Level ${level} done!`);
    api.panel({
      title: `Level ${level} clear!`,
      text: `You are the biggest fish in the sea. Score ${score}.`,
      button: `Start level ${level + 1}`,
      onClick: () => {
        level++;
        startLevel();
        paused = false;
      }
    });
  }

  function hurt(f) {
    lives--;
    Sound.hurt();
    burst(player.x, player.y, '#ff9f1c', 14);
    f.mouth = 0.3;
    if (lives <= 0) {
      paused = true;
      say('Game over. Try again!');
      api.panel({
        title: 'Game over',
        text: `You reached level ${level} with ${score} points.`,
        button: 'Play again',
        onClick: newGame
      });
      return;
    }
    say('Ouch! Watch out for big fish');
    resetPlayer();
  }

  s.on(canvas, 'pointerdown', (e) => {
    target = pointIn(e, canvas);
  });
  s.on(canvas, 'pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) target = pointIn(e, canvas);
  });

  function drawFish(x, y, size, face, colors, t, { player: isPlayer = false, angry = false, mouth = 0, blink = false } = {}) {
    if (blink) return;
    const u = unit();
    const r = size * u;
    const tail = Math.sin(t / 120) * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.strokeStyle = INK;
    // tail
    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.5, -r * (0.6 + tail));
    ctx.lineTo(-r * 1.5, r * (0.6 - tail));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // top fin
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.5);
    ctx.quadraticCurveTo(-r * 0.05, -r * 1.05, r * 0.35, -r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // body
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.64, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (isPlayer) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.64, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = PAPER;
      for (const sx of [-0.45, 0.15]) {
        ctx.fillRect(sx * r, -r, r * 0.18, r * 2);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.64, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // mouth
    if (mouth > 0) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(r * 1.02, -r * 0.22);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(r * 1.02, r * 0.22);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(r * 0.7, r * 0.18);
      ctx.quadraticCurveTo(r * 0.85, r * 0.26, r * 0.95, r * 0.14);
      ctx.stroke();
    }
    // eye
    const ex = r * 0.45;
    const ey = -r * 0.16;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ex + r * 0.05, ey, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
    if (angry) {
      ctx.lineWidth = Math.max(2.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.22, ey - r * 0.32);
      ctx.lineTo(ex + r * 0.2, ey - r * 0.16);
      ctx.stroke();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.moveTo(r * 0.62, r * 0.2);
      ctx.lineTo(r * 0.7, r * 0.34);
      ctx.lineTo(r * 0.78, r * 0.2);
      ctx.moveTo(r * 0.8, r * 0.18);
      ctx.lineTo(r * 0.87, r * 0.3);
      ctx.lineTo(r * 0.94, r * 0.15);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBackground(t) {
    if (imageReady(sea)) {
      // Cover-fit, anchored to the bottom so the painted sea floor stays on screen.
      const scale = Math.max(view.w / sea.naturalWidth, view.h / sea.naturalHeight);
      const w = sea.naturalWidth * scale;
      const h = sea.naturalHeight * scale;
      ctx.drawImage(sea, (view.w - w) / 2, view.h - h, w, h);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#55c6f0');
    g.addColorStop(1, '#0d5aa0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 4; i++) {
      const x = ((i + 0.3) / 4) * view.w + Math.sin(t / 3000 + i) * 30;
      ctx.beginPath();
      ctx.moveTo(x - 30, 0);
      ctx.lineTo(x + 30, 0);
      ctx.lineTo(x + 120, view.h);
      ctx.lineTo(x - 10, view.h);
      ctx.closePath();
      ctx.fill();
    }
    const floor = seaFloor();
    ctx.fillStyle = '#f2d48f';
    ctx.beginPath();
    ctx.moveTo(0, floor);
    for (let x = 0; x <= view.w; x += 40) ctx.lineTo(x, floor + Math.sin(x / 60) * 5);
    ctx.lineTo(view.w, view.h);
    ctx.lineTo(0, view.h);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'round';
    for (const w of weeds) {
      const x = w.f * view.w;
      const h = w.h * view.h;
      ctx.strokeStyle = '#2a9a52';
      ctx.lineWidth = 9 * unit();
      ctx.beginPath();
      ctx.moveTo(x, floor + 4);
      for (let k = 1; k <= 6; k++) {
        const yy = floor - (h * k) / 6;
        ctx.lineTo(x + Math.sin(t / 700 + w.phase + k * 0.7) * 10 * (k / 6), yy);
      }
      ctx.stroke();
    }
  }

  function drawHud() {
    const u = unit();
    hearts(ctx, 14, 14, 24, lives, MAX_LIVES);
    outlinedText(ctx, `Level ${level}`, view.w - 14, 28, 24, { align: 'right', width: 6 });
    const barW = Math.min(260, view.w * 0.42);
    const x = (view.w - barW) / 2;
    const y = view.w < 520 ? 52 : 16;
    const h = 22;
    const fill = clamp((stage + growth / STAGE_NEED[stage]) / STAGE_SIZES.length, 0, 1);
    ctx.fillStyle = 'rgba(255,253,246,0.85)';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, h, h / 2);
    else ctx.rect(x, y, barW, h);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#4cc96f';
    ctx.fillRect(x, y, barW * fill, h);
    ctx.restore();
    ctx.stroke();
    for (let i = 1; i < STAGE_SIZES.length; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (barW * i) / STAGE_SIZES.length, y + 3);
      ctx.lineTo(x + (barW * i) / STAGE_SIZES.length, y + h - 3);
      ctx.stroke();
    }
    outlinedText(ctx, 'GROW', x + barW / 2, y + h / 2 + 1, 14 * Math.min(1.2, u + 0.2), { width: 4 });
  }

  newGame();

  s.add(
    loop((dt, t) => {
      const u = unit();
      if (!paused) {
        // player movement
        let dvx = 0;
        let dvy = 0;
        const max = 330 * u;
        const kx = (keys.has('ArrowRight', 'd') ? 1 : 0) - (keys.has('ArrowLeft', 'a') ? 1 : 0);
        const ky = (keys.has('ArrowDown', 's') ? 1 : 0) - (keys.has('ArrowUp', 'w') ? 1 : 0);
        if (kx || ky) {
          target = null;
          const len = Math.hypot(kx, ky);
          dvx = (kx / len) * max;
          dvy = (ky / len) * max;
        } else if (target) {
          const dx = target.x - player.x;
          const dy = target.y - player.y;
          const d = Math.hypot(dx, dy);
          if (d > 4) {
            const sp = Math.min(max, d * 5);
            dvx = (dx / d) * sp;
            dvy = (dy / d) * sp;
          }
        }
        player.vx += (dvx - player.vx) * Math.min(1, dt * 7);
        player.vy += (dvy - player.vy) * Math.min(1, dt * 7);
        player.x = clamp(player.x + player.vx * dt, player.size * u, view.w - player.size * u);
        player.y = clamp(player.y + player.vy * dt, player.size * u, seaFloor() - player.size * 0.6 * u);
        if (Math.abs(player.vx) > 20) player.face = Math.sign(player.vx);
        player.size += (STAGE_SIZES[stage] - player.size) * Math.min(1, dt * 4);
        player.inv = Math.max(0, player.inv - dt);
        player.mouth = Math.max(0, player.mouth - dt);

        spawnIn -= dt;
        if (spawnIn <= 0 && fish.length < 12 + level) {
          spawn();
          spawnIn = Math.max(0.35, 0.95 - level * 0.08) * rand(0.6, 1.3);
        }

        for (const f of fish) {
          f.mouth = Math.max(0, f.mouth - dt);
          const bigger = f.size > player.size * 1.08;
          const dx = player.x - f.x;
          const dy = player.y - f.y;
          const d = Math.hypot(dx, dy);
          if (f.predator && bigger && player.inv <= 0 && d < 240 * u && Math.sign(dx) === f.face) {
            f.y += clamp(dy, -1, 1) * (40 + level * 8) * u * dt;
            f.baseY = f.y;
          } else {
            f.y = f.baseY + Math.sin(t / 500 + f.phase) * 8 * u;
          }
          f.x += f.face * f.speed * u * dt;
          const reach = (player.size + f.size) * u * 0.72;
          if (d < reach) {
            if (f.size < player.size * 0.92) eat(f);
            else if (bigger && player.inv <= 0) hurt(f);
            if (paused) break;
          }
        }
        fish = fish.filter((f) => f.x > -f.size * 3 * u && f.x < view.w + f.size * 3 * u);
      }

      if (Math.random() < dt * 3) bubbles.push({ x: rand(0, view.w), y: view.h, r: rand(2, 6), v: rand(30, 70) });
      for (const b of bubbles) {
        b.y -= b.v * dt;
        b.x += Math.sin(t / 400 + b.r) * 0.3;
      }
      bubbles = bubbles.filter((b) => b.y > -10);
      for (const p of bits) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      bits = bits.filter((p) => p.life > 0);
      for (const f of floaters) {
        f.y -= 50 * dt;
        f.life -= dt;
      }
      floaters = floaters.filter((f) => f.life > 0);
      hintTime -= dt;
      if (hint < 1 || hintTime <= 0) hint = Math.max(0, Math.min(hint, 0.99) - dt * 1.5);

      drawBackground(t);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      for (const b of bubbles) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const f of fish) {
        drawFish(f.x, f.y, f.size, f.face, f.colors, t + f.phase * 300, { angry: f.size > player.size * 1.08, mouth: f.mouth });
      }
      const blink = player.inv > 0 && Math.floor(t / 120) % 2 === 0;
      drawFish(player.x, player.y, player.size, player.face, ['#ff8a3d', '#e0601a'], t, { player: true, mouth: player.mouth, blink });
      for (const p of bits) {
        ctx.globalAlpha = Math.max(0, p.life / 0.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const f of floaters) outlinedText(ctx, f.text, f.x, f.y, 22, { alpha: Math.max(0, f.life), width: 5 });
      drawHud();
      if (hint > 0 && !paused) hintText(ctx, view, 'Eat the smaller fish!', hint);
    })
  );

  s.add(() => cv.destroy());
  return () => s.dispose();
}
