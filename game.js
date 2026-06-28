/* =============================================================
   DEMON SLAYER — Hellscape
   A self-contained 2D action game. Everything (backgrounds,
   characters, effects) is drawn procedurally on a <canvas>,
   so there are no external asset files to load.
   ============================================================= */

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 960
  const H = canvas.height;  // 540

  const GROUND_Y = H - 96;  // top of the bridge/walkable floor

  // ---------- DOM ----------
  const el = {
    overlay: document.getElementById("overlay"),
    startBtn: document.getElementById("start-btn"),
    hud: document.getElementById("hud"),
    hearts: document.getElementById("hearts"),
    wave: document.getElementById("wave"),
    kills: document.getElementById("kills"),
    score: document.getElementById("score"),
    gameover: document.getElementById("gameover"),
    retryBtn: document.getElementById("retry-btn"),
    finalKills: document.getElementById("final-kills"),
    finalScore: document.getElementById("final-score"),
    bestScore: document.getElementById("best-score"),
  };

  // ---------- Utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const aabb = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- Input ----------
  const keys = Object.create(null);
  const pressed = Object.create(null); // edge-triggered (consumed once)

  function setKey(code, down) {
    if (down && !keys[code]) pressed[code] = true;
    keys[code] = down;
  }
  window.addEventListener("keydown", (e) => {
    const c = e.code;
    if (["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(c)) e.preventDefault();
    setKey(c, true);
    if (c === "KeyP" || c === "Escape") togglePause();
  });
  window.addEventListener("keyup", (e) => setKey(e.code, false));
  canvas.addEventListener("mousedown", () => { if (game.state === "play") player.attack(); });

  const consume = (code) => { if (pressed[code]) { pressed[code] = false; return true; } return false; };
  const leftHeld  = () => keys.ArrowLeft  || keys.KeyA;
  const rightHeld = () => keys.ArrowRight || keys.KeyD;
  const jumpEdge  = () => consume("Space") || consume("ArrowUp") || consume("KeyW");
  const attackEdge= () => consume("KeyJ");
  const dashEdge  = () => consume("KeyK");

  // ---------- Particles ----------
  const particles = [];
  function spawnParticles(x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: rand(-opts.spread || -2, opts.spread || 2),
        vy: rand(opts.vy0 ?? -3, opts.vy1 ?? 1),
        life: rand(0.3, opts.life || 0.8),
        maxLife: opts.life || 0.8,
        size: rand(opts.size0 || 1.5, opts.size1 || 4),
        color: opts.color || "#ff7a2a",
        grav: opts.grav ?? 12,
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.grav * dt;
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Floating score text
  const floaters = [];
  const addFloater = (x, y, text, color = "#ffb347") =>
    floaters.push({ x, y, text, color, life: 0.9 });
  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= 30 * dt;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  // ---------- Player ----------
  const player = {
    x: W / 2 - 16, y: GROUND_Y - 56,
    w: 32, h: 56,
    vx: 0, vy: 0,
    speed: 280, jumpV: -560, grav: 1500,
    onGround: false,
    facing: 1,
    hp: 5, maxHp: 5,
    invuln: 0,           // i-frames timer
    attackTimer: 0,      // active swing window
    attackCd: 0,         // cooldown between swings
    dashTimer: 0,
    dashCd: 0,
    hitSet: null,        // demons already hit by current swing

    reset() {
      this.x = W / 2 - 16; this.y = GROUND_Y - this.h;
      this.vx = this.vy = 0;
      this.hp = this.maxHp;
      this.invuln = this.attackTimer = this.attackCd = this.dashTimer = this.dashCd = 0;
      this.facing = 1; this.onGround = false;
    },

    attack() {
      if (this.attackCd > 0 || this.dashTimer > 0) return;
      this.attackTimer = 0.18;
      this.attackCd = 0.32;
      this.hitSet = new Set();
      // a flash of embers along the blade
      const bx = this.x + (this.facing > 0 ? this.w : -38) + 19;
      spawnParticles(bx, this.y + 18, 8, { color: "#ffd27a", spread: 3, vy0: -2, vy1: 2, life: 0.4, grav: 2 });
    },

    dash() {
      if (this.dashCd > 0) return;
      this.dashTimer = 0.18;
      this.dashCd = 0.7;
      this.invuln = Math.max(this.invuln, 0.22);
      this.vx = this.facing * 620;
      spawnParticles(this.x + this.w / 2, this.y + this.h - 6, 12,
        { color: "#9fb6ff", spread: 1, vy0: -1, vy1: 1, life: 0.5, grav: 4 });
    },

    hurt(dmg) {
      if (this.invuln > 0 || this.dashTimer > 0) return;
      this.hp -= dmg;
      this.invuln = 1.0;
      shake(8, 0.3);
      spawnParticles(this.x + this.w / 2, this.y + this.h / 2, 14,
        { color: "#b3121b", spread: 4, vy0: -4, vy1: 1, life: 0.7 });
      if (this.hp <= 0) endGame();
    },

    // the sword hitbox during a swing
    swordBox() {
      if (this.attackTimer <= 0) return null;
      const reach = 46, height = 40;
      return {
        x: this.facing > 0 ? this.x + this.w - 6 : this.x - reach + 6,
        y: this.y + 6,
        w: reach, h: height,
      };
    },

    update(dt) {
      // horizontal movement (dash overrides)
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
      } else {
        let dir = 0;
        if (leftHeld()) dir -= 1;
        if (rightHeld()) dir += 1;
        if (dir !== 0) this.facing = dir;
        this.vx = dir * this.speed;
      }
      this.dashCd = Math.max(0, this.dashCd - dt);

      if (jumpEdge() && this.onGround) {
        this.vy = this.jumpV;
        this.onGround = false;
        spawnParticles(this.x + this.w / 2, this.y + this.h, 6,
          { color: "#caa", spread: 2, vy0: 0, vy1: 2, life: 0.3, grav: 6 });
      }
      if (attackEdge()) this.attack();
      if (dashEdge()) this.dash();

      // gravity
      this.vy += this.grav * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // floor + bounds
      this.x = clamp(this.x, 8, W - this.w - 8);
      if (this.y + this.h >= GROUND_Y) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        this.onGround = true;
      }

      // timers
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.invuln = Math.max(0, this.invuln - dt);

      // resolve sword vs demons
      const sb = this.swordBox();
      if (sb) {
        for (const d of demons) {
          if (d.dead || this.hitSet.has(d)) continue;
          if (aabb(sb, d)) {
            this.hitSet.add(d);
            demonHurt(d, 1, this.facing);
          }
        }
      }
    },

    draw() {
      // flicker while invulnerable
      if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return;

      const cx = this.x + this.w / 2;
      const f = this.facing;

      // shadow
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(cx, GROUND_Y - 2, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // cloak / body
      ctx.fillStyle = "#1d2230";
      roundRect(this.x + 4, this.y + 14, this.w - 8, this.h - 14, 5);
      ctx.fill();
      // chest sash (blood red)
      ctx.fillStyle = "#9c1822";
      ctx.fillRect(this.x + 8, this.y + 20, this.w - 16, 8);
      // head
      ctx.fillStyle = "#caa987";
      ctx.beginPath();
      ctx.arc(cx, this.y + 10, 10, 0, Math.PI * 2);
      ctx.fill();
      // hood
      ctx.fillStyle = "#141823";
      ctx.beginPath();
      ctx.arc(cx, this.y + 8, 11, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      // glowing eye
      ctx.fillStyle = "#ffb347";
      ctx.fillRect(cx + f * 2, this.y + 9, 3, 2);

      // sword
      const swinging = this.attackTimer > 0;
      ctx.save();
      ctx.translate(cx + f * 10, this.y + 24);
      const baseAngle = f > 0 ? -0.4 : Math.PI + 0.4;
      const swing = swinging ? (1 - this.attackTimer / 0.18) * 1.6 * f : 0;
      ctx.rotate(baseAngle + swing);
      // blade
      const grad = ctx.createLinearGradient(0, 0, 44, 0);
      grad.addColorStop(0, "#eee");
      grad.addColorStop(1, "#9aa");
      ctx.fillStyle = grad;
      ctx.fillRect(6, -2, 40, 4);
      // glow when swinging
      if (swinging) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#ffd27a";
        ctx.fillRect(6, -4, 42, 8);
        ctx.globalAlpha = 1;
      }
      // hilt
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(-2, -3, 8, 6);
      ctx.restore();
    },
  };

  // ---------- Demons ----------
  const demons = [];

  const DEMON_TYPES = {
    imp:   { w: 30, h: 36, hp: 1, speed: 95,  dmg: 1, color: "#5a1010", score: 10, eye: "#ffae3b" },
    brute: { w: 48, h: 58, hp: 3, speed: 55,  dmg: 2, color: "#2e2230", score: 30, eye: "#ff5a1f" },
    hound: { w: 42, h: 28, hp: 1, speed: 165, dmg: 1, color: "#3a0d0d", score: 20, eye: "#7fff5a" },
  };

  function spawnDemon(type) {
    const t = DEMON_TYPES[type];
    const fromLeft = Math.random() < 0.5;
    demons.push({
      type,
      x: fromLeft ? -t.w - rand(0, 80) : W + rand(0, 80),
      y: GROUND_Y - t.h,
      w: t.w, h: t.h,
      vy: 0,
      hp: t.hp, maxHp: t.hp,
      speed: t.speed * rand(0.85, 1.15),
      dmg: t.dmg,
      color: t.color, eye: t.eye, score: t.score,
      dir: fromLeft ? 1 : -1,
      dead: false,
      hitFlash: 0,
      bob: rand(0, Math.PI * 2),
      attackCd: 0,
    });
  }

  function demonHurt(d, dmg, fromFacing) {
    d.hp -= dmg;
    d.hitFlash = 0.12;
    d.x += fromFacing * 10; // knockback
    spawnParticles(d.x + d.w / 2, d.y + d.h / 2, 10,
      { color: "#7a0d0d", spread: 4, vy0: -3, vy1: 1, life: 0.6 });
    shake(4, 0.12);
    if (d.hp <= 0) {
      d.dead = true;
      game.kills++;
      game.score += d.score;
      game.toNextWave--;
      addFloater(d.x + d.w / 2, d.y, "+" + d.score);
      spawnParticles(d.x + d.w / 2, d.y + d.h / 2, 22,
        { color: "#ff5a1f", spread: 5, vy0: -5, vy1: 2, life: 0.9, size1: 5 });
    }
  }

  function updateDemon(d, dt) {
    if (d.dead) return;
    d.hitFlash = Math.max(0, d.hitFlash - dt);
    d.attackCd = Math.max(0, d.attackCd - dt);
    d.bob += dt * 6;

    // chase the player
    const toPlayer = (player.x + player.w / 2) - (d.x + d.w / 2);
    d.dir = toPlayer > 0 ? 1 : -1;
    const dist = Math.abs(toPlayer);
    if (dist > 4) d.x += d.dir * d.speed * dt;

    // contact damage
    if (aabb(d, player) && d.attackCd <= 0) {
      player.hurt(d.dmg);
      d.attackCd = 0.6;
    }
  }

  function drawDemon(d) {
    if (d.dead) return;
    const cx = d.x + d.w / 2;
    const bobY = Math.sin(d.bob) * 2;

    // shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y - 2, d.w * 0.45, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(0, bobY);

    // body
    ctx.fillStyle = d.hitFlash > 0 ? "#ffffff" : d.color;
    roundRect(d.x, d.y, d.w, d.h, 6);
    ctx.fill();

    // belly glow (inner fire)
    if (d.hitFlash <= 0) {
      const g = ctx.createRadialGradient(cx, d.y + d.h * 0.6, 1, cx, d.y + d.h * 0.6, d.w * 0.5);
      g.addColorStop(0, "rgba(255,90,31,0.6)");
      g.addColorStop(1, "rgba(255,90,31,0)");
      ctx.fillStyle = g;
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }

    // horns
    ctx.fillStyle = d.hitFlash > 0 ? "#fff" : "#d8c7a8";
    const hornH = d.h * 0.28;
    ctx.beginPath();
    ctx.moveTo(d.x + 4, d.y + 4);
    ctx.lineTo(d.x - 3, d.y - hornH);
    ctx.lineTo(d.x + 10, d.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(d.x + d.w - 4, d.y + 4);
    ctx.lineTo(d.x + d.w + 3, d.y - hornH);
    ctx.lineTo(d.x + d.w - 10, d.y + 2);
    ctx.closePath();
    ctx.fill();

    // eyes
    if (d.hitFlash <= 0) {
      ctx.fillStyle = d.eye;
      ctx.shadowColor = d.eye;
      ctx.shadowBlur = 8;
      const eyeY = d.y + d.h * 0.32;
      ctx.fillRect(cx - 8, eyeY, 5, 4);
      ctx.fillRect(cx + 3, eyeY, 5, 4);
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // hp pips for tougher demons
    if (d.maxHp > 1 && !d.dead) {
      const pipW = d.w / d.maxHp;
      for (let i = 0; i < d.maxHp; i++) {
        ctx.fillStyle = i < d.hp ? "#ff5a1f" : "#3a1a14";
        ctx.fillRect(d.x + i * pipW + 1, d.y - 8, pipW - 2, 3);
      }
    }
  }

  // ---------- Game state / waves ----------
  const game = {
    state: "menu", // menu | play | paused | over
    wave: 1,
    kills: 0,
    score: 0,
    best: Number(localStorage.getItem("ds_best") || 0),
    toNextWave: 0,
    spawnTimer: 0,
    spawnInterval: 1.4,
    aliveCap: 6,
  };

  function startWave(n) {
    game.wave = n;
    // total demons to kill this wave grows with n
    game.toNextWave = 4 + Math.floor(n * 1.6);
    game.spawnInterval = Math.max(0.45, 1.5 - n * 0.08);
    game.aliveCap = Math.min(12, 4 + Math.floor(n / 1.5));
    game.spawnTimer = 0.5;
    addFloater(W / 2, H / 2 - 40, "WAVE " + n, "#ffb347");
  }

  function pickType() {
    const n = game.wave;
    const r = Math.random();
    if (n >= 3 && r < 0.18) return "brute";
    if (n >= 2 && r < 0.45) return "hound";
    return "imp";
  }

  function updateSpawns(dt) {
    if (game.toNextWave <= 0 && demons.every((d) => d.dead)) {
      startWave(game.wave + 1);
      return;
    }
    const aliveLeftToSpawn = game.toNextWave - demons.filter((d) => !d.dead).length;
    if (aliveLeftToSpawn <= 0) return;
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0 && demons.filter((d) => !d.dead).length < game.aliveCap) {
      spawnDemon(pickType());
      game.spawnTimer = game.spawnInterval * rand(0.7, 1.2);
    }
  }

  // ---------- Screen shake ----------
  let shakeMag = 0, shakeTime = 0;
  function shake(mag, time) { shakeMag = Math.max(shakeMag, mag); shakeTime = Math.max(shakeTime, time); }

  // ---------- Background (the hellscape) ----------
  const embers = Array.from({ length: 40 }, () => ({
    x: rand(0, W), y: rand(0, H), vy: rand(-12, -30), size: rand(1, 3), a: rand(0.3, 0.9),
  }));

  function drawBackground(t) {
    // sky gradient — dark red hell
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#1a0608");
    sky.addColorStop(0.55, "#3a0a08");
    sky.addColorStop(1, "#5a1408");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // distant volcano glow
    const glow = ctx.createRadialGradient(W * 0.5, GROUND_Y, 10, W * 0.5, GROUND_Y, 360);
    glow.addColorStop(0, "rgba(255,90,20,0.35)");
    glow.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // jagged mountains (parallax silhouettes)
    drawMountains(W * 0.22, 150, "#160405");
    drawMountains(W * 0.78, 180, "#1d0607");
    drawMountains(W * 0.5, 220, "#0e0304");

    // dead trees
    drawDeadTree(60, GROUND_Y, 90, "#0a0405");
    drawDeadTree(W - 70, GROUND_Y, 100, "#0a0405");

    // ember particles rising
    for (const e of embers) {
      e.y += e.vy * 0.016;
      e.x += Math.sin((t + e.y) * 0.01) * 0.3;
      if (e.y < -5) { e.y = GROUND_Y; e.x = rand(0, W); }
      ctx.globalAlpha = e.a;
      ctx.fillStyle = "#ff7a2a";
      ctx.fillRect(e.x, e.y, e.size, e.size);
    }
    ctx.globalAlpha = 1;

    // lava river below the bridge
    drawLava(t);

    // the bridge / walkable ground
    drawBridge();
  }

  function drawMountains(cx, height, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - height, GROUND_Y);
    ctx.lineTo(cx - height * 0.3, GROUND_Y - height * 0.7);
    ctx.lineTo(cx, GROUND_Y - height);
    ctx.lineTo(cx + height * 0.35, GROUND_Y - height * 0.6);
    ctx.lineTo(cx + height, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawDeadTree(x, baseY, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - h);
    ctx.moveTo(x, baseY - h * 0.7);
    ctx.lineTo(x - 22, baseY - h * 0.95);
    ctx.moveTo(x, baseY - h * 0.55);
    ctx.lineTo(x + 20, baseY - h * 0.8);
    ctx.moveTo(x, baseY - h * 0.85);
    ctx.lineTo(x + 14, baseY - h * 1.05);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawLava(t) {
    const lavaTop = GROUND_Y;
    const g = ctx.createLinearGradient(0, lavaTop, 0, H);
    g.addColorStop(0, "#ffd23a");
    g.addColorStop(0.4, "#ff5a1f");
    g.addColorStop(1, "#7a1004");
    ctx.fillStyle = g;
    ctx.fillRect(0, lavaTop, W, H - lavaTop);

    // flowing bright veins
    ctx.strokeStyle = "rgba(255,230,150,0.7)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const yy = lavaTop + 18 + i * 18;
      for (let x = 0; x <= W; x += 20) {
        const off = Math.sin((x + t * (40 + i * 15)) * 0.02 + i) * 5;
        if (x === 0) ctx.moveTo(x, yy + off);
        else ctx.lineTo(x, yy + off);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  function drawBridge() {
    // stone slab the player walks on
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 28);
    g.addColorStop(0, "#2b2422");
    g.addColorStop(1, "#120c0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, W, 28);
    // cracks / planks
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    for (let x = 30; x < W; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x - 6, GROUND_Y + 28);
      ctx.stroke();
    }
    // glowing rim where stone meets lava
    ctx.fillStyle = "rgba(255,120,40,0.5)";
    ctx.fillRect(0, GROUND_Y + 26, W, 3);
  }

  // ---------- Helpers ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- HUD ----------
  function renderHud() {
    let h = "";
    for (let i = 0; i < player.maxHp; i++) h += i < player.hp ? "❤️" : "🖤";
    el.hearts.textContent = h;
    el.wave.textContent = game.wave;
    el.kills.textContent = game.kills;
    el.score.textContent = game.score;
  }

  // ---------- Game flow ----------
  function startGame() {
    demons.length = 0;
    particles.length = 0;
    floaters.length = 0;
    game.kills = 0;
    game.score = 0;
    player.reset();
    startWave(1);
    game.state = "play";
    el.overlay.classList.add("hidden");
    el.gameover.classList.add("hidden");
    el.hud.classList.remove("hidden");
  }

  function endGame() {
    game.state = "over";
    game.best = Math.max(game.best, game.score);
    localStorage.setItem("ds_best", String(game.best));
    el.finalKills.textContent = game.kills;
    el.finalScore.textContent = game.score;
    el.bestScore.textContent = game.best;
    el.gameover.classList.remove("hidden");
    el.hud.classList.add("hidden");
    spawnParticles(player.x + player.w / 2, player.y + player.h / 2, 40,
      { color: "#b3121b", spread: 6, vy0: -6, vy1: 2, life: 1.1, size1: 5 });
  }

  function togglePause() {
    if (game.state === "play") game.state = "paused";
    else if (game.state === "paused") game.state = "play";
  }

  el.startBtn.addEventListener("click", startGame);
  el.retryBtn.addEventListener("click", startGame);

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // clamp big gaps
    const t = now / 16;

    // ----- update -----
    if (game.state === "play") {
      player.update(dt);
      for (const d of demons) updateDemon(d, dt);
      updateSpawns(dt);
      // cull dead demons occasionally
      for (let i = demons.length - 1; i >= 0; i--) if (demons[i].dead) demons.splice(i, 1);
      updateParticles(dt);
      updateFloaters(dt);
      renderHud();
    } else {
      updateParticles(dt);
      updateFloaters(dt);
    }

    // screen shake offset
    let sx = 0, sy = 0;
    if (shakeTime > 0) {
      shakeTime -= dt;
      sx = rand(-shakeMag, shakeMag);
      sy = rand(-shakeMag, shakeMag);
      if (shakeTime <= 0) shakeMag = 0;
    }

    // ----- draw -----
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground(t);

    // depth-sort demons by y so closer ones overlap correctly
    const sorted = demons.slice().sort((a, b) => a.y + a.h - (b.y + b.h));
    for (const d of sorted) drawDemon(d);
    if (game.state !== "menu") player.draw();
    drawParticles();

    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life / 0.9, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = "bold 20px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // pause veil
    if (game.state === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffb347";
      ctx.font = "bold 40px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, H / 2);
      ctx.font = "16px Trebuchet MS, sans-serif";
      ctx.fillStyle = "#d8c7a8";
      ctx.fillText("press P or Esc to resume", W / 2, H / 2 + 32);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
