// ===== ĐÁNH BOSS: né đạn thời gian thực (canvas) =====
import { ELEMENTS, SECTS, elementBonus, sutuCooldown, kimcangDuration, kimcangCooldown } from "./data.js";
import { calcStats, nguyetDaoDamage, reduceByDef, rand, clamp, fmt } from "./logic.js";

const W = 1280, H = 720;
const AR = { x1: 30, y1: 84, x2: 1250, y2: 640 }; // vùng đấu
const TAU = Math.PI * 2;

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

export class Battle {
  constructor(canvas, player, map, boss, onEnd) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    this.p = player; this.map = map; this.onEnd = onEnd;
    this.st = calcStats(player);
    const sect = SECTS[player.sect];
    this.robe = sect.robe; this.robeDark = sect.robeDark;
    this.el = this.st.element;

    this.pl = {
      x: 220, y: (AR.y1 + AR.y2) / 2, r: 16, hit: 7,
      hp: this.st.hp, maxHp: this.st.hp, mp: this.st.mp, maxMp: this.st.mp,
      speed: 270 * (1 + this.st.speed / 100), aim: 0,
      fireCd: 0, dashT: 0, dashVx: 0, dashVy: 0, inv: 0, shield: 0,
      cd: { sutu: 0, kimcang: 0, dash: 0 }
    };
    this.boss = {
      ...boss, maxHp: boss.hp, x: 1050, y: (AR.y1 + AR.y2) / 2, r: 38,
      tx: 1050, ty: 360, moveT: 0, atkT: 1.5, pattern: 0, sub: [], flash: 0,
      charge: 0, cvx: 0, cvy: 0
    };
    this.pb = []; this.eb = []; this.fx = []; this.texts = [];
    this.keys = {}; this.mouse = { x: W / 2, y: H / 2, l: false };
    this.time = 0; this.paused = false; this.over = null; this.overT = 0;
    this.bossBonus = elementBonus(this.el, boss.element);
    this.playerTakenBonus = elementBonus(boss.element, this.el);
    this._bind();
  }

  // ---------- Input ----------
  _bind() {
    const toLocal = e => {
      const r = this.cv.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) / r.width * W;
      this.mouse.y = (e.clientY - r.top) / r.height * H;
    };
    this.h = {
      kd: e => {
        const k = e.key.toLowerCase();
        if (["w", "a", "s", "d", " ", "q", "escape", "f"].includes(k)) e.preventDefault();
        if (k === "escape" && !this.over) { this.paused = !this.paused; return; }
        if (this.paused) { if (k === "f") this._finish("flee"); return; }
        if (!this.keys[k]) {
          if (k === " ") this._dash();
          if (k === "q") this._kimcang();
        }
        this.keys[k] = true;
      },
      ku: e => { this.keys[e.key.toLowerCase()] = false; },
      mm: e => toLocal(e),
      md: e => {
        toLocal(e); e.preventDefault();
        if (this.paused || this.over) return;
        if (e.button === 0) this.mouse.l = true;
        if (e.button === 2) this._sutu();
      },
      mu: e => { if (e.button === 0) this.mouse.l = false; },
      cm: e => e.preventDefault(),
      blur: () => { this.keys = {}; this.mouse.l = false; }
    };
    window.addEventListener("keydown", this.h.kd);
    window.addEventListener("keyup", this.h.ku);
    window.addEventListener("mousemove", this.h.mm);
    this.cv.addEventListener("mousedown", this.h.md);
    window.addEventListener("mouseup", this.h.mu);
    this.cv.addEventListener("contextmenu", this.h.cm);
    window.addEventListener("blur", this.h.blur);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.h.kd);
    window.removeEventListener("keyup", this.h.ku);
    window.removeEventListener("mousemove", this.h.mm);
    this.cv.removeEventListener("mousedown", this.h.md);
    window.removeEventListener("mouseup", this.h.mu);
    this.cv.removeEventListener("contextmenu", this.h.cm);
    window.removeEventListener("blur", this.h.blur);
  }

  start() {
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (this.dead) return;
      if (!this.paused) this.update(dt);
      if (this.dead) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- Kỹ năng ----------
  _dash() {
    const pl = this.pl;
    if (pl.cd.dash > 0 || this.over) return;
    let dx = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
    let dy = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);
    if (!dx && !dy) { dx = Math.cos(pl.aim); dy = Math.sin(pl.aim); }
    const l = Math.hypot(dx, dy);
    pl.dashVx = dx / l * 950; pl.dashVy = dy / l * 950;
    pl.dashT = 0.16; pl.inv = Math.max(pl.inv, 0.28); pl.cd.dash = 1.2;
  }

  _sutu() {
    const lv = this.p.skills.sutuhong, pl = this.pl;
    if (lv < 1 || pl.cd.sutu > 0 || pl.mp < 30 || this.over) return;
    pl.mp -= 30; pl.cd.sutu = sutuCooldown(lv);
    const ang = pl.aim, len = 250, half = 32 * Math.PI / 180;
    this.fx.push({ type: "cone", x: pl.x, y: pl.y, ang, len, half, t: 0, life: 0.4 });
    // xóa đạn trong vùng
    this.eb = this.eb.filter(b => {
      const dx = b.x - pl.x, dy = b.y - pl.y, d = Math.hypot(dx, dy);
      const inside = d < len && Math.abs(angDiff(Math.atan2(dy, dx), ang)) < half;
      if (inside) this._spark(b.x, b.y, ELEMENTS.kim.color, 2);
      return !inside;
    });
    // sát thương boss
    const B = this.boss, dx = B.x - pl.x, dy = B.y - pl.y, d = Math.hypot(dx, dy);
    if (d < len + B.r && Math.abs(angDiff(Math.atan2(dy, dx), ang)) < half + Math.atan2(B.r, d)) {
      let dmg = this.st.atk * this.st.dmgMul * (2 + 0.3 * lv) * this.bossBonus;
      const crit = Math.random() * 100 < this.st.crit;
      if (crit) dmg *= 1.5;
      this._hitBoss(dmg, crit);
    }
  }

  _kimcang() {
    const lv = this.p.skills.kimcang, pl = this.pl;
    if (lv < 1 || pl.cd.kimcang > 0 || pl.mp < 40 || this.over) return;
    pl.mp -= 40; pl.cd.kimcang = kimcangCooldown(lv); pl.shield = kimcangDuration(lv);
  }

  _fire() {
    const pl = this.pl, lvl = this.p.skills.nguyetdao;
    const spread = this.st.spreadDeg * Math.PI / 180;
    const a = pl.aim + rand(-spread, spread);
    const r = 14 + 3 * lvl, sp = 620;
    let dmg = nguyetDaoDamage(this.p, this.st) * this.bossBonus;
    const crit = Math.random() * 100 < this.st.crit;
    if (crit) dmg *= 1.5;
    this.pb.push({ x: pl.x + Math.cos(a) * 20, y: pl.y + Math.sin(a) * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r, r0: r, dmg, crit, life: 1.5, age: 0 });
  }

  _hitBoss(dmg, crit) {
    const B = this.boss;
    dmg = Math.max(1, Math.round(reduceByDef(dmg, B.def) * rand(0.92, 1.08)));
    B.hp -= dmg; B.flash = 0.08;
    this.texts.push({ x: B.x + rand(-25, 25), y: B.y - B.r - 10, t: 0, text: (crit ? "Chí mạng " : "") + fmt(dmg),
      color: crit ? "#ffe070" : "#ffffff", size: crit ? 26 : 20 });
    if (B.hp <= 0 && !this.over) { B.hp = 0; this._finish("win"); }
  }

  _hitPlayer(raw) {
    const pl = this.pl;
    if (pl.inv > 0 || this.over) return;
    const dmg = Math.max(1, Math.round(reduceByDef(raw * this.playerTakenBonus, this.st.def) * rand(0.9, 1.1)));
    pl.hp -= dmg; pl.inv = 0.35;
    this.texts.push({ x: pl.x, y: pl.y - 30, t: 0, text: "-" + fmt(dmg), color: "#ff6a5a", size: 20 });
    if (pl.hp <= 0) { pl.hp = 0; this._finish("lose"); }
  }

  _finish(result) {
    if (this.over) return;
    this.over = result; this.overT = 0; this.paused = false;
    if (result === "flee") { this.destroy(); this.onEnd(result); }
  }

  _spark(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(60, 220);
      this.fx.push({ type: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.2, 0.45), color });
    }
  }

  // ---------- Boss bắn ----------
  _shoot(x, y, ang, speed, opts = {}) {
    if (this.eb.length > 700) return;
    this.eb.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: opts.r || 7,
      dmg: this.boss.atk * (opts.mul || 1), big: opts.big || 0, age: 0 });
  }

  _bossAttack() {
    const B = this.boss, pl = this.pl;
    const p2 = B.hp < B.maxHp * 0.5;
    const toP = Math.atan2(pl.y - B.y, pl.x - B.x);
    const patterns = ["ring", "fan", "spiral", "wall", "big"];
    const name = patterns[B.pattern % patterns.length];
    B.pattern++;
    if (name === "ring") {
      const n = p2 ? 26 : 18, off = rand(0, TAU);
      for (let i = 0; i < n; i++) this._shoot(B.x, B.y, off + i / n * TAU, p2 ? 250 : 210);
      if (p2) B.sub.push({ t: 0.35, fn: () => { for (let i = 0; i < n; i++) this._shoot(B.x, B.y, off + (i + 0.5) / n * TAU, 210); } });
    } else if (name === "fan") {
      const vol = p2 ? 4 : 3;
      for (let v = 0; v < vol; v++) B.sub.push({ t: v * 0.25, fn: () => {
        const a0 = Math.atan2(this.pl.y - B.y, this.pl.x - B.x);
        for (let i = -2; i <= 2; i++) this._shoot(B.x, B.y, a0 + i * 0.2, 320);
      } });
    } else if (name === "spiral") {
      let a = rand(0, TAU);
      const steps = p2 ? 40 : 30;
      for (let i = 0; i < steps; i++) B.sub.push({ t: i * 0.075, fn: () => {
        const arms = p2 ? 3 : 2;
        for (let k = 0; k < arms; k++) this._shoot(B.x, B.y, a + k * TAU / arms, 200);
        a += 0.23;
      } });
    } else if (name === "wall") {
      const gapY = rand(AR.y1 + 80, AR.y2 - 80), gap = p2 ? 70 : 90;
      for (let y = AR.y1 + 12; y < AR.y2; y += 36) {
        if (Math.abs(y - gapY) < gap) continue;
        this._shoot(B.x - 40, y, Math.PI, p2 ? 200 : 170);
      }
    } else if (name === "big") {
      const n = p2 ? 4 : 3;
      for (let i = 0; i < n; i++) this._shoot(B.x, B.y, toP + (i - (n - 1) / 2) * 0.35, 150, { r: 18, mul: 1.5, big: 1.1 });
    }
    // giai đoạn 2: thỉnh thoảng lao vào người chơi
    if (p2 && Math.random() < 0.3 && !B.charge) {
      B.charge = 0.55; B.cvx = Math.cos(toP) * 650; B.cvy = Math.sin(toP) * 650;
    }
    B.atkT = p2 ? 1.6 : 2.3;
  }

  // ---------- Update ----------
  update(dt) {
    this.time += dt;
    const pl = this.pl, B = this.boss;
    // hiệu ứng & chữ luôn chạy
    this.fx.forEach(f => { f.t += dt; if (f.type === "spark") { f.x += f.vx * dt; f.y += f.vy * dt; } });
    this.fx = this.fx.filter(f => f.t < f.life);
    this.texts.forEach(t => { t.t += dt; t.y -= 40 * dt; });
    this.texts = this.texts.filter(t => t.t < 0.9);

    if (this.over) {
      this.overT += dt;
      if (this.overT > 1.6 && !this.ended) { this.ended = true; this.destroy(); this.onEnd(this.over); }
      return;
    }

    // hồi chiêu, nội lực
    for (const k in pl.cd) pl.cd[k] = Math.max(0, pl.cd[k] - dt);
    pl.inv = Math.max(0, pl.inv - dt);
    pl.shield = Math.max(0, pl.shield - dt);
    pl.mp = Math.min(pl.maxMp, pl.mp + (10 + pl.maxMp * 0.02) * dt);
    pl.aim = Math.atan2(this.mouse.y - pl.y, this.mouse.x - pl.x);

    // di chuyển
    if (pl.dashT > 0) {
      pl.dashT -= dt; pl.x += pl.dashVx * dt; pl.y += pl.dashVy * dt;
      if (Math.random() < 0.7) this.fx.push({ type: "ghost", x: pl.x, y: pl.y, t: 0, life: 0.25 });
    } else {
      let dx = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
      let dy = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);
      if (dx || dy) { const l = Math.hypot(dx, dy); pl.x += dx / l * pl.speed * dt; pl.y += dy / l * pl.speed * dt; }
    }
    pl.x = clamp(pl.x, AR.x1 + pl.r, AR.x2 - pl.r);
    pl.y = clamp(pl.y, AR.y1 + pl.r, AR.y2 - pl.r);

    // bắn Nguyệt Đao
    pl.fireCd -= dt;
    if (this.mouse.l && pl.fireCd <= 0) {
      this._fire();
      pl.fireCd = 0.4 / (1 + 0.04 * this.p.skills.nguyetanh);
    }

    // đạn người chơi
    for (const b of this.pb) {
      b.age += dt; b.life -= dt;
      if (this.st.homing) {
        const va = Math.atan2(b.vy, b.vx), ta = Math.atan2(B.y - b.y, B.x - b.x);
        const d = angDiff(ta, va);
        if (Math.abs(d) < Math.PI / 4) {
          const na = va + clamp(d, -2.5 * dt, 2.5 * dt), sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.r = b.r0 * (1 + 0.3 * Math.min(1, b.age / 0.8));
      if (Math.hypot(b.x - B.x, b.y - B.y) < b.r * 0.8 + B.r) {
        b.life = 0; this._hitBoss(b.dmg, b.crit); this._spark(b.x, b.y, ELEMENTS.kim.color, 5);
      }
    }
    this.pb = this.pb.filter(b => b.life > 0 && b.x > AR.x1 - 60 && b.x < AR.x2 + 60 && b.y > AR.y1 - 60 && b.y < AR.y2 + 60);

    // boss di chuyển
    B.flash = Math.max(0, B.flash - dt);
    if (B.charge > 0) {
      B.charge -= dt; B.x += B.cvx * dt; B.y += B.cvy * dt;
      if (B.charge <= 0) { B.charge = 0; B.tx = rand(850, 1180); B.ty = rand(AR.y1 + 60, AR.y2 - 60); }
    } else {
      B.moveT -= dt;
      if (B.moveT <= 0) { B.moveT = rand(1.8, 3); B.tx = rand(820, 1180); B.ty = rand(AR.y1 + 60, AR.y2 - 60); }
      const dx = B.tx - B.x, dy = B.ty - B.y, d = Math.hypot(dx, dy);
      if (d > 2) { const sp = Math.min(d, 140 * dt); B.x += dx / d * sp; B.y += dy / d * sp; }
    }
    B.x = clamp(B.x, AR.x1 + B.r, AR.x2 - B.r);
    B.y = clamp(B.y, AR.y1 + B.r, AR.y2 - B.r);
    if (Math.hypot(B.x - pl.x, B.y - pl.y) < B.r + pl.hit) this._hitPlayer(B.atk * 1.2);

    // boss tấn công
    B.atkT -= dt;
    if (B.atkT <= 0) this._bossAttack();
    for (const s of B.sub) { s.t -= dt; if (s.t <= 0 && !s.done) { s.done = true; s.fn(); } }
    B.sub = B.sub.filter(s => !s.done);

    // đạn boss
    const nb = [];
    for (const b of this.eb) {
      b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.big && b.age > b.big) {
        for (let i = 0; i < 8; i++) this._shootInto(nb, b.x, b.y, i / 8 * TAU + rand(0, 0.4), 190);
        continue;
      }
      const d = Math.hypot(b.x - pl.x, b.y - pl.y);
      if (pl.shield > 0 && d < 30 + b.r) { this._spark(b.x, b.y, ELEMENTS.kim.color, 3); continue; }
      if (d < b.r + pl.hit) { this._hitPlayer(b.dmg); continue; }
      if (b.x < AR.x1 - 20 || b.x > AR.x2 + 20 || b.y < AR.y1 - 20 || b.y > AR.y2 + 20) continue;
      nb.push(b);
    }
    this.eb = nb;
  }

  _shootInto(arr, x, y, ang, speed) {
    arr.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7, dmg: this.boss.atk, big: 0, age: 0 });
  }

  // ---------- Draw ----------
  draw() {
    const c = this.ctx, pl = this.pl, B = this.boss;
    const mapEl = ELEMENTS[this.map.element];
    c.fillStyle = "#16181e"; c.fillRect(0, 0, W, H);
    // sàn đấu
    c.fillStyle = "#2a2a26"; c.fillRect(AR.x1, AR.y1, AR.x2 - AR.x1, AR.y2 - AR.y1);
    c.strokeStyle = "rgba(255,255,255,0.04)"; c.lineWidth = 1;
    for (let x = AR.x1; x < AR.x2; x += 80) { c.beginPath(); c.moveTo(x, AR.y1); c.lineTo(x, AR.y2); c.stroke(); }
    for (let y = AR.y1; y < AR.y2; y += 80) { c.beginPath(); c.moveTo(AR.x1, y); c.lineTo(AR.x2, y); c.stroke(); }
    c.strokeStyle = mapEl.color; c.globalAlpha = 0.5; c.lineWidth = 2;
    c.strokeRect(AR.x1, AR.y1, AR.x2 - AR.x1, AR.y2 - AR.y1); c.globalAlpha = 1;

    // vùng Sư Tử Hống
    for (const f of this.fx) if (f.type === "cone") {
      const k = 1 - f.t / f.life, L = f.len * (0.6 + 0.4 * Math.min(1, f.t / 0.12));
      c.fillStyle = `rgba(242,194,48,${0.35 * k})`; c.strokeStyle = `rgba(255,230,120,${0.8 * k})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(f.x, f.y);
      c.lineTo(f.x + Math.cos(f.ang - f.half) * L, f.y + Math.sin(f.ang - f.half) * L);
      c.lineTo(f.x + Math.cos(f.ang + f.half) * L, f.y + Math.sin(f.ang + f.half) * L);
      c.closePath(); c.fill(); c.stroke();
    }

    // bóng lướt
    for (const f of this.fx) if (f.type === "ghost") {
      c.globalAlpha = 0.25 * (1 - f.t / f.life); c.fillStyle = this.robe;
      c.beginPath(); c.arc(f.x, f.y, pl.r, 0, TAU); c.fill(); c.globalAlpha = 1;
    }

    this._drawBoss(c, B);
    this._drawPlayer(c, pl);

    // trăng khuyết
    for (const b of this.pb) {
      const a = Math.atan2(b.vy, b.vx);
      c.lineCap = "round";
      c.strokeStyle = b.crit ? "#fff3b0" : ELEMENTS.kim.color; c.lineWidth = Math.max(4, b.r * 0.32);
      c.beginPath(); c.arc(b.x, b.y, b.r, a - 1.15, a + 1.15); c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = Math.max(1.5, b.r * 0.1);
      c.beginPath(); c.arc(b.x, b.y, b.r * 1.02, a - 0.8, a + 0.8); c.stroke();
    }

    // đạn boss
    const bc = ELEMENTS[B.element].color;
    for (const b of this.eb) {
      c.fillStyle = bc; c.strokeStyle = "#000"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = "rgba(255,255,255,0.8)"; c.beginPath(); c.arc(b.x, b.y, b.r * 0.45, 0, TAU); c.fill();
      if (b.big) { c.strokeStyle = bc; c.globalAlpha = 0.5; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r + 5, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    }

    for (const f of this.fx) if (f.type === "spark") {
      c.globalAlpha = 1 - f.t / f.life; c.fillStyle = f.color;
      c.fillRect(f.x - 2, f.y - 2, 4, 4); c.globalAlpha = 1;
    }

    c.textAlign = "center";
    for (const t of this.texts) {
      c.globalAlpha = 1 - t.t / 0.9; c.font = `600 ${t.size}px sans-serif`;
      c.lineWidth = 4; c.strokeStyle = "#000"; c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.color; c.fillText(t.text, t.x, t.y); c.globalAlpha = 1;
    }

    this._drawHud(c);

    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#fff"; c.font = "600 40px sans-serif"; c.textAlign = "center";
      c.fillText("Tạm dừng", W / 2, H / 2 - 20);
      c.font = "22px sans-serif"; c.fillStyle = "#ccc";
      c.fillText("Esc: tiếp tục   ·   F: bỏ chạy (không nhận thưởng)", W / 2, H / 2 + 25);
    }
    if (this.over && this.over !== "flee") {
      c.fillStyle = `rgba(0,0,0,${Math.min(0.6, this.overT * 0.6)})`; c.fillRect(0, 0, W, H);
      c.font = "600 56px sans-serif"; c.textAlign = "center";
      c.fillStyle = this.over === "win" ? "#f2c230" : "#ff6a5a";
      c.fillText(this.over === "win" ? "Chiến thắng!" : "Thất bại...", W / 2, H / 2);
    }
  }

  _drawPlayer(c, pl) {
    const blink = pl.inv > 0 && Math.floor(this.time * 20) % 2 === 0;
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(pl.x, pl.y + 16, 16, 5, 0, 0, TAU); c.fill();
    if (blink) c.globalAlpha = 0.45;
    // đao
    const a = pl.aim, hx = pl.x + Math.cos(a) * 14, hy = pl.y + Math.sin(a) * 14;
    c.strokeStyle = "#5a3a1a"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); c.moveTo(pl.x, pl.y); c.lineTo(hx, hy); c.stroke();
    c.strokeStyle = "#e6e6e6"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(hx + Math.cos(a + 0.4) * 16, hy + Math.sin(a + 0.4) * 16,
      hx + Math.cos(a) * 26, hy + Math.sin(a) * 26); c.stroke();
    // thân
    c.fillStyle = this.robe; c.strokeStyle = this.robeDark; c.lineWidth = 2.5;
    c.beginPath(); c.arc(pl.x, pl.y, pl.r, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = "#7a3f0c"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(pl.x - 9, pl.y - 11); c.lineTo(pl.x + 9, pl.y + 11); c.stroke();
    // đầu
    c.fillStyle = "#f2cfa4"; c.strokeStyle = "#7a3f0c"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(pl.x, pl.y - 18, 9, 0, TAU); c.fill(); c.stroke();
    if (this.p.gender === "nu") {
      c.fillStyle = "#2a2a2a"; c.beginPath(); c.arc(pl.x, pl.y - 21, 9, Math.PI, TAU); c.fill();
      c.beginPath(); c.arc(pl.x, pl.y - 31, 4.5, 0, TAU); c.fill();
    } else {
      c.fillStyle = "#7a3f0c";
      [-4, 0, 4].forEach(dx => { c.beginPath(); c.arc(pl.x + dx, pl.y - 24, 1.2, 0, TAU); c.fill(); });
    }
    c.globalAlpha = 1;
    if (pl.shield > 0) {
      const k = 0.55 + 0.25 * Math.sin(this.time * 12);
      c.strokeStyle = `rgba(242,194,48,${k})`; c.fillStyle = "rgba(242,194,48,0.12)"; c.lineWidth = 3;
      c.beginPath(); c.arc(pl.x, pl.y - 4, 30, 0, TAU); c.fill(); c.stroke();
    }
    // tâm ngắm
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(this.mouse.x, this.mouse.y, 9, 0, TAU); c.stroke();
    c.fillStyle = "#ff4040"; c.beginPath(); c.arc(pl.x, pl.y, 2.5, 0, TAU); c.fill(); // điểm trúng đạn
  }

  _drawBoss(c, B) {
    const e = ELEMENTS[B.element];
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(B.x, B.y + B.r - 2, B.r, 9, 0, 0, TAU); c.fill();
    if (B.hp < B.maxHp * 0.5) {
      c.strokeStyle = e.color; c.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 6); c.lineWidth = 6;
      c.beginPath(); c.arc(B.x, B.y, B.r + 10, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    c.fillStyle = e.dark;
    c.beginPath(); c.moveTo(B.x - 22, B.y - 26); c.lineTo(B.x - 30, B.y - 58); c.lineTo(B.x - 8, B.y - 34); c.fill();
    c.beginPath(); c.moveTo(B.x + 22, B.y - 26); c.lineTo(B.x + 30, B.y - 58); c.lineTo(B.x + 8, B.y - 34); c.fill();
    c.fillStyle = B.flash > 0 ? "#ffffff" : e.color; c.strokeStyle = e.dark; c.lineWidth = 3;
    c.beginPath(); c.arc(B.x, B.y, B.r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = "#1a1a1a";
    c.beginPath(); c.ellipse(B.x - 13, B.y - 6, 7, 9, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(B.x + 13, B.y - 6, 7, 9, 0, 0, TAU); c.fill();
    c.fillStyle = "#ffe070";
    c.beginPath(); c.arc(B.x - 13, B.y - 6, 3.5, 0, TAU); c.fill();
    c.beginPath(); c.arc(B.x + 13, B.y - 6, 3.5, 0, TAU); c.fill();
    c.strokeStyle = "#1a1a1a"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(B.x - 14, B.y + 16);
    for (let i = 1; i <= 6; i++) c.lineTo(B.x - 14 + i * 4.67, B.y + 16 + (i % 2 ? -5 : 0));
    c.stroke();
  }

  _bar(c, x, y, w, h, v, max, col, bg) {
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    c.fillStyle = col; c.fillRect(x, y, w * clamp(v / max, 0, 1), h);
    c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 1; c.strokeRect(x, y, w, h);
  }

  _drawHud(c) {
    const pl = this.pl, B = this.boss, p = this.p;
    c.textAlign = "left"; c.font = "600 18px sans-serif"; c.fillStyle = "#f2c230";
    c.fillText(`${p.name} · Lv${p.level} · ${SECTS[p.sect].name}`, 30, 26);
    this._bar(c, 30, 36, 300, 16, pl.hp, pl.maxHp, "#d94040", "#3d1d1d");
    this._bar(c, 30, 57, 300, 11, pl.mp, pl.maxMp, "#3f86e0", "#1d2a3d");
    c.font = "13px sans-serif"; c.fillStyle = "#fff";
    c.fillText(`${fmt(pl.hp)} / ${fmt(pl.maxHp)}`, 36, 49);

    c.textAlign = "center"; c.fillStyle = "#cfcfcf"; c.font = "16px sans-serif";
    c.fillText(`${this.map.name} · ${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, "0")}`, W / 2, 30);
    if (this.bossBonus > 1) { c.fillStyle = "#6fd06f"; c.fillText("Khắc chế boss: +15% sát thương", W / 2, 54); }
    else if (this.playerTakenBonus > 1) { c.fillStyle = "#ff8a70"; c.fillText("Bị boss khắc: nhận thêm 15% sát thương", W / 2, 54); }

    const e = ELEMENTS[B.element];
    c.textAlign = "right"; c.font = "600 18px sans-serif"; c.fillStyle = e.color;
    c.fillText(`${B.name} Lv${B.lv} (${e.name})`, 1250, 26);
    this._bar(c, 850, 36, 400, 16, B.hp, B.maxHp, "#d94040", "#3d1d1d");
    c.font = "13px sans-serif"; c.fillStyle = "#fff";
    c.fillText(`${fmt(B.hp)} / ${fmt(B.maxHp)}`, 1244, 49);

    // ô kỹ năng
    const sk = p.skills;
    const slots = [
      { key: "Chuột trái", name: "Nguyệt Đao", lv: sk.nguyetdao, cd: 0, max: 1, col: "#f2c230" },
      { key: "Chuột phải", name: "Sư Tử Hống", lv: sk.sutuhong, cd: pl.cd.sutu, max: sutuCooldown(Math.max(1, sk.sutuhong)), col: "#f2c230", mp: 30 },
      { key: "Q", name: "Kim Cang", lv: sk.kimcang, cd: pl.cd.kimcang, max: kimcangCooldown(Math.max(1, sk.kimcang)), col: "#f2c230", mp: 40 },
      { key: "Space", name: "Lướt né", lv: 1, cd: pl.cd.dash, max: 1.2, col: "#9adfff" }
    ];
    const sw = 120, gap = 12, sx = W / 2 - (slots.length * sw + (slots.length - 1) * gap) / 2, sy = 650;
    slots.forEach((s, i) => {
      const x = sx + i * (sw + gap);
      c.fillStyle = "#2e3140"; c.fillRect(x, sy, sw, 60);
      c.strokeStyle = s.lv > 0 ? s.col : "#555"; c.lineWidth = 2; c.strokeRect(x, sy, sw, 60);
      c.textAlign = "center"; c.fillStyle = s.lv > 0 ? "#fff" : "#777"; c.font = "600 15px sans-serif";
      c.fillText(s.name, x + sw / 2, sy + 25);
      c.font = "12px sans-serif"; c.fillStyle = "#aaa";
      c.fillText(s.lv > 0 ? s.key : "Chưa học", x + sw / 2, sy + 46);
      if (s.lv > 0 && s.cd > 0) {
        c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(x, sy, sw, 60 * (s.cd / s.max));
        c.fillStyle = "#fff"; c.font = "600 18px sans-serif"; c.fillText(s.cd.toFixed(1), x + sw / 2, sy + 36);
      } else if (s.lv > 0 && s.mp && pl.mp < s.mp) {
        c.fillStyle = "rgba(20,40,90,0.55)"; c.fillRect(x, sy, sw, 60);
      }
    });
    c.textAlign = "left"; c.fillStyle = "#777"; c.font = "13px sans-serif";
    c.fillText("WASD di chuyển · Esc tạm dừng", 30, 690);
  }
}
