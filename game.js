/* ============================================================================
 * DEMON SLAYER — HELLSCAPE
 * A self-contained 2D arena survival slasher. All art is drawn procedurally
 * on the canvas (no external image assets), so the whole game ships in three
 * plain files with nothing to license or download.
 *
 * Layout of this file:
 *   1. Constants & utilities
 *   2. Input handling
 *   3. Audio (tiny WebAudio blip synth)
 *   4. Particles & floating text
 *   5. Background (parallax hellscape)
 *   6. Player (the slayer)
 *   7. Enemies (skeleton / imp / brute)
 *   8. Game loop & wave director
 *   9. HUD + screen wiring
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
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
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

  function canvasPos(evt) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - r.left) / r.width) * W,
      y: ((evt.clientY - r.top) / r.height) * H,
    };
  }
  canvas.addEventListener("mousemove", (e) => {
    const p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y;
  });
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.button === 0) { mouse.down = true; game.player && game.player.tryAttack(); }
    if (e.button === 2) { game.player && game.player.tryDash(); }
  });
  addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- 3. Audio ------------------------------------------------------------
  // Tiny synth so there are no audio files to ship. Lazily created on first
  // user gesture to satisfy autoplay policies.
  const Sound = {
    ctx: null,
    on: true,
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
      osc.start(t);
      osc.stop(t + dur);
    },
    slash() { this.blip(720, 0.12, "sawtooth", 0.10, 240); },
    hit()   { this.blip(180, 0.10, "square", 0.12, 90); },
    dash()  { this.blip(440, 0.16, "sine", 0.10, 880); },
    hurt()  { this.blip(140, 0.22, "sawtooth", 0.16, 60); },
    death() { this.blip(90, 0.35, "triangle", 0.16, 40); },
    wave()  { this.blip(330, 0.18, "sine", 0.12, 660); },
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
      spawnParticle(x, y, {
        ...opt,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
      });
    }
  }
  function floatText(x, y, text, color = "#ffd36a") {
    floaters.push({ x, y, text, color, age: 0, life: 0.9 });
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
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = "bold 16px 'Trebuchet MS', sans-serif";
    for (const f of floaters) {
      const t = 1 - f.age / f.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = f.color;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // --- 5. Background -------------------------------------------------------
  // Procedural hellscape: gradient sky, parallax ridgelines, a smoking
  // volcano, a winding lava river, glowing ground cracks, drifting embers.
  const Background = {
    embers: [],
    lavaPhase: 0,
    ridges: [],
    init() {
      this.embers = [];
      for (let i = 0; i < 60; i++) {
        this.embers.push({
          x: rand(0, W), y: rand(0, H),
          vy: rand(-0.4, -1.2), vx: rand(-0.3, 0.3),
          size: rand(0.6, 2.2), flick: rand(0, TAU),
        });
      }
      // Pre-generate jagged ridgelines for two parallax layers.
      this.ridges = [this._ridge(0.62, 90, "#241b30"), this._ridge(0.70, 130, "#1b1422")];
    },
    _ridge(baseY, amp, color) {
      const pts = [];
      let x = -40;
      let y = H * baseY;
      while (x < W + 40) {
        pts.push({ x, y });
        x += rand(40, 90);
        y = H * baseY + rand(-amp, amp * 0.4);
      }
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
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#221031");
      sky.addColorStop(0.45, "#3a1430");
      sky.addColorStop(0.75, "#551a22");
      sky.addColorStop(1, "#1a0d12");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Distant volcano glow
      const vg = ctx.createRadialGradient(W * 0.74, H * 0.42, 10, W * 0.74, H * 0.42, 260);
      vg.addColorStop(0, "rgba(255,90,20,0.35)");
      vg.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Parallax ridges
      for (const r of this.ridges) {
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.moveTo(-40, H);
        for (const p of r.pts) ctx.lineTo(p.x, p.y);
        ctx.lineTo(W + 40, H);
        ctx.closePath();
        ctx.fill();
      }

      // Volcano cone
      ctx.fillStyle = "#140d16";
      ctx.beginPath();
      ctx.moveTo(W * 0.62, H * 0.62);
      ctx.lineTo(W * 0.74, H * 0.28);
      ctx.lineTo(W * 0.86, H * 0.62);
      ctx.closePath();
      ctx.fill();
      // crater glow
      ctx.fillStyle = "rgba(255,120,30,0.9)";
      ctx.beginPath();
      ctx.ellipse(W * 0.74, H * 0.29, 12, 5, 0, 0, TAU);
      ctx.fill();

      // Foreground ground
      const grd = ctx.createLinearGradient(0, H * 0.66, 0, H);
      grd.addColorStop(0, "#241621");
      grd.addColorStop(1, "#0e0810");
      ctx.fillStyle = grd;
      ctx.fillRect(0, H * 0.66, W, H * 0.34);

      // Glowing ground cracks
      ctx.strokeStyle = "rgba(255,90,20,0.5)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#ff5a14";
      ctx.shadowBlur = 8;
      const pulse = 0.5 + 0.5 * Math.sin(this.lavaPhase * 2);
      ctx.globalAlpha = 0.4 + 0.35 * pulse;
      for (let i = 0; i < 5; i++) {
        const y = H * (0.72 + i * 0.05);
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= W; x += 60) {
          ctx.lineTo(x, y + Math.sin((x + i * 50) * 0.02 + this.lavaPhase) * 6);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Embers
      for (const e of this.embers) {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(e.flick));
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ffb347";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };

  // --- 6. Player -----------------------------------------------------------
  class Player {
    constructor() {
      this.x = W / 2;
      this.y = H * 0.78;
      this.r = 14;
      this.speed = 3.0;
      this.maxHp = 100;
      this.hp = this.maxHp;
      this.facing = 0;
      this.invuln = 0;
      // attack
      this.atkCd = 0;
      this.atkTimer = 0;     // >0 while swing animation plays
      this.atkDur = 0.18;
      this.atkRange = 64;
      this.atkArc = Math.PI * 0.85;
      this.atkDmg = 34;
      this.swingFrom = 0;
      this.swingDir = 1;
      this.hitSet = null;
      // dash
      this.dashCd = 0;
      this.dashTimer = 0;
      this.dashVX = 0;
      this.dashVY = 0;
      // combo
      this.combo = 0;
      this.comboTimer = 0;
    }

    tryAttack() {
      if (game.state !== "playing" || this.atkCd > 0) return;
      this.atkCd = 0.28;
      this.atkTimer = this.atkDur;
      this.hitSet = new Set();
      // alternate swing direction for a nice back-and-forth feel
      this.swingDir *= -1;
      this.swingFrom = this.facing - this.swingDir * this.atkArc / 2;
      Sound.slash();
      // slash spark particles
      const tx = this.x + Math.cos(this.facing) * this.atkRange * 0.6;
      const ty = this.y + Math.sin(this.facing) * this.atkRange * 0.6;
      burst(tx, ty, 6, { color: "#bfe9ff", spdMin: 1, spdMax: 3, life: 0.3, glow: true, size: 2 });
    }

    tryDash() {
      if (game.state !== "playing" || this.dashCd > 0) return;
      this.dashCd = 0.9;
      this.dashTimer = 0.16;
      const a = this.facing;
      this.dashVX = Math.cos(a) * 11;
      this.dashVY = Math.sin(a) * 11;
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
      this.hp -= dmg;
      this.invuln = 0.7;
      this.combo = 0;
      Sound.hurt();
      game.shake(8);
      burst(this.x, this.y, 12, { color: "#c0162a", spdMin: 1, spdMax: 4, life: 0.5 });
      if (this.hp <= 0) { this.hp = 0; game.over(); }
    }

    addCombo() {
      this.combo++;
      this.comboTimer = 2.2;
    }

    update(dt) {
      this.atkCd = Math.max(0, this.atkCd - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      if (this.atkTimer > 0) this.atkTimer -= dt;
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

      // face the mouse
      this.facing = Math.atan2(mouse.y - this.y, mouse.x - this.x);

      // movement
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.x += this.dashVX;
        this.y += this.dashVY;
        if (Math.random() < 0.8)
          spawnParticle(this.x, this.y, { color: "#7fd8ff", life: 0.3, size: 3, glow: true, vx: 0, vy: 0 });
      } else {
        let dx = 0, dy = 0;
        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;
        if (dx || dy) {
          const m = Math.hypot(dx, dy);
          this.x += (dx / m) * this.speed;
          this.y += (dy / m) * this.speed;
        }
        if ((keys[" "]) && this.atkCd === 0) this.tryAttack();
        if ((keys["shift"]) && this.dashCd === 0) this.tryDash();
      }

      // keep inside the arena (play area is the lower portion of the screen)
      this.x = clamp(this.x, this.r, W - this.r);
      this.y = clamp(this.y, H * 0.34, H - this.r);

      // resolve the active swing against enemies
      if (this.atkTimer > 0) this._resolveSwing();
    }

    _resolveSwing() {
      for (const e of game.enemies) {
        if (e.dead || this.hitSet.has(e)) continue;
        const d2 = dist2(this.x, this.y, e.x, e.y);
        const reach = this.atkRange + e.r;
        if (d2 > reach * reach) continue;
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

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, this.r * 0.9, this.r, this.r * 0.4, 0, 0, TAU);
      ctx.fill();

      ctx.rotate(this.facing);

      if (!blink) {
        // cloak / body
        ctx.fillStyle = "#2b2f3a";
        ctx.beginPath();
        ctx.ellipse(-2, 0, this.r, this.r * 0.8, 0, 0, TAU);
        ctx.fill();
        // crimson sash
        ctx.fillStyle = "#9c1a26";
        ctx.fillRect(-this.r * 0.5, -3, this.r * 0.9, 6);
        // head
        ctx.fillStyle = "#d9c9a8";
        ctx.beginPath();
        ctx.arc(this.r * 0.4, 0, this.r * 0.5, 0, TAU);
        ctx.fill();
      }

      // katana — swings through its arc during an attack
      let bladeAng;
      if (this.atkTimer > 0) {
        const t = 1 - this.atkTimer / this.atkDur;
        bladeAng = this.swingDir * (-this.atkArc / 2 + this.atkArc * t);
      } else {
        bladeAng = this.swingDir * -0.35;
      }
      ctx.rotate(bladeAng);
      ctx.strokeStyle = "#e8f6ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#9be7ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(this.r * 0.3, 0);
      ctx.lineTo(this.r * 0.3 + this.atkRange, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // guard
      ctx.fillStyle = "#caa14a";
      ctx.fillRect(this.r * 0.2, -3, 5, 6);

      ctx.restore();

      // swing arc flash
      if (this.atkTimer > 0) {
        const t = 1 - this.atkTimer / this.atkDur;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.strokeStyle = "#cdefff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, this.atkRange * 0.9, this.swingFrom, this.swingFrom + this.swingDir * this.atkArc * t);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  // --- 7. Enemies ----------------------------------------------------------
  const ENEMY_TYPES = {
    skeleton: {
      name: "skeleton", r: 13, hp: 40, speed: 1.15, dmg: 8, score: 10,
      color: "#d7d2c2", accent: "#8a8472",
    },
    imp: {
      name: "imp", r: 11, hp: 26, speed: 2.0, dmg: 6, score: 14,
      color: "#7a1f2a", accent: "#ffcf3a", weave: true,
    },
    brute: {
      name: "brute", r: 22, hp: 130, speed: 0.7, dmg: 18, score: 30,
      color: "#5a1410", accent: "#ff5a1e", heavy: true,
    },
  };

  class Enemy {
    constructor(type, x, y) {
      const t = ENEMY_TYPES[type];
      this.type = type;
      this.def = t;
      this.x = x; this.y = y;
      this.r = t.r;
      this.maxHp = t.hp;
      this.hp = t.hp;
      this.speed = t.speed;
      this.dmg = t.dmg;
      this.dead = false;
      this.hitFlash = 0;
      this.kbx = 0; this.kby = 0;
      this.atkCd = 0;
      this.phase = rand(0, TAU);
      this.bob = rand(0, TAU);
    }

    hurt(dmg, fromAngle) {
      this.hp -= dmg;
      this.hitFlash = 0.12;
      const kb = this.def.heavy ? 4 : 9;
      this.kbx += Math.cos(fromAngle) * kb;
      this.kby += Math.sin(fromAngle) * kb;
      Sound.hit();
      game.shake(this.def.heavy ? 5 : 3);
      const col = this.type === "skeleton" ? "#e9e4d4" : "#c0162a";
      burst(this.x, this.y, 8, { color: col, spdMin: 1, spdMax: 4, life: 0.4 });
      floatText(this.x, this.y - this.r, String(dmg), "#ffd36a");
      if (this.hp <= 0 && !this.dead) this.die();
    }

    die() {
      this.dead = true;
      game.score += this.def.score;
      game.kills++;
      Sound.death();
      const col = this.type === "skeleton" ? "#e9e4d4" : this.def.color;
      burst(this.x, this.y, 22, { color: col, spdMin: 1, spdMax: 6, life: 0.7, grav: 0.05 });
      burst(this.x, this.y, 10, { color: "#ff6a1a", spdMin: 1, spdMax: 4, life: 0.5, glow: true });
      // small chance to drop a health mote
      if (Math.random() < 0.12) game.spawnPickup(this.x, this.y);
    }

    update(dt) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.atkCd = Math.max(0, this.atkCd - dt);
      this.bob += dt * 6;

      const p = game.player;
      let ang = Math.atan2(p.y - this.y, p.x - this.x);
      // imps weave around their approach vector
      if (this.def.weave) ang += Math.sin(this.bob * 0.5 + this.phase) * 0.6;

      this.x += Math.cos(ang) * this.speed + this.kbx;
      this.y += Math.sin(ang) * this.speed + this.kby;
      this.kbx *= 0.8; this.kby *= 0.8;

      // separation so they don't fully stack
      for (const o of game.enemies) {
        if (o === this || o.dead) continue;
        const dx = this.x - o.x, dy = this.y - o.y;
        const d2 = dx * dx + dy * dy;
        const minD = this.r + o.r;
        if (d2 > 0.001 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / d * 0.5;
          this.x += dx * push; this.y += dy * push;
        }
      }

      this.x = clamp(this.x, this.r, W - this.r);
      this.y = clamp(this.y, H * 0.32, H - this.r);

      // touch damage to player
      if (this.atkCd === 0) {
        const rr = this.r + p.r;
        if (dist2(this.x, this.y, p.x, p.y) < rr * rr) {
          p.hurt(this.dmg);
          this.atkCd = 0.6;
          this.kbx += Math.cos(ang) * -3;
          this.kby += Math.sin(ang) * -3;
        }
      }
    }

    draw() {
      const bobY = Math.sin(this.bob) * (this.def.weave ? 3 : 1.2);
      ctx.save();
      ctx.translate(this.x, this.y + bobY);

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(0, this.r * 0.85 - bobY, this.r * 0.9, this.r * 0.35, 0, 0, TAU);
      ctx.fill();

      const flash = this.hitFlash > 0;
      if (this.type === "skeleton") this._drawSkeleton(flash);
      else if (this.type === "imp") this._drawImp(flash);
      else this._drawBrute(flash);

      // health pip for damaged enemies
      if (this.hp < this.maxHp) {
        const w = this.r * 2;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(-w / 2, -this.r - 10, w, 4);
        ctx.fillStyle = "#ff5a3c";
        ctx.fillRect(-w / 2, -this.r - 10, w * (this.hp / this.maxHp), 4);
      }
      ctx.restore();
    }

    _drawSkeleton(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      // ribcage body
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 2, this.r * 0.7, this.r * 0.9, 0, 0, TAU);
      ctx.fill();
      // rib lines
      ctx.strokeStyle = flash ? "#cccccc" : this.def.accent;
      ctx.lineWidth = 1.5;
      for (let i = -1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-this.r * 0.5, i * 4 + 2);
        ctx.lineTo(this.r * 0.5, i * 4 + 2);
        ctx.stroke();
      }
      // skull
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -this.r * 0.7, this.r * 0.55, 0, TAU);
      ctx.fill();
      // eye sockets glowing
      ctx.fillStyle = "#ff4a2a";
      ctx.shadowColor = "#ff4a2a"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(-this.r * 0.2, -this.r * 0.72, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(this.r * 0.2, -this.r * 0.72, 2, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }

    _drawImp(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      // wings
      ctx.fillStyle = flash ? "#ddaaaa" : "#3a0f16";
      const wf = Math.sin(this.bob * 2) * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-this.r * 1.6, -this.r * (1 + wf), -this.r * 1.8, this.r * 0.2);
      ctx.quadraticCurveTo(-this.r, this.r * 0.2, 0, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(this.r * 1.6, -this.r * (1 + wf), this.r * 1.8, this.r * 0.2);
      ctx.quadraticCurveTo(this.r, this.r * 0.2, 0, 0);
      ctx.fill();
      // body
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.7, 0, TAU);
      ctx.fill();
      // horns
      ctx.strokeStyle = body; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-3, -this.r * 0.5); ctx.lineTo(-6, -this.r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, -this.r * 0.5); ctx.lineTo(6, -this.r); ctx.stroke();
      // glowing eyes
      ctx.fillStyle = this.def.accent;
      ctx.shadowColor = this.def.accent; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(-3, -2, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -2, 2, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }

    _drawBrute(flash) {
      const body = flash ? "#ffffff" : this.def.color;
      // hulking body
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * 0.95, this.r, 0, 0, TAU);
      ctx.fill();
      // molten cracks
      ctx.strokeStyle = this.def.accent;
      ctx.lineWidth = 2;
      ctx.shadowColor = this.def.accent; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-this.r * 0.4, -this.r * 0.4);
      ctx.lineTo(0, 0); ctx.lineTo(-this.r * 0.2, this.r * 0.5);
      ctx.moveTo(this.r * 0.4, -this.r * 0.3);
      ctx.lineTo(this.r * 0.1, this.r * 0.4);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // big curved horns
      ctx.strokeStyle = flash ? "#eee" : "#1d0a09";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-this.r * 0.5, -this.r * 0.7);
      ctx.quadraticCurveTo(-this.r * 1.1, -this.r * 1.1, -this.r * 0.7, -this.r * 1.4);
      ctx.moveTo(this.r * 0.5, -this.r * 0.7);
      ctx.quadraticCurveTo(this.r * 1.1, -this.r * 1.1, this.r * 0.7, -this.r * 1.4);
      ctx.stroke();
      // eyes
      ctx.fillStyle = "#ffd23a";
      ctx.shadowColor = "#ffae2a"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(-this.r * 0.3, -this.r * 0.2, 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(this.r * 0.3, -this.r * 0.2, 3, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // --- 8. Game loop & wave director ----------------------------------------
  const game = {
    state: "menu",       // menu | playing | gameover
    player: null,
    enemies: [],
    pickups: [],
    score: 0,
    kills: 0,
    wave: 0,
    waveQueue: 0,        // enemies left to spawn this wave
    spawnTimer: 0,
    betweenTimer: 0,
    shakeT: 0,
    shakeMag: 0,
    lastT: 0,

    reset() {
      this.player = new Player();
      this.enemies = [];
      this.pickups = [];
      particles.length = 0;
      floaters.length = 0;
      this.score = 0;
      this.kills = 0;
      this.wave = 0;
      this.waveQueue = 0;
      this.spawnTimer = 0;
      this.betweenTimer = 1.2;
      this.shakeT = 0;
      Background.init();
    },

    start() {
      Sound.init();
      this.reset();
      this.state = "playing";
      hideScreens();
    },

    over() {
      this.state = "gameover";
      finalStats.textContent =
        `Wave ${this.wave} · ${this.kills} demons slain · ${this.score} points`;
      gameoverScreen.classList.remove("hidden");
    },

    shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = 0.25; },

    spawnPickup(x, y) {
      this.pickups.push({ x, y, r: 7, bob: rand(0, TAU), age: 0, life: 8 });
    },

    startNextWave() {
      this.wave++;
      // scaling: more enemies, gradually tougher mix
      this.waveQueue = 4 + this.wave * 2;
      this.spawnTimer = 0;
      Sound.wave();
      floatText(W / 2, H * 0.45, `WAVE ${this.wave}`, "#ff8a3a");
    },

    spawnEnemy() {
      // pick an edge of the arena
      const edge = randInt(0, 3);
      let x, y;
      const pad = 30;
      if (edge === 0) { x = rand(0, W); y = H * 0.32 - pad; }
      else if (edge === 1) { x = W + pad; y = rand(H * 0.34, H); }
      else if (edge === 2) { x = rand(0, W); y = H + pad; }
      else { x = -pad; y = rand(H * 0.34, H); }

      // weighted type selection by wave
      let type = "skeleton";
      const roll = Math.random();
      if (this.wave >= 3 && roll < 0.12 + this.wave * 0.015) type = "brute";
      else if (this.wave >= 2 && roll < 0.45) type = "imp";
      else if (roll < 0.3 && this.wave >= 2) type = "imp";

      this.enemies.push(new Enemy(type, x, y));
    },

    update(dt) {
      Background.update(dt);
      if (this.state !== "playing") { updateParticles(dt); return; }

      this.player.update(dt);

      // wave flow
      if (this.waveQueue > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnEnemy();
          this.waveQueue--;
          this.spawnTimer = Math.max(0.35, 1.1 - this.wave * 0.05);
        }
      } else if (this.enemies.length === 0) {
        // wave cleared — short breather
        this.betweenTimer -= dt;
        if (this.betweenTimer <= 0) {
          this.betweenTimer = 2.2;
          this.startNextWave();
        }
      }

      for (const e of this.enemies) e.update(dt);
      this.enemies = this.enemies.filter((e) => !e.dead);

      // pickups
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

      if (this.shakeT > 0) {
        this.shakeT -= dt;
        if (this.shakeT <= 0) this.shakeMag = 0;
      }
    },

    draw() {
      ctx.save();
      if (this.shakeT > 0) {
        const m = this.shakeMag * (this.shakeT / 0.25);
        ctx.translate(rand(-m, m), rand(-m, m));
      }

      Background.draw();

      // pickups (health motes)
      for (const pk of this.pickups) {
        const fade = pk.age > pk.life - 2 ? (Math.floor(pk.age * 6) % 2) : 1;
        if (!fade) continue;
        ctx.save();
        ctx.translate(pk.x, pk.y + Math.sin(pk.bob) * 2);
        ctx.shadowColor = "#6dff8a"; ctx.shadowBlur = 12;
        ctx.fillStyle = "#6dff8a";
        ctx.beginPath();
        // little cross / heart mote
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fill();
        ctx.restore();
      }
      ctx.shadowBlur = 0;

      // entities (sorted by y for simple depth)
      const drawables = [...this.enemies];
      if (this.player) drawables.push(this.player);
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) d.draw();

      drawParticles();
      ctx.restore();

      this.drawHUD();
    },

    drawHUD() {
      if (this.state === "menu") return;
      const p = this.player;

      // health bar
      const bx = 20, by = 18, bw = 240, bh = 18;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = "#3a0d12";
      ctx.fillRect(bx, by, bw, bh);
      const hpw = bw * (p.hp / p.maxHp);
      const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      hg.addColorStop(0, "#ff4a3c");
      hg.addColorStop(1, "#ff8a3a");
      ctx.fillStyle = hg;
      ctx.fillRect(bx, by, hpw, bh);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, bx + 6, by + 13);

      // dash cooldown pip
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by + bh + 6, 80, 6);
      ctx.fillStyle = p.dashCd > 0 ? "#5a6a8a" : "#7fd8ff";
      ctx.fillRect(bx, by + bh + 6, 80 * (1 - p.dashCd / 0.9), 6);

      // score / wave
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffd36a";
      ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
      ctx.fillText(`${this.score}`, W - 20, 34);
      ctx.fillStyle = "#cdbfae";
      ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
      ctx.fillText(`WAVE ${this.wave || 1}`, W - 20, 54);
      ctx.fillText(`${this.enemies.length} demons`, W - 20, 72);

      // combo
      if (p.combo >= 2) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff8a3a";
        ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
        ctx.fillText(`${p.combo}x COMBO`, W / 2, 36);
      }
    },
  };

  // --- 9. Wiring -----------------------------------------------------------
  const overlay = document.getElementById("overlay");
  const gameoverScreen = document.getElementById("gameover");
  const finalStats = document.getElementById("final-stats");
  const startBtn = document.getElementById("start-btn");
  const retryBtn = document.getElementById("retry-btn");

  function hideScreens() {
    overlay.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
  }
  startBtn.addEventListener("click", () => game.start());
  retryBtn.addEventListener("click", () => game.start());

  // main loop
  function frame(t) {
    const dt = Math.min(0.05, (t - game.lastT) / 1000 || 0);
    game.lastT = t;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }

  // show a gentle animated background behind the title before the game starts
  Background.init();
  requestAnimationFrame(frame);
})();
