/* ============================================================================
 * DEMON SLAYER — HELLSCAPE
 * A self-contained 2D arena survival slasher. All art is drawn procedurally
 * on the canvas (no external image assets), so the whole game ships in three
 * plain files with nothing to license or download.
 *
 * Layout of this file:
 *   1. Constants & utilities
 *   2. Input handling (keyboard, mouse, touch)
 *   3. Audio (tiny WebAudio blip synth)
 *   4. Particles & floating text
 *   5. Background (parallax hellscape)
 *   6. Player (the slayer)
 *   7. Enemies (skeleton / imp / brute / wraith / boss) + projectiles
 *   8. Game loop & wave director
 *   9. HUD + screen wiring + high score
 * ========================================================================== */

(() => {
  "use strict";

  // --- 1. Constants & utilities --------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 960 logical px
  const H = canvas.height;  // 540 logical px

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const angleDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  // --- 2. Input ------------------------------------------------------------
  const keys = Object.create(null);
  const mouse = { x: W / 2, y: H / 2, down: false };

  addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase()))
      e.preventDefault();
  });
  addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  function canvasPos(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * W,
      y: ((clientY - r.top) / r.height) * H,
    };
  }
  canvas.addEventListener("mousemove", (e) => {
    const p = canvasPos(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
  });
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.button === 0) { mouse.down = true; game.player && game.player.tryAttack(); }
    if (e.button === 2) { game.player && game.player.tryDash(); }
  });
  addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Touch: left half = movement joystick, right half = aim + auto-slash,
  // bottom-right button = dash. Enabled on first touch so desktop is unaffected.
  const touch = {
    enabled: false,
    joyId: null, joyOX: 0, joyOY: 0, joyVX: 0, joyVY: 0,
    aimId: null, aimAngle: null,
  };
  const DASH_BTN = { x: W - 78, y: H - 78, r: 42 };
  function inDashBtn(p) {
    return dist2(p.x, p.y, DASH_BTN.x, DASH_BTN.y) < DASH_BTN.r * DASH_BTN.r;
  }
  function handleTouchStart(e) {
    e.preventDefault();
    touch.enabled = true;
    for (const t of e.changedTouches) {
      const p = canvasPos(t.clientX, t.clientY);
      if (game.state !== "playing") { game.touchTap(p); continue; }
      if (inDashBtn(p)) { game.player && game.player.tryDash(); touch._dashId = t.identifier; }
      else if (p.x < W * 0.5 && touch.joyId === null) {
        touch.joyId = t.identifier; touch.joyOX = p.x; touch.joyOY = p.y;
        touch.joyVX = 0; touch.joyVY = 0;
      } else if (touch.aimId === null) {
        touch.aimId = t.identifier;
        if (game.player) touch.aimAngle = Math.atan2(p.y - game.player.y, p.x - game.player.x);
      }
    }
  }
  function handleTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = canvasPos(t.clientX, t.clientY);
      if (t.identifier === touch.joyId) {
        let dx = p.x - touch.joyOX, dy = p.y - touch.joyOY;
        const m = Math.hypot(dx, dy), max = 60;
        if (m > max) { dx = dx / m * max; dy = dy / m * max; }
        touch.joyVX = dx / max; touch.joyVY = dy / max;
      } else if (t.identifier === touch.aimId && game.player) {
        touch.aimAngle = Math.atan2(p.y - game.player.y, p.x - game.player.x);
      }
    }
  }
  function handleTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) { touch.joyId = null; touch.joyVX = 0; touch.joyVY = 0; }
      if (t.identifier === touch.aimId) { touch.aimId = null; touch.aimAngle = null; }
      if (t.identifier === touch._dashId) touch._dashId = null;
    }
  }
  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd);
  canvas.addEventListener("touchcancel", handleTouchEnd);

  // --- 3. Audio ------------------------------------------------------------
  const Sound = {
    ctx: null, on: true,
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { this.on = false; }
    },
    blip(freq, dur, type = "square", vol = 0.12, slideTo = null) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + dur);
    },
    slash() { this.blip(720, 0.12, "sawtooth", 0.10, 240); },
    hit()   { this.blip(180, 0.10, "square", 0.12, 90); },
    dash()  { this.blip(440, 0.16, "sine", 0.10, 880); },
    hurt()  { this.blip(140, 0.22, "sawtooth", 0.16, 60); },
    death() { this.blip(90, 0.35, "triangle", 0.16, 40); },
    wave()  { this.blip(330, 0.18, "sine", 0.12, 660); },
    cast()  { this.blip(520, 0.14, "triangle", 0.08, 760); },
    boss()  { this.blip(70, 0.6, "sawtooth", 0.18, 150); },
  };

  // --- 4. Particles & floating text ----------------------------------------
  const particles = [];
  const floaters = [];

  function spawnParticle(x, y, opt = {}) {
    particles.push({
      x, y,
      vx: opt.vx ?? rand(-1, 1),
      vy: opt.vy ?? rand(-1, 1),
      life: opt.life ?? rand(0.3, 0.8),
      age: 0,
      size: opt.size ?? rand(1.5, 3.5),
      color: opt.color ?? "#ff6a1a",
      grav: opt.grav ?? 0,
      drag: opt.drag ?? 0.92,
      glow: opt.glow ?? false,
    });
  }
  function burst(x, y, n, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(opt.spdMin ?? 1, opt.spdMax ?? 4);
      spawnParticle(x, y, { ...opt, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
    }
  }
  function floatText(x, y, text, color = "#ffd36a", big = false) {
    floaters.push({ x, y, text, color, age: 0, life: big ? 1.3 : 0.9, big });
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt * 60;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt; f.y -= 28 * dt;
      if (f.age >= f.life) floaters.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = t;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    for (const f of floaters) {
      const t = 1 - f.age / f.life;
      ctx.globalAlpha = t;
      ctx.font = `bold ${f.big ? 28 : 16}px 'Trebuchet MS', sans-serif`;
      ctx.fillStyle = f.color;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // --- 5. Background -------------------------------------------------------
  const Background = {
    embers: [], lavaPhase: 0, ridges: [],
    init() {
      this.embers = [];
      for (let i = 0; i < 60; i++) {
        this.embers.push({
          x: rand(0, W), y: rand(0, H),
          vy: rand(-0.4, -1.2), vx: rand(-0.3, 0.3),
          size: rand(0.6, 2.2), flick: rand(0, TAU),
        });
      }
      this.ridges = [this._ridge(0.62, 90, "#241b30"), this._ridge(0.70, 130, "#1b1422")];
    },
    _ridge(baseY, amp, color) {
      const pts = []; let x = -40; let y = H * baseY;
      while (x < W + 40) { pts.push({ x, y }); x += rand(40, 90); y = H * baseY + rand(-amp, amp * 0.4); }
      return { pts, color };
    },
    update(dt) {
      this.lavaPhase += dt;
      for (const e of this.embers) {
        e.y += e.vy; e.x += e.vx; e.flick += dt * 6;
        if (e.y < -4) { e.y = H + 4; e.x = rand(0, W); }
      }
    },
    draw() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#221031"); sky.addColorStop(0.45, "#3a1430");
      sky.addColorStop(0.75, "#551a22"); sky.addColorStop(1, "#1a0d12");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      const vg = ctx.createRadialGradient(W * 0.74, H * 0.42, 10, W * 0.74, H * 0.42, 260);
      vg.addColorStop(0, "rgba(255,90,20,0.35)"); vg.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      for (const r of this.ridges) {
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.moveTo(-40, H);
        for (const p of r.pts) ctx.lineTo(p.x, p.y);
        ctx.lineTo(W + 40, H); ctx.closePath(); ctx.fill();
      }

      ctx.fillStyle = "#140d16";
      ctx.beginPath();
      ctx.moveTo(W * 0.62, H * 0.62); ctx.lineTo(W * 0.74, H * 0.28); ctx.lineTo(W * 0.86, H * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,120,30,0.9)";
      ctx.beginPath(); ctx.ellipse(W * 0.74, H * 0.29, 12, 5, 0, 0, TAU); ctx.fill();

      const grd = ctx.createLinearGradient(0, H * 0.66, 0, H);
      grd.addColorStop(0, "#241621"); grd.addColorStop(1, "#0e0810");
      ctx.fillStyle = grd; ctx.fillRect(0, H * 0.66, W, H * 0.34);

      ctx.strokeStyle = "rgba(255,90,20,0.5)"; ctx.lineWidth = 2;
      ctx.shadowColor = "#ff5a14"; ctx.shadowBlur = 8;
      const pulse = 0.5 + 0.5 * Math.sin(this.lavaPhase * 2);
      ctx.globalAlpha = 0.4 + 0.35 * pulse;
      for (let i = 0; i < 5; i++) {
        const y = H * (0.72 + i * 0.05);
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= W; x += 60) ctx.lineTo(x, y + Math.sin((x + i * 50) * 0.02 + this.lavaPhase) * 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;

      for (const e of this.embers) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(e.flick));
        ctx.fillStyle = "#ffb347";
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };

  // --- 6. Player -----------------------------------------------------------
  class Player {
    constructor() {
      this.x = W / 2; this.y = H * 0.78; this.r = 14;
      this.speed = 3.0; this.maxHp = 100; this.hp = this.maxHp;
      this.facing = 0; this.invuln = 0;
      this.atkCd = 0; this.atkCdTime = 0.28; this.atkTimer = 0; this.atkDur = 0.18;
      this.atkRange = 64; this.atkArc = Math.PI * 0.85; this.atkDmg = 34;
      this.swingFrom = 0; this.swingDir = 1; this.hitSet = null;
      this.dashCd = 0; this.dashCdTime = 0.9; this.dashTimer = 0; this.dashVX = 0; this.dashVY = 0;
      this.combo = 0; this.comboTimer = 0;
      // upgrade-driven extras
      this.lifesteal = 0;   // hp healed per kill
      this.emberLevel = 0;  // ranged slash projectiles per swing
    }

    tryAttack() {
      if (game.state !== "playing" || this.atkCd > 0) return;
      this.atkCd = this.atkCdTime; this.atkTimer = this.atkDur; this.hitSet = new Set();
      this.swingDir *= -1;
      this.swingFrom = this.facing - this.swingDir * this.atkArc / 2;
      Sound.slash();
      const tx = this.x + Math.cos(this.facing) * this.atkRange * 0.6;
      const ty = this.y + Math.sin(this.facing) * this.atkRange * 0.6;
      burst(tx, ty, 6, { color: "#bfe9ff", spdMin: 1, spdMax: 3, life: 0.3, glow: true, size: 2 });
      // ranged "ember slash" projectiles, one fan per ember level
      if (this.emberLevel > 0) {
        const spread = 0.16;
        for (let i = 0; i < this.emberLevel; i++) {
          const off = (i - (this.emberLevel - 1) / 2) * spread;
          game.spawnPlayerShot(this.facing + off, Math.round(this.atkDmg * 0.55));
        }
        Sound.cast();
      }
    }

    tryDash() {
      if (game.state !== "playing" || this.dashCd > 0) return;
      this.dashCd = this.dashCdTime; this.dashTimer = 0.16;
      const a = this.facing;
      this.dashVX = Math.cos(a) * 11; this.dashVY = Math.sin(a) * 11;
      this.invuln = Math.max(this.invuln, 0.22);
      Sound.dash();
      for (let i = 0; i < 10; i++)
        spawnParticle(this.x, this.y, {
          vx: -Math.cos(a) * rand(0.5, 2), vy: -Math.sin(a) * rand(0.5, 2),
          color: "#9be7ff", life: 0.4, size: rand(2, 4), glow: true,
        });
    }

    hurt(dmg) {
      if (this.invuln > 0) return;
      this.hp -= dmg; this.invuln = 0.7; this.combo = 0;
      Sound.hurt(); game.shake(8);
      burst(this.x, this.y, 12, { color: "#c0162a", spdMin: 1, spdMax: 4, life: 0.5 });
      if (this.hp <= 0) { this.hp = 0; game.over(); }
    }

    addCombo() { this.combo++; this.comboTimer = 2.2; }

    update(dt) {
      this.atkCd = Math.max(0, this.atkCd - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      if (this.atkTimer > 0) this.atkTimer -= dt;
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

      // facing: touch aim overrides mouse when active
      if (touch.aimId !== null && touch.aimAngle !== null) this.facing = touch.aimAngle;
      else if (!touch.enabled) this.facing = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      else if (touch.joyVX || touch.joyVY) this.facing = Math.atan2(touch.joyVY, touch.joyVX);

      // auto-slash while aiming on touch
      if (touch.aimId !== null) this.tryAttack();

      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.x += this.dashVX; this.y += this.dashVY;
        if (Math.random() < 0.8)
          spawnParticle(this.x, this.y, { color: "#7fd8ff", life: 0.3, size: 3, glow: true, vx: 0, vy: 0 });
      } else {
        let dx = 0, dy = 0;
        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;
        if (touch.joyVX || touch.joyVY) { dx += touch.joyVX; dy += touch.joyVY; }
        if (dx || dy) {
          const m = Math.hypot(dx, dy);
          this.x += (dx / m) * this.speed; this.y += (dy / m) * this.speed;
        }
        if (keys[" "] && this.atkCd === 0) this.tryAttack();
        if (keys["shift"] && this.dashCd === 0) this.tryDash();
      }

      this.x = clamp(this.x, this.r, W - this.r);
      this.y = clamp(this.y, H * 0.34, H - this.r);

      if (this.atkTimer > 0) this._resolveSwing();
    }

    _resolveSwing() {
      for (const e of game.enemies) {
        if (e.dead || this.hitSet.has(e)) continue;
        const reach = this.atkRange + e.r;
        if (dist2(this.x, this.y, e.x, e.y) > reach * reach) continue;
        const ang = Math.atan2(e.y - this.y, e.x - this.x);
        if (Math.abs(angleDiff(ang, this.facing)) <= this.atkArc / 2) {
          this.hitSet.add(e);
          e.hurt(this.atkDmg, this.facing);
          this.addCombo();
        }
      }
    }

    draw() {
      const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(0, this.r * 0.9, this.r, this.r * 0.4, 0, 0, TAU); ctx.fill();
      ctx.rotate(this.facing);
      if (!blink) {
        ctx.fillStyle = "#2b2f3a";
        ctx.beginPath(); ctx.ellipse(-2, 0, this.r, this.r * 0.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#9c1a26"; ctx.fillRect(-this.r * 0.5, -3, this.r * 0.9, 6);
        ctx.fillStyle = "#d9c9a8";
        ctx.beginPath(); ctx.arc(this.r * 0.4, 0, this.r * 0.5, 0, TAU); ctx.fill();
      }
      let bladeAng;
      if (this.atkTimer > 0) {
        const t = 1 - this.atkTimer / this.atkDur;
        bladeAng = this.swingDir * (-this.atkArc / 2 + this.atkArc * t);
      } else bladeAng = this.swingDir * -0.35;
      ctx.rotate(bladeAng);
      ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 3;
      ctx.shadowColor = "#9be7ff"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(this.r * 0.3, 0); ctx.lineTo(this.r * 0.3 + this.atkRange, 0); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#caa14a"; ctx.fillRect(this.r * 0.2, -3, 5, 6);
      ctx.restore();

      if (this.atkTimer > 0) {
        const t = 1 - this.atkTimer / this.atkDur;
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.strokeStyle = "#cdefff"; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, this.atkRange * 0.9, this.swingFrom, this.swingFrom + this.swingDir * this.atkArc * t);
        ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      }
    }
  }

  // --- 7. Enemies & projectiles --------------------------------------------
  const ENEMY_TYPES = {
    skeleton: { name: "skeleton", r: 13, hp: 40, speed: 1.15, dmg: 8, score: 10, color: "#d7d2c2", accent: "#8a8472" },
    imp:      { name: "imp", r: 11, hp: 26, speed: 2.0, dmg: 6, score: 14, color: "#7a1f2a", accent: "#ffcf3a", weave: true },
    brute:    { name: "brute", r: 22, hp: 130, speed: 0.7, dmg: 18, score: 30, color: "#5a1410", accent: "#ff5a1e", heavy: true },
    wraith:   { name: "wraith", r: 14, hp: 50, speed: 1.1, dmg: 0, score: 22, color: "#3a2a55", accent: "#b07bff", ranged: true, prefDist: 220, shotDmg: 12 },
  };

  class Enemy {
    constructor(type, x, y) {
      const t = ENEMY_TYPES[type];
      this.type = type; this.def = t;
      this.x = x; this.y = y; this.r = t.r;
      const D = game.diff;
      this.maxHp = Math.round(t.hp * D.hpMul); this.hp = this.maxHp;
      this.speed = t.speed; this.dmg = Math.round(t.dmg * D.dmgMul);
      this.dead = false; this.hitFlash = 0;
      this.kbx = 0; this.kby = 0; this.atkCd = 0; this.shootCd = rand(1, 2.5);
      this.phase = rand(0, TAU); this.bob = rand(0, TAU);
      this.isBoss = false;
    }

    hurt(dmg, fromAngle) {
      this.hp -= dmg; this.hitFlash = 0.12;
      const kb = this.def.heavy || this.isBoss ? (this.isBoss ? 1.5 : 4) : 9;
      this.kbx += Math.cos(fromAngle) * kb; this.kby += Math.sin(fromAngle) * kb;
      Sound.hit(); game.shake(this.def.heavy || this.isBoss ? 5 : 3);
      const col = this.type === "skeleton" ? "#e9e4d4" : (this.def.color || "#c0162a");
      burst(this.x, this.y, 8, { color: col, spdMin: 1, spdMax: 4, life: 0.4 });
      floatText(this.x, this.y - this.r, String(dmg), "#ffd36a");
      if (this.hp <= 0 && !this.dead) this.die();
    }

    die() {
      this.dead = true;
      game.score += this.def.score; game.kills++;
      Sound.death();
      const col = this.type === "skeleton" ? "#e9e4d4" : this.def.color;
      const n = this.isBoss ? 60 : 22;
      burst(this.x, this.y, n, { color: col, spdMin: 1, spdMax: this.isBoss ? 9 : 6, life: 0.8, grav: 0.05 });
      burst(this.x, this.y, this.isBoss ? 30 : 10, { color: "#ff6a1a", spdMin: 1, spdMax: 5, life: 0.6, glow: true });
      if (this.isBoss) { game.shake(16); floatText(this.x, this.y - 30, "FIEND SLAIN", "#ff8a3a", true); }
      const dropChance = this.isBoss ? 1 : 0.12;
      if (Math.random() < dropChance) game.spawnPickup(this.x, this.y);
      if (this.isBoss) { game.spawnPickup(this.x - 30, this.y); game.spawnPickup(this.x + 30, this.y); }
      // lifesteal — enemies only ever die to the player here
      const p = game.player;
      if (p && p.lifesteal > 0 && p.hp > 0) {
        p.hp = clamp(p.hp + p.lifesteal, 0, p.maxHp);
        floatText(this.x, this.y - this.r - 6, "+" + p.lifesteal, "#6dff8a");
      }
    }

    shootAt(px, py, speed, dmg, color) {
      const a = Math.atan2(py - this.y, px - this.x);
      game.enemyShots.push({
        x: this.x, y: this.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 6, dmg, color, life: 4, age: 0,
      });
      Sound.cast();
      burst(this.x, this.y, 5, { color, spdMax: 2, life: 0.3, glow: true });
    }

    update(dt) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.atkCd = Math.max(0, this.atkCd - dt);
      this.shootCd = Math.max(0, this.shootCd - dt);
      this.bob += dt * 6;

      const p = game.player;
      let ang = Math.atan2(p.y - this.y, p.x - this.x);
      const d = Math.hypot(p.x - this.x, p.y - this.y);

      if (this.isBoss) { this._bossUpdate(dt, ang, d); }
      else if (this.def.ranged) {
        // keep preferred distance, strafe a little, lob fireballs
        const pref = this.def.prefDist;
        let move = 0;
        if (d > pref + 30) move = 1; else if (d < pref - 30) move = -1;
        const strafe = Math.sin(this.bob * 0.4 + this.phase) * 0.5;
        this.x += (Math.cos(ang) * move - Math.sin(ang) * strafe) * this.speed;
        this.y += (Math.sin(ang) * move + Math.cos(ang) * strafe) * this.speed;
        if (this.shootCd === 0 && d < 460) { this.shootAt(p.x, p.y, 3.6, this.def.shotDmg, this.def.accent); this.shootCd = rand(1.6, 2.6); }
      } else {
        if (this.def.weave) ang += Math.sin(this.bob * 0.5 + this.phase) * 0.6;
        this.x += Math.cos(ang) * this.speed; this.y += Math.sin(ang) * this.speed;
      }
      this.x += this.kbx; this.y += this.kby;
      this.kbx *= 0.8; this.kby *= 0.8;

      for (const o of game.enemies) {
        if (o === this || o.dead) continue;
        const dx = this.x - o.x, dy = this.y - o.y;
        const dd = dx * dx + dy * dy, minD = this.r + o.r;
        if (dd > 0.001 && dd < minD * minD) {
          const dl = Math.sqrt(dd), push = (minD - dl) / dl * 0.5;
          this.x += dx * push; this.y += dy * push;
        }
      }

      this.x = clamp(this.x, this.r, W - this.r);
      this.y = clamp(this.y, H * 0.32, H - this.r);

      // melee/contact damage (ranged wraiths deal none on touch)
      if (this.dmg > 0 && this.atkCd === 0) {
        const rr = this.r + p.r;
        if (dist2(this.x, this.y, p.x, p.y) < rr * rr) {
          p.hurt(this.dmg); this.atkCd = 0.6;
          this.kbx += Math.cos(ang) * -3; this.kby += Math.sin(ang) * -3;
        }
      }
    }

    _bossUpdate(dt, ang, d) {
      const p = game.player;
      if (this._charge > 0) {
        this._charge -= dt;
        this.x += Math.cos(this._chargeA) * 6.2;
        this.y += Math.sin(this._chargeA) * 6.2;
        if (Math.random() < 0.6) spawnParticle(this.x, this.y, { color: "#ff5a1e", life: 0.3, size: 4, glow: true, vx: 0, vy: 0 });
      } else {
        if (d > 80) { this.x += Math.cos(ang) * this.speed; this.y += Math.sin(ang) * this.speed; }
        this._volleyCd -= dt; this._chargeCd -= dt;
        if (this._volleyCd <= 0) {
          this._volleyCd = rand(2.4, 3.4);
          const base = ang;
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.22;
            game.enemyShots.push({ x: this.x, y: this.y, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4, r: 7, dmg: 14, color: "#ff7a2a", life: 4, age: 0 });
          }
          Sound.cast();
        }
        if (this._chargeCd <= 0) { this._chargeCd = rand(4.5, 6.5); this._charge = 0.5; this._chargeA = ang; Sound.boss(); }
      }
    }

    draw() {
      const bobY = Math.sin(this.bob) * (this.def.weave || this.def.ranged ? 3 : 1.2);
      ctx.save();
      ctx.translate(this.x, this.y + bobY);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(0, this.r * 0.85 - bobY, this.r * 0.9, this.r * 0.35, 0, 0, TAU); ctx.fill();
      const flash = this.hitFlash > 0;
      if (this.isBoss) this._drawBoss(flash);
      else if (this.type === "skeleton") this._drawSkeleton(flash);
      else if (this.type === "imp") this._drawImp(flash);
      else if (this.type === "wraith") this._drawWraith(flash);
      else this._drawBrute(flash);

      if (!this.isBoss && this.hp < this.maxHp) {
        const w = this.r * 2;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(-w / 2, -this.r - 10, w, 4);
        ctx.fillStyle = "#ff5a3c"; ctx.fillRect(-w / 2, -this.r - 10, w * (this.hp / this.maxHp), 4);
      }
      ctx.restore();
    }

    _drawSkeleton(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 2, this.r * 0.7, this.r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = flash ? "#cccccc" : this.def.accent; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-this.r * 0.5, i * 4 + 2); ctx.lineTo(this.r * 0.5, i * 4 + 2); ctx.stroke(); }
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, -this.r * 0.7, this.r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff4a2a"; ctx.shadowColor = "#ff4a2a"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(-this.r * 0.2, -this.r * 0.72, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(this.r * 0.2, -this.r * 0.72, 2, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    _drawImp(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      ctx.fillStyle = flash ? "#ddaaaa" : "#3a0f16";
      const wf = Math.sin(this.bob * 2) * 0.5;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-this.r * 1.6, -this.r * (1 + wf), -this.r * 1.8, this.r * 0.2);
      ctx.quadraticCurveTo(-this.r, this.r * 0.2, 0, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(this.r * 1.6, -this.r * (1 + wf), this.r * 1.8, this.r * 0.2);
      ctx.quadraticCurveTo(this.r, this.r * 0.2, 0, 0); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, this.r * 0.7, 0, TAU); ctx.fill();
      ctx.strokeStyle = body; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-3, -this.r * 0.5); ctx.lineTo(-6, -this.r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, -this.r * 0.5); ctx.lineTo(6, -this.r); ctx.stroke();
      ctx.fillStyle = this.def.accent; ctx.shadowColor = this.def.accent; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(-3, -2, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -2, 2, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    _drawWraith(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      // floating hooded caster with a glowing orb
      const sway = Math.sin(this.bob * 0.5) * 2;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -this.r);
      ctx.quadraticCurveTo(this.r + sway, 0, this.r * 0.5, this.r);
      ctx.quadraticCurveTo(0, this.r * 0.7, -this.r * 0.5, this.r);
      ctx.quadraticCurveTo(-this.r - sway, 0, 0, -this.r);
      ctx.fill();
      // hood opening
      ctx.fillStyle = "#0c0814";
      ctx.beginPath(); ctx.ellipse(0, -this.r * 0.3, this.r * 0.4, this.r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = this.def.accent; ctx.shadowColor = this.def.accent; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(-3, -this.r * 0.35, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -this.r * 0.35, 2, 0, TAU); ctx.fill();
      // charging orb
      const orb = 0.5 + 0.5 * Math.sin(this.bob);
      ctx.globalAlpha = 0.6 + 0.4 * orb;
      ctx.beginPath(); ctx.arc(0, this.r * 0.6, 4 + orb * 2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    _drawBrute(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * 0.95, this.r, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = this.def.accent; ctx.lineWidth = 2;
      ctx.shadowColor = this.def.accent; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-this.r * 0.4, -this.r * 0.4); ctx.lineTo(0, 0); ctx.lineTo(-this.r * 0.2, this.r * 0.5);
      ctx.moveTo(this.r * 0.4, -this.r * 0.3); ctx.lineTo(this.r * 0.1, this.r * 0.4); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = flash ? "#eee" : "#1d0a09"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-this.r * 0.5, -this.r * 0.7); ctx.quadraticCurveTo(-this.r * 1.1, -this.r * 1.1, -this.r * 0.7, -this.r * 1.4);
      ctx.moveTo(this.r * 0.5, -this.r * 0.7); ctx.quadraticCurveTo(this.r * 1.1, -this.r * 1.1, this.r * 0.7, -this.r * 1.4);
      ctx.stroke();
      ctx.fillStyle = "#ffd23a"; ctx.shadowColor = "#ffae2a"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(-this.r * 0.3, -this.r * 0.2, 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(this.r * 0.3, -this.r * 0.2, 3, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    _drawBoss(flash) {
      const r = this.r;
      const body = flash ? "#ffffff" : "#3a0a0c";
      // charging tint
      const charging = this._charge > 0;
      // big hulking torso
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r, 0, 0, TAU); ctx.fill();
      // molten body glow
      ctx.strokeStyle = charging ? "#ffd23a" : "#ff4a14";
      ctx.lineWidth = 3; ctx.shadowColor = "#ff5a1e"; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.4); ctx.lineTo(-r * 0.1, 0.1 * r); ctx.lineTo(-r * 0.3, r * 0.6);
      ctx.moveTo(r * 0.5, -r * 0.5); ctx.lineTo(r * 0.15, r * 0.5);
      ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.7);
      ctx.stroke(); ctx.shadowBlur = 0;
      // colossal horns
      ctx.strokeStyle = "#140405"; ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.75); ctx.quadraticCurveTo(-r * 1.4, -r * 1.3, -r * 0.8, -r * 1.7);
      ctx.moveTo(r * 0.5, -r * 0.75); ctx.quadraticCurveTo(r * 1.4, -r * 1.3, r * 0.8, -r * 1.7);
      ctx.stroke();
      // wings
      ctx.fillStyle = flash ? "#bb8888" : "#23080a";
      const wf = Math.sin(this.bob * 0.8) * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.2);
      ctx.quadraticCurveTo(-r * 2.0, -r * (1.1 + wf), -r * 2.2, r * 0.3);
      ctx.quadraticCurveTo(-r * 1.1, r * 0.1, 0, -r * 0.2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.2);
      ctx.quadraticCurveTo(r * 2.0, -r * (1.1 + wf), r * 2.2, r * 0.3);
      ctx.quadraticCurveTo(r * 1.1, r * 0.1, 0, -r * 0.2); ctx.fill();
      // re-draw torso over wing roots
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r, 0, 0, TAU); ctx.fill();
      // burning eyes
      ctx.fillStyle = "#ffe14a"; ctx.shadowColor = "#ff7a2a"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.25, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.25, 5, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      // fanged maw
      ctx.fillStyle = "#1a0405";
      ctx.beginPath(); ctx.ellipse(0, r * 0.25, r * 0.35, r * 0.18, 0, 0, TAU); ctx.fill();
    }
  }

  function makeBoss(wave) {
    const b = new Enemy("brute", W / 2, H * 0.34);
    b.isBoss = true;
    b.r = 40;
    b.maxHp = Math.round((360 + wave * 70) * game.diff.hpMul);
    b.hp = b.maxHp;
    b.speed = 0.62;
    b.dmg = Math.round(22 * game.diff.dmgMul);
    b.def = { ...ENEMY_TYPES.brute, score: 200, name: "archfiend" };
    b._volleyCd = 2.0; b._chargeCd = 4.0; b._charge = 0; b._chargeA = 0;
    return b;
  }

  function updateEnemyShots(dt) {
    const p = game.player;
    for (let i = game.enemyShots.length - 1; i >= 0; i--) {
      const s = game.enemyShots[i];
      s.age += dt;
      s.x += s.vx; s.y += s.vy;
      if (Math.random() < 0.5)
        spawnParticle(s.x, s.y, { color: s.color, life: 0.25, size: 2, glow: true, vx: 0, vy: 0, drag: 0.8 });
      const off = s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20;
      if (s.age >= s.life || off) { game.enemyShots.splice(i, 1); continue; }
      const rr = s.r + p.r;
      if (game.state === "playing" && dist2(s.x, s.y, p.x, p.y) < rr * rr) {
        p.hurt(s.dmg);
        burst(s.x, s.y, 8, { color: s.color, life: 0.4, glow: true });
        game.enemyShots.splice(i, 1);
      }
    }
  }
  function drawEnemyShots() {
    for (const s of game.enemyShots) {
      ctx.fillStyle = s.color; ctx.shadowColor = s.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function updatePlayerShots(dt) {
    for (let i = game.playerShots.length - 1; i >= 0; i--) {
      const s = game.playerShots[i];
      s.age += dt; s.x += s.vx; s.y += s.vy;
      if (Math.random() < 0.6)
        spawnParticle(s.x, s.y, { color: "#bfe9ff", life: 0.2, size: 2, glow: true, vx: 0, vy: 0, drag: 0.8 });
      const off = s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20;
      if (s.age >= s.life || off || s.pierce < 0) { game.playerShots.splice(i, 1); continue; }
      for (const e of game.enemies) {
        if (e.dead || s.hit.has(e)) continue;
        const rr = s.r + e.r;
        if (dist2(s.x, s.y, e.x, e.y) < rr * rr) {
          s.hit.add(e);
          e.hurt(s.dmg, Math.atan2(s.vy, s.vx));
          s.pierce--;
          if (s.pierce < 0) break;
        }
      }
    }
  }
  function drawPlayerShots() {
    for (const s of game.playerShots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = "#dff4ff"; ctx.shadowColor = "#9be7ff"; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r * 1.8, s.r * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // --- 8. Difficulty, upgrades, game loop & wave director ------------------
  const DIFFICULTIES = {
    easy:   { name: "Cinder",  hpMul: 0.8, dmgMul: 0.7, spawnMul: 1.2, playerHp: 130 },
    normal: { name: "Ember",   hpMul: 1.0, dmgMul: 1.0, spawnMul: 1.0, playerHp: 100 },
    hard:   { name: "Inferno", hpMul: 1.35, dmgMul: 1.3, spawnMul: 0.8, playerHp: 80 },
  };

  // Roguelite boons offered between waves. `apply(p, g)` mutates the player/game.
  // Stat boons stack; mechanic boons (lifesteal, ember) stack in strength too.
  const UPGRADES = [
    { id: "blade", icon: "⚔️", name: "Sharpened Blade", desc: "+12 slash damage",
      apply: (p) => { p.atkDmg += 12; } },
    { id: "swift", icon: "⚡", name: "Swift Strikes", desc: "Attack 15% faster",
      apply: (p) => { p.atkCdTime = Math.max(0.12, p.atkCdTime * 0.85); } },
    { id: "fleet", icon: "🥾", name: "Fleet Footed", desc: "+18% move speed",
      apply: (p) => { p.speed += 0.55; } },
    { id: "vital", icon: "❤️", name: "Vital Surge", desc: "+25 max HP & heal 25",
      apply: (p) => { p.maxHp += 25; p.hp = clamp(p.hp + 25, 0, p.maxHp); } },
    { id: "phantom", icon: "💨", name: "Phantom Step", desc: "Dash recharges faster",
      apply: (p) => { p.dashCdTime = Math.max(0.4, p.dashCdTime - 0.18); } },
    { id: "arc", icon: "🌙", name: "Wide Arc", desc: "+reach & wider swing",
      apply: (p) => { p.atkRange += 12; p.atkArc = Math.min(Math.PI * 1.2, p.atkArc + 0.2); } },
    { id: "siphon", icon: "🩸", name: "Soul Siphon", desc: "Heal +3 HP per kill",
      apply: (p) => { p.lifesteal += 3; } },
    { id: "ember", icon: "🔥", name: "Ember Slash", desc: "Each slash fires a bolt",
      apply: (p) => { p.emberLevel += 1; } },
  ];

  const BEST_KEY = "demonslayer.best";
  const game = {
    state: "menu", player: null,
    enemies: [], pickups: [], enemyShots: [], playerShots: [],
    score: 0, kills: 0, wave: 0,
    waveQueue: 0, spawnTimer: 0, betweenTimer: 0,
    shakeT: 0, shakeMag: 0, lastT: 0,
    best: 0, newBest: false,
    diff: DIFFICULTIES.normal, diffKey: "normal",
    upgrades: [], pendingOffer: null,

    loadBest() {
      try { this.best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; }
      catch (_) { this.best = 0; }
    },
    saveBest() {
      try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (_) {}
    },

    reset() {
      this.diff = DIFFICULTIES[this.diffKey] || DIFFICULTIES.normal;
      this.player = new Player();
      this.player.maxHp = this.diff.playerHp;
      this.player.hp = this.diff.playerHp;
      this.enemies = []; this.pickups = []; this.enemyShots = []; this.playerShots = [];
      particles.length = 0; floaters.length = 0;
      this.score = 0; this.kills = 0; this.wave = 0;
      this.waveQueue = 0; this.spawnTimer = 0; this.betweenTimer = 1.2;
      this.shakeT = 0; this.newBest = false;
      this.upgrades = []; this.pendingOffer = null;
      Background.init();
    },

    start() { Sound.init(); this.reset(); this.state = "playing"; hideScreens(); },

    setDifficulty(key) { if (DIFFICULTIES[key]) { this.diffKey = key; this.diff = DIFFICULTIES[key]; } },

    togglePause() {
      if (this.state === "playing") { this.state = "paused"; pauseScreen.classList.remove("hidden"); }
      else if (this.state === "paused") { this.state = "playing"; pauseScreen.classList.add("hidden"); }
    },

    // tapping a screen on touch devices acts like the screen button
    touchTap() {
      if (this.state === "menu" || this.state === "gameover") this.start();
    },

    over() {
      this.state = "gameover";
      if (this.score > this.best) { this.best = this.score; this.newBest = true; this.saveBest(); }
      newbestEl.classList.toggle("hidden", !this.newBest);
      finalStats.textContent =
        `Wave ${this.wave} · ${this.kills} demons slain · ${this.score} points` +
        (this.newBest ? "" : `  (best ${this.best})`);
      gameoverScreen.classList.remove("hidden");
    },

    shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = 0.25; },
    spawnPickup(x, y) { this.pickups.push({ x: clamp(x, 10, W - 10), y: clamp(y, H * 0.36, H - 10), r: 7, bob: rand(0, TAU), age: 0, life: 8 }); },
    spawnPlayerShot(angle, dmg) {
      this.playerShots.push({
        x: this.player.x + Math.cos(angle) * this.player.r,
        y: this.player.y + Math.sin(angle) * this.player.r,
        vx: Math.cos(angle) * 9, vy: Math.sin(angle) * 9,
        r: 5, dmg, life: 1.1, age: 0, pierce: 1, hit: new Set(),
      });
    },

    offerUpgrade() {
      // pick three distinct boons at random
      const pool = UPGRADES.slice();
      const choices = [];
      for (let i = 0; i < 3 && pool.length; i++) choices.splice(0, 0, pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      this.pendingOffer = choices;
      this.state = "upgrade";
      upgradeSub.textContent = `Wave ${this.wave} cleared — choose a boon`;
      buildUpgradeCards(choices);
      upgradeScreen.classList.remove("hidden");
    },

    chooseUpgrade(up) {
      if (this.state !== "upgrade") return;
      up.apply(this.player, this);
      this.upgrades.push(up.id);
      floatText(this.player.x, this.player.y - 24, up.name, "#ffd36a");
      burst(this.player.x, this.player.y, 16, { color: "#ffb347", spdMax: 4, life: 0.6, glow: true });
      this.pendingOffer = null;
      upgradeScreen.classList.add("hidden");
      this.state = "playing";
      this.startNextWave();
    },

    bossAlive() { return this.enemies.find((e) => e.isBoss) || null; },

    startNextWave() {
      this.wave++;
      Sound.wave();
      if (this.wave % 5 === 0) {
        // boss wave: the archfiend plus a few adds
        this.enemies.push(makeBoss(this.wave));
        Sound.boss();
        this.waveQueue = 3;
        this.spawnTimer = 1.5;
        floatText(W / 2, H * 0.45, "THE ARCHFIEND RISES", "#ff4a3c", true);
      } else {
        this.waveQueue = 4 + this.wave * 2;
        this.spawnTimer = 0;
        floatText(W / 2, H * 0.45, `WAVE ${this.wave}`, "#ff8a3a", true);
      }
    },

    spawnEnemy() {
      const edge = randInt(0, 3); const pad = 30; let x, y;
      if (edge === 0) { x = rand(0, W); y = H * 0.32 - pad; }
      else if (edge === 1) { x = W + pad; y = rand(H * 0.34, H); }
      else if (edge === 2) { x = rand(0, W); y = H + pad; }
      else { x = -pad; y = rand(H * 0.34, H); }

      let type = "skeleton";
      const roll = Math.random();
      if (this.wave >= 4 && roll < 0.18) type = "wraith";
      else if (this.wave >= 3 && roll < 0.30) type = "brute";
      else if (this.wave >= 2 && roll < 0.55) type = "imp";
      this.enemies.push(new Enemy(type, x, y));
    },

    update(dt) {
      Background.update(dt);
      if (this.state !== "playing") { updateParticles(dt); return; }

      this.player.update(dt);

      if (this.waveQueue > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnEnemy(); this.waveQueue--;
          this.spawnTimer = Math.max(0.3, (1.1 - this.wave * 0.05) * this.diff.spawnMul);
        }
      } else if (this.enemies.length === 0) {
        this.betweenTimer -= dt;
        if (this.betweenTimer <= 0) {
          this.betweenTimer = 1.0;
          // wave 0 = first wave begins with no boon; after that, offer an upgrade
          if (this.wave === 0) this.startNextWave();
          else this.offerUpgrade();
        }
      }

      for (const e of this.enemies) e.update(dt);
      this.enemies = this.enemies.filter((e) => !e.dead);
      updateEnemyShots(dt);
      updatePlayerShots(dt);

      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.age += dt; pk.bob += dt * 4;
        if (pk.age >= pk.life) { this.pickups.splice(i, 1); continue; }
        const rr = pk.r + this.player.r;
        if (dist2(pk.x, pk.y, this.player.x, this.player.y) < rr * rr) {
          this.player.hp = clamp(this.player.hp + 20, 0, this.player.maxHp);
          floatText(pk.x, pk.y, "+20", "#6dff8a");
          burst(pk.x, pk.y, 10, { color: "#6dff8a", life: 0.4, glow: true, spdMax: 3 });
          this.pickups.splice(i, 1);
        }
      }

      updateParticles(dt);
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    },

    draw() {
      ctx.save();
      if (this.shakeT > 0) {
        const m = this.shakeMag * (this.shakeT / 0.25);
        ctx.translate(rand(-m, m), rand(-m, m));
      }
      Background.draw();

      for (const pk of this.pickups) {
        const fade = pk.age > pk.life - 2 ? (Math.floor(pk.age * 6) % 2) : 1;
        if (!fade) continue;
        ctx.save(); ctx.translate(pk.x, pk.y + Math.sin(pk.bob) * 2);
        ctx.shadowColor = "#6dff8a"; ctx.shadowBlur = 12; ctx.fillStyle = "#6dff8a";
        ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
        ctx.restore();
      }
      ctx.shadowBlur = 0;

      drawEnemyShots();
      drawPlayerShots();

      const drawables = [...this.enemies];
      if (this.player) drawables.push(this.player);
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) d.draw();

      drawParticles();
      ctx.restore();

      this.drawHUD();
      if (touch.enabled && this.state === "playing") this.drawTouchControls();
    },

    drawHUD() {
      if (this.state === "menu") return;
      const p = this.player;
      const bx = 20, by = 18, bw = 240, bh = 18;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = "#3a0d12"; ctx.fillRect(bx, by, bw, bh);
      const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      hg.addColorStop(0, "#ff4a3c"); hg.addColorStop(1, "#ff8a3a");
      ctx.fillStyle = hg; ctx.fillRect(bx, by, bw * (p.hp / p.maxHp), bh);
      ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Trebuchet MS', sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, bx + 6, by + 13);

      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, by + bh + 6, 80, 6);
      ctx.fillStyle = p.dashCd > 0 ? "#5a6a8a" : "#7fd8ff";
      ctx.fillRect(bx, by + bh + 6, 80 * (1 - p.dashCd / p.dashCdTime), 6);
      // boon count
      if (this.upgrades.length) {
        ctx.fillStyle = "#ffb347"; ctx.font = "11px 'Trebuchet MS', sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`✦ ${this.upgrades.length} boons`, bx + 90, by + bh + 12);
      }

      ctx.textAlign = "right";
      ctx.fillStyle = "#ffd36a"; ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
      ctx.fillText(`${this.score}`, W - 20, 34);
      ctx.fillStyle = "#cdbfae"; ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
      ctx.fillText(`WAVE ${this.wave || 1}`, W - 20, 54);
      ctx.fillText(`${this.enemies.length} demons`, W - 20, 72);
      ctx.fillStyle = "#8a7f72"; ctx.font = "11px 'Trebuchet MS', sans-serif";
      ctx.fillText(`BEST ${this.best} · ${this.diff.name}`, W - 20, 90);

      if (p.combo >= 2) {
        ctx.textAlign = "center"; ctx.fillStyle = "#ff8a3a";
        ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
        ctx.fillText(`${p.combo}x COMBO`, W / 2, 36);
      }

      // boss health bar
      const boss = this.bossAlive();
      if (boss) {
        const w = W * 0.5, x = (W - w) / 2, y = H - 30;
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x - 2, y - 2, w + 4, 16);
        ctx.fillStyle = "#2a0608"; ctx.fillRect(x, y, w, 12);
        const bg = ctx.createLinearGradient(x, 0, x + w, 0);
        bg.addColorStop(0, "#ff2a1a"); bg.addColorStop(1, "#ff9a3a");
        ctx.fillStyle = bg; ctx.fillRect(x, y, w * (boss.hp / boss.maxHp), 12);
        ctx.textAlign = "center"; ctx.fillStyle = "#ffd36a";
        ctx.font = "bold 12px 'Trebuchet MS', sans-serif";
        ctx.fillText("THE ARCHFIEND", W / 2, y - 6);
      }
    },

    drawTouchControls() {
      // joystick
      if (touch.joyId !== null) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = "#cdbfae"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(touch.joyOX, touch.joyOY, 60, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.55; ctx.fillStyle = "#ffb347";
        ctx.beginPath(); ctx.arc(touch.joyOX + touch.joyVX * 60, touch.joyOY + touch.joyVY * 60, 22, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // dash button
      ctx.globalAlpha = game.player && game.player.dashCd > 0 ? 0.25 : 0.5;
      ctx.fillStyle = "#7fd8ff";
      ctx.beginPath(); ctx.arc(DASH_BTN.x, DASH_BTN.y, DASH_BTN.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#0a1622"; ctx.textAlign = "center";
      ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
      ctx.fillText("DASH", DASH_BTN.x, DASH_BTN.y + 4);
    },
  };

  // --- 9. Wiring -----------------------------------------------------------
  const overlay = document.getElementById("overlay");
  const gameoverScreen = document.getElementById("gameover");
  const pauseScreen = document.getElementById("pause");
  const upgradeScreen = document.getElementById("upgrade");
  const upgradeSub = document.getElementById("upgrade-sub");
  const upgradeCards = document.getElementById("upgrade-cards");
  const finalStats = document.getElementById("final-stats");
  const startBtn = document.getElementById("start-btn");
  const retryBtn = document.getElementById("retry-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const quitBtn = document.getElementById("quit-btn");
  const diffBox = document.getElementById("difficulty");
  const bestLine = document.getElementById("best-line");
  const bestVal = document.getElementById("best-val");
  const newbestEl = document.getElementById("newbest");

  function hideScreens() {
    overlay.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
    pauseScreen.classList.add("hidden");
    upgradeScreen.classList.add("hidden");
  }
  startBtn.addEventListener("click", () => game.start());
  retryBtn.addEventListener("click", () => game.start());
  resumeBtn.addEventListener("click", () => game.togglePause());
  quitBtn.addEventListener("click", () => {
    pauseScreen.classList.add("hidden");
    game.state = "menu";
    overlay.classList.remove("hidden");
  });

  // difficulty selector
  diffBox.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff-btn");
    if (!btn) return;
    game.setDifficulty(btn.dataset.diff);
    for (const b of diffBox.querySelectorAll(".diff-btn")) b.classList.toggle("selected", b === btn);
  });

  // pause toggle
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ((k === "escape" || k === "p") && (game.state === "playing" || game.state === "paused"))
      game.togglePause();
  });

  // build the three upgrade cards
  function buildUpgradeCards(choices) {
    upgradeCards.innerHTML = "";
    for (const up of choices) {
      const card = document.createElement("button");
      card.className = "card";
      const taken = game.upgrades.filter((id) => id === up.id).length;
      card.innerHTML =
        `<span class="icon">${up.icon}</span>` +
        `<span class="name">${up.name}</span>` +
        `<span class="desc">${up.desc}</span>` +
        (taken ? `<span class="stacks">OWNED ×${taken}</span>` : "");
      card.addEventListener("click", () => game.chooseUpgrade(up));
      upgradeCards.appendChild(card);
    }
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - game.lastT) / 1000 || 0);
    game.lastT = t;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }

  game.loadBest();
  if (game.best > 0) { bestVal.textContent = game.best; bestLine.classList.remove("hidden"); }
  Background.init();
  requestAnimationFrame(frame);

  // Optional debug hook for automated testing only — inert during normal play.
  // Enable by loading the page with the URL fragment "#debug".
  if (location.hash === "#debug") window.__ds = { game, makeBoss, Enemy };
})();
