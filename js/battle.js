// ===== ĐÁNH BOSS: né đạn thời gian thực (canvas) — bản 2.2 =====
// Sân lớn hơn màn hình, camera đi theo nhân vật. 2 kiểu điều khiển (A: WASD, B: chuột để đi). Bản 2.2: phòng thử nhiều người (kind "room").
import { GD, S, X, elemBonus, elemColor, elemName, miscByKind, WEAPON_NAMES } from "./data.js";
import {
  calcStats, skillCalc, skillBonusLevels, skillLevel, activePath, weaponOk, equippedWeapon, partyMul,
  rawSkillDamage, damageTaken, mitigate, critRoll, critMul, rand, clamp, fmt, pick, useMisc, skillMaxLv
} from "./logic.js";

const W = 1280, H = 720;
const VIEW = { x: 0, y: 76, w: 1280, h: 558 };    // khung sân trên màn hình (giữa thanh trên và thanh kỹ năng)
const ZOOM = 0.82;                                 // thu nhỏ một chút để thấy rộng hơn
const VW = VIEW.w / ZOOM, VH = VIEW.h / ZOOM;      // phần sân nhìn thấy
const AR = { x1: 0, y1: 0, x2: 2000, y2: 1100 };   // cả sân (đủ chỗ cho 4 người sau này)
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
const img = src => { if (!src) return null; const i = new Image(); i.src = src; return i; };
const ready = i => i && i.complete && i.naturalWidth > 0;

export class Battle {
  // ctx = { kind: "map" | "gold" | "room", boss, map, players, net }   (room = phòng thử nhiều người, boss là mộc nhân)
  constructor(canvas, player, ctx, onEnd) {
    this.cv = canvas; this.c = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    this.p = player; this.kind = ctx.kind; this.map = ctx.map; this.onEnd = onEnd;
    this.bonus = skillBonusLevels(player);
    this.buff = null;
    this.path = activePath(player);
    const set = (X.skillOf[player.sect] || {})[this.path] || {};
    this.sk = {};
    for (const slot of ["lmb", "rmb", "q"]) {
      const s = set[slot];
      if (!s) continue;
      this.sk[slot] = { s, learned: !!player.skills[s.id], ok: weaponOk(player, s) };
    }
    // bị động đặc biệt: Thê Vân Tung (lướt tới đánh), Mê Tung Nhuyễn Ảnh (tăng khi vòng còn trên sân)
    this.passive = {};
    for (const slot of ["p1", "p2"]) {
      const s = set[slot]; if (!s) continue;
      const lv = skillLevel(player, s.id, this.bonus); if (!lv) continue;
      if (s.mech === "dash_strike") this.passive.dash = { s, lv };
      if (s.mech === "aura_while") {
        const tslot = Object.keys(this.sk).find(k => this.sk[k].s.id === s.target);
        this.passive.aura = { s, lv, slot: tslot };
      }
    }
    this.taiji = null; this.auraState = 0;
    this._refreshStats();
    const b = ctx.boss, pm = partyMul(ctx.players || 1);
    this.el = this.st.element;
    const midY = (AR.y1 + AR.y2) / 2;
    this.pl = {
      x: 650, y: midY, r: 16, hit: 7,
      hp: this.st.hp, mp: this.st.mp, aim: 0, fireCd: 0,
      dashT: 0, dashVx: 0, dashVy: 0, inv: 0, holy: 0, immune: 0,
      cd: { rmb: 0, q: 0, dash: 0 }, pot: {}, fx: {}, revived: false
    };
    const bhp = Math.round(b.hp * pm.hp);
    this.B = {
      name: b.name, lv: b.lv, element: b.element, hp: bhp, maxHp: bhp, atk: b.atk * pm.dmg, def: b.def,
      patterns: (b.patterns && b.patterns.length) ? b.patterns : ["ring", "fan"], effect: b.effect || "", effectChance: b.effectChance || 0,
      x: 1350, y: midY, r: 40, tx: 1350, ty: midY, moveT: 0, atkT: 1.5, pi: 0, sub: [], flash: 0,
      charge: 0, cvx: 0, cvy: 0, fx: {}, ccImm: 0, pull: 0, slowPct: 40
    };
    this.room = this.kind === "room"; this.net = ctx.net || null;
    if (this.room) {                       // mộc nhân đứng giữa sân, không đánh; người vào phòng đứng rải ra cho khỏi chồng nhau
      this.B.x = this.B.tx = 1000; this.B.atkT = 1e9;
      this.pl.x = 520 + Math.random() * 220; this.pl.y = midY + (Math.random() - 0.5) * 420;
    }
    this.rem = {}; this.gh = []; this.dealt = 0; this.netT = 0; this.netLast = {}; this.netDmAt = -1; this.dummyT = 0; this.hostSeen = {};
    if (this.net) { this.net.onCast = (uid, ev) => this._ghostCast(uid, ev); this.net.onDummy = d => this.netDummy(d); if (this.net.dummy) this.netDummy(this.net.dummy); }
    this.pb = []; this.eb = []; this.fx = []; this.texts = [];
    this.traps = []; this.orbit = null; this.minions = []; this.zones = []; this.lasers = []; this.clouds = []; this.booms = [];
    this.later = [];                       // việc hẹn giờ của người chơi (kiếm thứ 2 Lưỡng Nghi...)
    this.fist = null; this.strike = null; this.dashStrikeCd = 0;
    this.vk = null; this.vkShield = 0;      // Vạn Kiếm Quy Tông
    this.beamCharge = null; this.beams = [];
    this.tornados = []; this.palms = [];
    this.keys = {}; this.ms = { x: W / 2, y: H / 2 }; this.mouse = { x: 0, y: 0, l: false }; this.moveTo = null;
    this.cam = { x: 0, y: 0 };
    this.time = 0; this.paused = false; this.over = null; this.overT = 0;
    this.fps = 0; this._fpsN = 0; this._fpsT = 0;
    this.bossBonus = elemBonus(this.el, b.element);
    this.takenBonus = elemBonus(b.element, this.el);
    this.used = {};
    // hình
    const g = X.gender[player.gender] || {};
    const wt = equippedWeapon(player);
    this.imgPl = img(g["sprite_" + (wt || "none")] || g.sprite_none);
    this.imgBoss = img(b.img);
    if (this.imgBoss) this.imgBoss.onload = () => this._buildBossWhite();
    this.imgBg = img(this.map && this.map.bg);
    if (this.imgBg) this.imgBg.onload = () => this._buildBg();
    this.mobKinds = (X.monOf[this.map ? this.map.id : ""] || []).map(m => ({ name: m.name, element: m.element, img: img(m.img) }));
    this._loadFx();
    this._buildBg();
    this._camSnap();
    this._bind();
  }

  get low() { return this.p.gfx === "thap"; }
  get modeB() { return this.p.ctrl === "B"; }

  _refreshStats() {
    const extra = {};
    if (this.buff) this.buff.stats.forEach(x => extra[x.stat] = (extra[x.stat] || 0) + x.v);
    const au = this.passive && this.passive.aura;
    if (au && this.auraState === 1) {           // vòng Thiên Địa Vô Cực còn trên sân
      (au.s.boosts || []).forEach(bo => {
        if (bo.attr === "dmg") extra.atkPct = (extra.atkPct || 0) + bo.per * au.lv;
        if (bo.attr === "crit") extra.crit = (extra.crit || 0) + bo.per * au.lv;
      });
    }
    if (au && this.auraState === 2) extra.manasteal = (extra.manasteal || 0) + 10 + (Math.min(skillMaxLv(au.s), au.lv) - 1) * 40 / 9;   // đang hồi chiêu: hút nội lực 10–50% (tầng 11–13 thêm nữa)
    const old = this.st;
    this.st = calcStats(this.p, extra);
    this.sc = {};
    for (const slot of ["lmb", "rmb", "q"]) {
      const s = this.sk && this.sk[slot];
      if (s && s.learned) this.sc[slot] = skillCalc(this.p, s.s.id, this.st, this.bonus);
    }
    if (old && this.pl) {        // giữ tỉ lệ máu khi buff đổi máu tối đa
      this.pl.hp = Math.min(this.pl.hp, this.st.hp);
      this.pl.mp = Math.min(this.pl.mp, this.st.mp);
    }
  }

  // ---------- Hình đạn / hiệu ứng của skill ----------
  _loadFx() {
    this.fxi = {}; this.tintCache = {};
    for (const slot in this.sk) {
      const s = this.sk[slot].s;
      this.fxi[slot] = {
        A: img(s.fxA), B: img(s.fxB), F: [s.fxF1, s.fxF2, s.fxF3, s.fxF4].map(img),
        rotA: (s.fxARot || 0) * DEG, rotB: (s.fxBRot || 0) * DEG, tint: s.fxTint || "none"
      };
    }
  }
  // trả về hình đã tô màu theo hệ (tô 1 lần rồi giữ lại)
  _fx(slot, key, idx) {
    const f = this.fxi[slot]; if (!f) return null;
    const im = key === "F" ? f.F[idx] : f[key];
    if (!ready(im)) return null;
    if (f.tint === "none") return im;
    const ck = slot + key + (idx || 0);
    if (this.tintCache[ck]) return this.tintCache[ck];
    const o = document.createElement("canvas"); o.width = im.naturalWidth; o.height = im.naturalHeight;
    const x = o.getContext("2d"); x.drawImage(im, 0, 0);
    x.globalCompositeOperation = "source-atop"; x.globalAlpha = f.tint === "full" ? 1 : 0.55;
    x.fillStyle = f.col || elemColor(this.el); x.fillRect(0, 0, o.width, o.height);
    return (this.tintCache[ck] = o);
  }
  // vẽ hình skill: size = cạnh dài nhất (px), rot = góc mũi hình
  _drawFx(c, slot, key, x, y, ang, size, alpha = 1, idx = 0) {
    const im = this._fx(slot, key, idx); if (!im) return false;
    const f = this.fxi[slot], rot = key === "B" ? f.rotB : key === "A" ? f.rotA : 0;
    const w0 = im.width || im.naturalWidth, h0 = im.height || im.naturalHeight, k = size / Math.max(w0, h0);
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(ang + rot);
    c.imageSmoothingEnabled = false;
    c.drawImage(im, -w0 * k / 2, -h0 * k / 2, w0 * k, h0 * k);
    c.restore();
    return true;
  }

  // ---------- Nền sân vẽ sẵn 1 lần ----------
  _buildBg() {
    const o = this.bgCv || document.createElement("canvas");
    o.width = AR.x2 - AR.x1; o.height = AR.y2 - AR.y1;
    const x = o.getContext("2d");
    x.fillStyle = "#2a2a26"; x.fillRect(0, 0, o.width, o.height);
    if (!this.low && ready(this.imgBg)) {
      x.drawImage(this.imgBg, 0, 0, o.width, o.height);
      x.fillStyle = "rgba(10,12,16,0.35)"; x.fillRect(0, 0, o.width, o.height);
    } else {
      x.strokeStyle = "rgba(255,255,255,0.05)"; x.lineWidth = 1;
      for (let i = 0; i < o.width; i += 80) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, o.height); x.stroke(); }
      for (let i = 0; i < o.height; i += 80) { x.beginPath(); x.moveTo(0, i); x.lineTo(o.width, i); x.stroke(); }
    }
    x.strokeStyle = elemColor(this.map ? this.map.element : (this.B ? this.B.element : "kim")); x.globalAlpha = 0.6; x.lineWidth = 6;
    x.strokeRect(3, 3, o.width - 6, o.height - 6); x.globalAlpha = 1;
    this.bgCv = o;
  }
  // bóng trắng của boss để chớp khi trúng đòn (không dùng filter, nhẹ cho máy yếu)
  _buildBossWhite() {
    if (!ready(this.imgBoss)) return;
    const o = document.createElement("canvas"); o.width = this.imgBoss.naturalWidth; o.height = this.imgBoss.naturalHeight;
    const x = o.getContext("2d"); x.drawImage(this.imgBoss, 0, 0);
    x.globalCompositeOperation = "source-atop"; x.fillStyle = "#fff"; x.fillRect(0, 0, o.width, o.height);
    this.bossWhite = o;
  }

  // ---------- Camera ----------
  _camTarget() {
    return {
      x: clamp(this.pl.x - VW / 2, AR.x1, AR.x2 - VW),
      y: clamp(this.pl.y - VH / 2, AR.y1, AR.y2 - VH)
    };
  }
  _camSnap() { const t = this._camTarget(); this.cam.x = t.x; this.cam.y = t.y; }
  _updateCam(dt) {
    const t = this._camTarget(), k = 1 - Math.exp(-9 * dt);
    this.cam.x += (t.x - this.cam.x) * k; this.cam.y += (t.y - this.cam.y) * k;
  }
  _mouseWorld() {
    this.mouse.x = this.cam.x + (this.ms.x - VIEW.x) / ZOOM;
    this.mouse.y = this.cam.y + (this.ms.y - VIEW.y) / ZOOM;
  }
  _inView(x, y, r = 40) {
    return x > this.cam.x - r && x < this.cam.x + VW + r && y > this.cam.y - r && y < this.cam.y + VH + r;
  }

  // ---------- Input ----------
  _bind() {
    const toLocal = e => {
      const r = this.cv.getBoundingClientRect();
      this.ms.x = (e.clientX - r.left) / r.width * W;
      this.ms.y = (e.clientY - r.top) / r.height * H;
    };
    this.h = {
      kd: e => {
        const k = e.key.toLowerCase();
        if (["w", "a", "s", "d", " ", "q", "e", "r", "escape", "f", "c", "g", "p", "1", "2", "3"].includes(k)) e.preventDefault();
        if (k === "escape" && !this.over) { this.paused = !this.paused; this.keys = {}; this.mouse.l = false; return; }
        if (this.paused) {
          if (k === "f") this._finish("flee");
          if (k === "c") { this.p.ctrl = this.modeB ? "A" : "B"; this.moveTo = null; }
          if (k === "g") { this.p.gfx = this.low ? "cao" : "thap"; this._buildBg(); }
          if (k === "p") this.p.showFps = !this.p.showFps;
          return;
        }
        if (!this.keys[k]) {
          if (k === " ") this._dash();
          if (this.modeB) {
            if (k === "w") this._cast("rmb");
            if (k === "e") this._cast("q");
            if (k === "r") this._note("Ô R để dành cho chiêu sau này", "#aaa");
          } else if (k === "q") this._cast("q");
          if (k === "1" || k === "2" || k === "3") this._potion(k);
        }
        this.keys[k] = true;
      },
      ku: e => { this.keys[e.key.toLowerCase()] = false; },
      mm: e => toLocal(e),
      md: e => {
        toLocal(e); e.preventDefault();
        if (this.paused || this.over) return;
        if (e.button === 0) {
          this.mouse.l = true;
          if (this.modeB) { this._mouseWorld(); this.moveTo = { x: this.mouse.x, y: this.mouse.y }; }
        }
        if (e.button === 2 && !this.modeB) this._cast("rmb");
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
      this._fpsN++; this._fpsT += dt;
      if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsT); this._fpsN = 0; this._fpsT = 0; }
      if (!this.paused) this.update(dt);
      if (this.dead) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- Trạng thái người chơi ----------
  _can(kind) {     // kind: "move" | "cast"
    const f = this.pl.fx;
    if (f.stun > 0) return false;
    if (kind === "move" && f.freeze > 0) return false;
    return true;
  }
  _speedMul() { const f = this.pl.fx; return f.slow > 0 ? 1 - this._effVal("slow", 40) / 100 : 1; }
  _atkMul() { const f = this.pl.fx; let m = this._speedMul(); if (f.freeze > 0) m *= 0.5; return m; }
  _effVal(id, d) { const e = X.effect[id]; return e && e.value ? e.value : d; }
  _effDur(id, d) { const e = X.effect[id]; return e && e.dur ? e.dur : d; }
  _firing() { return this.modeB ? !!this.keys.q : this.mouse.l; }

  // ---------- Kỹ năng ----------
  _dash() {
    const pl = this.pl;
    if (pl.cd.dash > 0 || this.over || !this._can("move")) return;
    let dx = 0, dy = 0;
    if (!this.modeB) { dx = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0); dy = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0); }
    if (!dx && !dy) { dx = Math.cos(pl.aim); dy = Math.sin(pl.aim); }
    const l = Math.hypot(dx, dy);
    pl.dashVx = dx / l * 950; pl.dashVy = dy / l * 950;
    pl.dashT = 0.16; pl.inv = Math.max(pl.inv, 0.28); pl.cd.dash = 1.2;
    this.strike = null;
    if (this.modeB) this.moveTo = null;
  }

  _note(text, color = "#ffb070") { this.texts.push({ x: this.pl.x, y: this.pl.y - 96, t: 0, text, color, size: 16 }); }

  _cast(slot) {
    const pl = this.pl, k = this.sk[slot], sc = this.sc[slot];
    if (this.over || !k) return;
    const m = k.s.mech;
    if (m === "boomerang" && this.vk && this.vk.slot === slot) return this._vkRecall();   // bấm lần nữa: gọi kiếm về
    if (!k.learned) return this._note("Chưa học " + k.s.name);
    if (!k.ok) return this._note("Cần cầm " + WEAPON_NAMES[k.s.weapon]);
    if (!this._can("cast")) return;
    if (pl.cd[slot] > 0) return;
    if ((m === "boomerang" && this.vk) || (m === "bounce" && this.taiji) || (m === "beam" && this.beamCharge)) return;
    if (pl.mp < sc.mp) return this._note("Thiếu nội lực", "#7fb2f0");
    pl.mp -= sc.mp; pl.cd[slot] = sc.cd || 1;
    if (this.net) this._netCast(slot, sc, m);
    if (m === "boomerang") { pl.cd[slot] = 0; return this._vkLaunch(slot, sc); }      // hồi chiêu tính từ lúc kiếm về
    if (m === "bounce") { pl.cd[slot] = 0; return this._taijiLaunch(slot, sc); }      // hồi chiêu tính từ lúc vòng tan
    if (m === "beam") { this.beamCharge = { t: 0, slot, sc }; return; }
    if (m === "tornado") return this._tornado(slot, sc);
    if (m === "cone") return this._cone(sc, slot);
    if (m === "invuln") { pl.holy = sc.dur; return; }
    if (m === "orbit") { this.orbit = { t: sc.dur, n: sc.count, r: Math.max(50, sc.size), ang: 0, sc, hitT: {} }; return; }
    if (m === "buff_stat" || (slot === "q" && sc.stats.length)) {
      this.buff = { t: Math.max(1, sc.dur), stats: sc.stats }; this._refreshStats(); return;
    }
    if (m === "shield") { pl.holy = Math.max(pl.holy, sc.dur || 2); return; }
    if (m === "circle" || m === "debuff_area" || m === "ground_burst") return this._circle(sc, m === "ground_burst");
    // các cơ chế chưa có code riêng: bắn đạn thường
    this._shootPlayer(sc, pl.aim, 1.2, "ball", { slot });
  }

  _cone(sc, slot) {
    const pl = this.pl, ang = pl.aim, len = sc.size || 250, half = 32 * DEG;
    this.fx.push({ type: "cone", x: pl.x, y: pl.y, ang, len, half, t: 0, life: 0.4, slot });
    const inCone = (x, y, r = 0) => {
      const d = dist(x, y, pl.x, pl.y);
      return d < len + r && Math.abs(angDiff(Math.atan2(y - pl.y, x - pl.x), ang)) < half + Math.atan2(r, Math.max(d, 1));
    };
    this.eb = this.eb.filter(b => { if (inCone(b.x, b.y)) { this._spark(b.x, b.y, elemColor(this.el), 2); return false; } return true; });
    if (inCone(this.B.x, this.B.y, this.B.r)) this._dmgBoss(sc, 1);
    this.minions.forEach(m => { if (inCone(m.x, m.y, m.r)) this._dmgMinion(m, sc, 1); });
  }

  _circle(sc, atMouse) {
    const pl = this.pl, x = atMouse ? this.mouse.x : pl.x, y = atMouse ? this.mouse.y : pl.y, r = sc.size || 150;
    this.fx.push({ type: "ring", x, y, r, t: 0, life: 0.45, color: elemColor(this.el) });
    if (dist(x, y, this.B.x, this.B.y) < r + this.B.r) this._dmgBoss(sc, 1);
    this.minions.forEach(m => { if (dist(x, y, m.x, m.y) < r + m.r) this._dmgMinion(m, sc, 1); });
  }

  _fireLmb() {
    const k = this.sk.lmb, sc = this.sc.lmb;
    if (!k || !k.learned || !k.ok || !sc) return 0.5;
    const pl = this.pl, m = k.s.mech;
    if (m === "orbit") return 0.2;              // Võ Đang Trường Quyền: nắm đấm xoay, xử lý ở _updateFist
    const spread = this.st.spread * DEG;
    if (m === "staff_trap") {
      for (let i = 0; i < sc.count; i++) {
        let tx = this.mouse.x, ty = this.mouse.y;
        const d = dist(tx, ty, pl.x, pl.y), maxD = 460;
        if (d > maxD) { tx = pl.x + (tx - pl.x) / d * maxD; ty = pl.y + (ty - pl.y) / d * maxD; }
        const err = spread * 60 * (Math.random() - 0.5) * 2 + (i ? rand(-45, 45) : 0);
        tx += err; ty += (i ? rand(-45, 45) : 0) + spread * 40 * (Math.random() - 0.5) * 2;
        tx = clamp(tx, AR.x1 + 10, AR.x2 - 10); ty = clamp(ty, AR.y1 + 10, AR.y2 - 10);
        const a = Math.atan2(ty - pl.y, tx - pl.x);
        this.pb.push({ kind: "staff", x: pl.x, y: pl.y, tx, ty, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, r: 12, sc, hitSet: new Set(), life: 2, age: 0, rot: 0 });
      }
    } else if (m === "twin_sword") {          // Lưỡng Nghi: kiếm 1 rồi kiếm 2 (50% sát thương, luôn làm chậm 0,5 giây)
      const a = pl.aim + rand(-spread, spread);
      this._shootPlayer(sc, a, 1, "img", { slot: "lmb", key: "A", noFx: true, off: -7 });
      this.later.push({ t: 0.12, fn: () => this._shootPlayer(sc, a, 0.5, "img",
        { slot: "lmb", key: "B", noFx: true, off: 7, slowPct: clamp(sc.effectChance, 0, 90), slowDur: 0.5, size: 0.85 }) });
    } else {
      const n = sc.count, gap = 0.13;
      for (let i = 0; i < n; i++) this._shootPlayer(sc, pl.aim + (i - (n - 1) / 2) * gap + rand(-spread, spread), 1, m === "crescent" ? "moon" : "ball", { slot: "lmb" });
    }
    return 1 / Math.max(0.3, sc.aspd * this._atkMul());
  }

  _shootPlayer(sc, a, mul = 1, kind = "ball", o = {}) {
    const pl = this.pl, sp = 620;
    const r = kind === "moon" ? Math.max(10, sc.size) : Math.max(6, Math.min(16, sc.size || 8));
    const ox = o.off ? Math.cos(a + Math.PI / 2) * o.off : 0, oy = o.off ? Math.sin(a + Math.PI / 2) * o.off : 0;
    const slot = o.slot || "lmb";
    const useImg = !!this._fx(slot, o.key || "A");
    this.pb.push({ kind: useImg && kind !== "moon" ? "img" : kind, img: useImg, slot, key: o.key || "A",
      x: pl.x + Math.cos(a) * 20 + ox, y: pl.y + Math.sin(a) * 20 + oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r, r0: r, sc, mul, life: 1.6, age: 0, opt: { noFx: o.noFx, slowPct: o.slowPct, slowDur: o.slowDur }, size: o.size || 1 });
  }

  // ---- Võ Đang Trường Quyền: nắm đấm xoay quanh người khi giữ nút đánh ----
  _updateFist(dt, holding) {
    const k = this.sk.lmb, sc = this.sc.lmb, pl = this.pl;
    if (!holding || !k || k.s.mech !== "orbit" || !k.learned || !k.ok || !sc || !this._can("cast")) { this.fist = null; return; }
    if (!this.fist) this.fist = { ang: pl.aim - 1.2, hitT: new Map() };
    const f = this.fist, r = Math.max(50, sc.size);
    f.ang += (3 + sc.aspd * this._atkMul() * 2.2) * dt;        // tốc đánh càng cao xoay càng nhanh
    f.r = r; f.x = pl.x + Math.cos(f.ang) * r; f.y = pl.y + Math.sin(f.ang) * r;
    for (const [t, v] of f.hitT) f.hitT.set(t, v - dt);
    const gap = 1 / Math.max(0.5, sc.aspd * this._atkMul());
    this._hitTargets(f.x, f.y, 18, (tg, boss) => {
      if ((f.hitT.get(tg) || 0) > 0) return; f.hitT.set(tg, gap);
      const opt = { noFx: true, stun: 0.3, imm: 1.2 };
      boss ? this._dmgBoss(sc, 1, opt) : this._dmgMinion(tg, sc, 1, opt);
      this._spark(f.x, f.y, elemColor(this.el), 3);
    });
    // Thê Vân Tung: địch ở ngoài vòng nắm đấm thì lướt tới
    const ds = this.passive.dash;
    if (!ds || this.dashStrikeCd > 0 || this.strike || pl.dashT > 0 || !this._can("move")) return;
    const tg = this._nearestTarget(); if (!tg) return;
    const d = dist(pl.x, pl.y, tg.x, tg.y);
    if (d <= r + tg.r + 8) return;
    const range = 260 + 15 * (ds.lv - 1), go = Math.min(range, d - tg.r - r * 0.4);
    if (go < 30) return;
    const a = Math.atan2(tg.y - pl.y, tg.x - pl.x), sp = 1150;
    pl.dashVx = Math.cos(a) * sp; pl.dashVy = Math.sin(a) * sp; pl.dashT = go / sp;
    this.strike = { tg, mul: 1 + (ds.lv - 1) * 2 / 9, reach: r + tg.r + 30 };
    this.dashStrikeCd = 3;
    if (this.modeB) this.moveTo = null;
  }
  _nearestTarget() {
    let best = this.B.hp > 0 ? this.B : null, bd = best ? dist(this.pl.x, this.pl.y, best.x, best.y) : 1e9;
    for (const m of this.minions) { if (m.hp <= 0) continue; const d = dist(this.pl.x, this.pl.y, m.x, m.y); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  // ---- Vạn Kiếm Quy Tông: kiếm bay nhanh xuyên qua boss, tự về sau thời gian hoặc bấm lần nữa ----
  _vkLaunch(slot, sc) {
    const pl = this.pl, n = Math.max(1, sc.count), gap = 0.2, swords = [];
    for (let i = 0; i < n; i++) swords.push({ x: pl.x, y: pl.y, a: pl.aim + (i - (n - 1) / 2) * gap, d: 0, st: "out", hit: new Set(), hitBack: new Set() });
    this.vk = { slot, sc, swords, t: 0, max: Math.max(1, sc.dur || 4), out: 620, sp: 1300, recall: false };
  }
  _vkRecall() { if (this.vk) this.vk.recall = true; }
  _updateVk(dt) {
    const v = this.vk; if (!v) return;
    const pl = this.pl; v.t += dt;
    if (v.t >= v.max) v.recall = true;
    let left = 0;
    for (const s of v.swords) {
      if (s.st === "done") continue;
      left++;
      if (v.recall && s.st !== "back") s.st = "back";
      if (s.st === "out") {
        const step = v.sp * dt;
        s.x += Math.cos(s.a) * step; s.y += Math.sin(s.a) * step; s.d += step;
        if (s.d >= v.out || s.x < AR.x1 || s.x > AR.x2 || s.y < AR.y1 || s.y > AR.y2) s.st = "hold";
        this._hitTargets(s.x, s.y, 16, (tg, boss) => {
          if (s.hit.has(tg)) return; s.hit.add(tg);
          boss ? this._dmgBoss(v.sc, 1, { noFx: true }) : this._dmgMinion(tg, v.sc, 1, { noFx: true });
        });
      } else if (s.st === "back") {
        const a = Math.atan2(pl.y - s.y, pl.x - s.x), d = dist(s.x, s.y, pl.x, pl.y), step = v.sp * 1.15 * dt;
        s.ba = a;
        if (d <= step + 20) { s.st = "done"; continue; }
        s.x += Math.cos(a) * step; s.y += Math.sin(a) * step;
        this._hitTargets(s.x, s.y, 18, (tg, boss) => {     // đường về: gây choáng 1 giây
          if (s.hitBack.has(tg)) return; s.hitBack.add(tg);
          const opt = { noFx: true, stun: 1, imm: 2 };
          boss ? this._dmgBoss(v.sc, 1, opt) : this._dmgMinion(tg, v.sc, 1, opt);
        });
      }
    }
    if (!left) {      // kiếm đã về hết: giảm 50% sát thương nhận vào 2,5 giây, bắt đầu hồi chiêu
      this.vk = null;
      pl.cd[v.slot] = v.sc.cd || 1;
      this.vkShield = 2.5;
      this._note("Kiếm hộ thể: −50% sát thương nhận", "#f2c230");
    }
  }

  // ---- Thiên Địa Vô Cực: vòng thái cực nảy tường, xóa đạn, trúng thì choáng hoặc làm chậm ----
  _taijiLaunch(slot, sc) {
    const pl = this.pl, a = pl.aim, sp = 560;
    this.taiji = { slot, sc, x: pl.x + Math.cos(a) * 30, y: pl.y + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: Math.max(18, sc.size * 0.55), t: Math.max(0.5, sc.dur || 3.5), rot: 0 };
  }
  _updateTaiji(dt) {
    const T = this.taiji; if (!T) return;
    T.t -= dt; T.rot += dt * 5;
    T.x += T.vx * dt; T.y += T.vy * dt;
    if (T.x < AR.x1 + T.r) { T.x = AR.x1 + T.r; T.vx = Math.abs(T.vx); }
    if (T.x > AR.x2 - T.r) { T.x = AR.x2 - T.r; T.vx = -Math.abs(T.vx); }
    if (T.y < AR.y1 + T.r) { T.y = AR.y1 + T.r; T.vy = Math.abs(T.vy); }
    if (T.y > AR.y2 - T.r) { T.y = AR.y2 - T.r; T.vy = -Math.abs(T.vy); }
    this.eb = this.eb.filter(b => { if (dist(b.x, b.y, T.x, T.y) < T.r + b.r) { this._spark(b.x, b.y, "#fff", 2); return false; } return true; });
    let hit = null;
    this._hitTargets(T.x, T.y, T.r, (tg, boss) => { if (!hit) hit = [tg, boss]; });
    if (hit) {
      const [tg, boss] = hit;
      const opt = Math.random() < 0.5 ? { noFx: true, stun: 1.5 } : { noFx: true, slowPct: 50, slowDur: 3.5 };
      boss ? this._dmgBoss(T.sc, 1, opt) : this._dmgMinion(tg, T.sc, 1, opt);
      this.fx.push({ type: "ring", x: T.x, y: T.y, r: T.r * 1.6, t: 0, life: 0.4, color: elemColor(this.el) });
      T.t = 0;
    }
    if (T.t <= 0) { this.taiji = null; this.pl.cd[T.slot] = T.sc.cd || 1; }
  }

  // ---- Lục Mạch Thần Kiếm: gồng (nét đứt ngắm, không gây sát thương) rồi bắn tia kiếm khí tỏa quạt ----
  _beamAngles(sc) {
    const n = Math.max(1, sc.count), fan = 40 * DEG, a0 = this.pl.aim;
    return n === 1 ? [a0] : Array.from({ length: n }, (_, i) => a0 - fan / 2 + fan * i / (n - 1));
  }
  _fireBeams(slot, sc) {
    const pl = this.pl, L = 1900, angs = this._beamAngles(sc);
    const onRay = (a, x, y, r) => {
      const dx = x - pl.x, dy = y - pl.y, along = dx * Math.cos(a) + dy * Math.sin(a);
      return along > 0 && along < L && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) < r + 10;
    };
    for (const a of angs) {     // mỗi tia trúng mỗi mục tiêu 1 lần
      if (onRay(a, this.B.x, this.B.y, this.B.r)) this._dmgBoss(sc, 1);
      for (const m of this.minions) if (m.hp > 0 && onRay(a, m.x, m.y, m.r)) this._dmgMinion(m, sc, 1);
    }
    this.beams.push({ x: pl.x, y: pl.y, angs, t: 0, life: 0.45, slot, L });
  }

  // ---- Tuyết Mãn Thương Sơn: chưởng đẩy lốc xoáy, đi càng xa càng to; trúng là đóng băng, lốc tan ----
  _tornado(slot, sc) {
    const pl = this.pl, a = pl.aim, sp = 470;
    const rMax = Math.max(40, sc.size * 0.55);
    this.palms.push({ slot, a, t: 0, life: 0.28 });
    this.tornados.push({ slot, sc, x: pl.x + Math.cos(a) * 40, y: pl.y + Math.sin(a) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, life: Math.max(0.5, sc.dur || 1.6), r0: rMax * 0.28, r1: rMax, r: rMax * 0.28 });
  }
  _updateTornados(dt) {
    for (const p of this.palms) p.t += dt;
    this.palms = this.palms.filter(p => p.t < p.life);
    for (const o of this.tornados) {
      o.t += dt; o.x += o.vx * dt; o.y += o.vy * dt;
      const k = Math.min(1, o.t / o.life); o.r = o.r0 + (o.r1 - o.r0) * k; o.k = k;
      let hit = null;
      this._hitTargets(o.x, o.y, o.r, (tg, boss) => { if (!hit) hit = [tg, boss]; });
      if (hit) {
        const [tg, boss] = hit, opt = { noFx: true, freeze: this._effDur("freeze", 1.5), force: true };
        boss ? this._dmgBoss(o.sc, 1, opt) : this._dmgMinion(tg, o.sc, 1, opt);
        this.fx.push({ type: "ring", x: o.x, y: o.y, r: o.r * 1.3, t: 0, life: 0.45, color: "#bfe8ff" });
        o.gone = true;
      }
      if (o.t >= o.life || o.x < AR.x1 || o.x > AR.x2 || o.y < AR.y1 || o.y > AR.y2) o.gone = true;
    }
    this.tornados = this.tornados.filter(o => !o.gone);
  }

  // ---------- Gây sát thương ----------
  _calcHit(sc, mul, isBoss, elem, def, lv) {
    let d = rawSkillDamage(this.st, sc, elem, isBoss) * mul;
    if (this.pl.fx.burn > 0) d *= 1 - this._effVal("burn", 15) / 100;
    const crit = critRoll(this.st, sc);
    if (crit) d *= critMul(this.st, sc);
    d = Math.max(1, Math.round(d * mitigate(def, this.p.level) * rand(0.92, 1.08)));
    return { d, crit };
  }
  // opt: noFx (bỏ hiệu ứng ngẫu nhiên của skill), slowPct/slowDur, stun, freeze, imm (thời gian miễn khống chế), force (bỏ qua miễn)
  _onHitEffects(target, sc, dealt, opt = {}) {
    const st = this.st, fx = target.fx;
    if (st.lifesteal) this.pl.hp = Math.min(this.st.hp, this.pl.hp + dealt * st.lifesteal / 100);
    if (st.manasteal) this.pl.mp = Math.min(this.st.mp, this.pl.mp + dealt * st.manasteal / 100);
    if (st.burnDmg) { fx.burn = this._effDur("burn", 3); fx.burnDps = st.burnDmg / fx.burn; }
    if (st.poisonDmg) { fx.poison = this._effDur("poison", 10); fx.pStacks = Math.min((X.effect.poison || {}).stack || 5, (fx.pStacks || 0) + 1); fx.poisonDps = st.poisonDmg / fx.poison; }
    const cc = (id, chance) => {
      if (!chance || target.ccImm > 0 || Math.random() * 100 >= chance) return;
      fx[id] = this._effDur(id, id === "slow" ? 2 : 1); target.ccImm = (fx[id] || 1) + 2;
      if (id === "slow") target.slowPct = this._effVal("slow", 40);
    };
    cc("slow", st.slowChance); cc("freeze", st.freezeChance); cc("stun", st.stunChance);
    if (!opt.noFx && sc && sc.effect && sc.effectChance && Math.random() * 100 < sc.effectChance) {
      let e = sc.effect === "random" ? pick(["burn", "poison", "slow", "freeze", "stun"]) : sc.effect;
      if (e === "burn") { fx.burn = this._effDur("burn", 3); fx.burnDps = Math.max(fx.burnDps || 0, dealt * 0.3 / fx.burn); }
      else if (e === "poison") { fx.poison = this._effDur("poison", 10); fx.pStacks = Math.min(5, (fx.pStacks || 0) + 1); fx.poisonDps = Math.max(fx.poisonDps || 0, dealt * 0.2 / fx.poison); }
      else if (target.ccImm <= 0) { fx[e] = this._effDur(e, 1); target.ccImm = fx[e] + 2; if (e === "slow") target.slowPct = this._effVal("slow", 40); }
    }
    if (opt.slowPct) { fx.slow = Math.max(fx.slow || 0, opt.slowDur || 0.5); target.slowPct = opt.slowPct; }
    for (const id of ["stun", "freeze"]) {
      if (!opt[id] || (target.ccImm > 0 && !opt.force)) continue;
      fx[id] = Math.max(fx[id] || 0, opt[id]); target.ccImm = opt[id] + (opt.imm ?? 2);
    }
  }
  _dmgBoss(sc, mul, opt) {
    const B = this.B;
    const { d, crit } = this._calcHit(sc, mul, true, B.element, B.def, B.lv);
    this._hurtBoss(d, crit);
    this._onHitEffects(B, sc, d, opt);
  }
  // số sát thương bay lên: gộp các đòn liên tiếp cho đỡ rối và nhẹ máy
  _dmgText(key, x, y, d, crit, color, size) {
    if (!crit) {
      const t = this.texts.find(t => t.key === key && !t.crit && t.t < 0.22);
      if (t) { t.val += d; t.text = fmt(t.val); return; }
    }
    this.texts.push({ key, x, y, t: 0, val: d, text: (crit ? "Chí mạng " : "") + fmt(d), crit, color, size });
    if (this.texts.length > 40) this.texts.splice(0, this.texts.length - 40);
  }
  _hurtBoss(d, crit, color) {
    const B = this.B;
    B.hp -= d; B.flash = 0.08;
    if (this.room) { this.dealt += d; B.hp = Math.max(0, B.hp); }      // mộc nhân: máu chung do chủ phòng giữ
    this._dmgText(color ? "B" + color : "B", B.x + rand(-25, 25), B.y - B.r - 10, d, crit, color || (crit ? "#ffe070" : "#ffffff"), crit ? 26 : 20);
    if (B.hp <= 0 && !this.over && !this.room) { B.hp = 0; this._finish("win"); }
  }
  _dmgMinion(m, sc, mul, opt) {
    const { d, crit } = this._calcHit(sc, mul, false, m.element, m.def, this.B.lv);
    m.hp -= d; m.flash = 0.08;
    this._dmgText(m, m.x, m.y - m.r - 6, d, crit, crit ? "#ffe070" : "#ddd", 15);
    this._onHitEffects(m, sc, d, opt);
    if (m.hp <= 0) this._spark(m.x, m.y, "#fff", 10);
  }

  _hitPlayer(raw, opts = {}) {
    const pl = this.pl, st = this.st;
    if (pl.inv > 0 || pl.holy > 0 || this.over) return false;
    if (Math.random() * 100 < (st.dodge || 0)) { this._note("Né", "#9adfff"); pl.inv = 0.2; return false; }
    let dmg = damageTaken(raw, this.B.element, this.B.lv, st) * rand(0.9, 1.1);
    if (this.B.fx.burn > 0) dmg *= 1 - this._effVal("burn", 15) / 100;
    if (this.vkShield > 0) dmg *= 0.5;
    if (st.manaShield > 0 && pl.mp > 0) {
      const absorb = dmg * st.manaShield / 100, cost = absorb * (S.manaShieldRatio ?? 1);
      const k = Math.min(1, pl.mp / Math.max(1, cost));
      pl.mp -= cost * k; dmg -= absorb * k;
    }
    dmg = Math.max(1, Math.round(dmg));
    pl.hp -= dmg; pl.inv = opts.noInv ? pl.inv : 0.35;
    this.texts.push({ x: pl.x, y: pl.y - 30, t: 0, text: "-" + fmt(dmg), color: "#ff6a5a", size: 20 });
    if (st.reflect) this._hurtBoss(Math.max(1, Math.round(dmg * st.reflect / 100)), false, "#f2c230");
    if (opts.effect !== false && this.B.effect && Math.random() * 100 < this.B.effectChance) this._effectPlayer(this.B.effect);
    if (pl.hp <= 0) this._die();
    return true;
  }

  _effectPlayer(id) {
    const pl = this.pl;
    if (pl.immune > 0 || pl.holy > 0) return;
    if (id === "random") id = pick(["burn", "poison", "slow", "freeze", "stun"]);
    const e = X.effect[id]; if (!e) return;
    const res = Math.min(80, this.st[e.resist] || 0);
    const dur = (e.dur || 1) * (1 - res / 100);
    if (dur <= 0.05) return;
    if (id === "poison") { pl.fx.pStacks = Math.min(e.stack || 5, (pl.fx.pStacks || 0) + 1); pl.fx.poison = dur; }
    else pl.fx[id] = Math.max(pl.fx[id] || 0, dur);
    this._note(e.name, e.color);
  }

  _die() {
    const pl = this.pl;
    const rv = miscByKind("revive").find(m => (m.useIn || []).includes("boss") && (this.p.misc[m.id] || 0) > 0);
    if (rv && !pl.revived) {
      useMisc(this.p, rv.id, 1); this.used[rv.id] = (this.used[rv.id] || 0) + 1;
      pl.revived = true; pl.hp = Math.round(this.st.hp * (rv.value || 50) / 100); pl.inv = 2; pl.fx = {};
      this.texts.push({ x: pl.x, y: pl.y - 96, t: 0, text: rv.name + "!", color: "#ffd23f", size: 22 });
      this.fx.push({ type: "ring", x: pl.x, y: pl.y, r: 90, t: 0, life: 0.6, color: "#ffd23f" });
      return;
    }
    pl.hp = 0; this._finish("lose");
  }

  _potion(key) {
    const pl = this.pl, id = this.p.hot[key], m = X.misc[id];
    if (!m || this.over) return;
    if (!(m.useIn || []).includes("boss")) return this._note("Không dùng được lúc này");
    if ((this.p.misc[id] || 0) <= 0) return this._note("Hết " + m.name);
    if ((pl.pot[id] || 0) > 0) return;
    useMisc(this.p, id, 1); this.used[id] = (this.used[id] || 0) + 1;
    pl.pot[id] = m.cd || 1;
    if (m.kind === "hp") pl.hp = Math.min(this.st.hp, pl.hp + this.st.hp * m.value / 100);
    else if (m.kind === "mp") pl.mp = Math.min(this.st.mp, pl.mp + this.st.mp * m.value / 100);
    else if (m.kind === "cure") { pl.fx = {}; pl.immune = m.value || 3; }
    this._note(m.name, "#9ad89a");
  }

  _finish(result) {
    if (this.over) return;
    this.over = result; this.overT = 0; this.paused = false;
    if (result === "flee") { this.destroy(); this.onEnd(result, this.used); }
  }

  _spark(x, y, color, n = 6) {
    if (this.low || this.fx.length > 220) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(60, 220);
      this.fx.push({ type: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.2, 0.45), color });
    }
  }

  // ---------- Boss bắn ----------
  _shoot(x, y, ang, speed, o = {}) {
    if (this.eb.length > 750) return;
    this.eb.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: o.r || 7,
      mul: o.mul || 1, big: o.big || 0, age: 0, needle: !!o.needle });
  }
  // boss đi lòng vòng quanh người chơi, giữ khoảng cách vừa phải
  _bossRoam() {
    const B = this.B, pl = this.pl;
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU), d = rand(320, 620);
      const x = clamp(pl.x + Math.cos(a) * d, AR.x1 + 80, AR.x2 - 80), y = clamp(pl.y + Math.sin(a) * d * 0.75, AR.y1 + 80, AR.y2 - 80);
      if (dist(x, y, pl.x, pl.y) > 280) { B.tx = x; B.ty = y; return; }
    }
    B.tx = clamp(pl.x + 450, AR.x1 + 80, AR.x2 - 80); B.ty = clamp(pl.y, AR.y1 + 80, AR.y2 - 80);
  }

  _bossAttack() {
    const B = this.B, pl = this.pl;
    const p2 = B.hp < B.maxHp * 0.5;
    const toP = Math.atan2(pl.y - B.y, pl.x - B.x);
    const name = B.patterns[B.pi % B.patterns.length];
    B.pi++;
    const after = (t, fn) => B.sub.push({ t, fn });
    switch (name) {
      case "ring": {
        const n = p2 ? 26 : 18, off = rand(0, TAU);
        for (let i = 0; i < n; i++) this._shoot(B.x, B.y, off + i / n * TAU, p2 ? 250 : 210);
        if (p2) after(0.35, () => { for (let i = 0; i < n; i++) this._shoot(B.x, B.y, off + (i + 0.5) / n * TAU, 210); });
        break;
      }
      case "fan": {
        const vol = p2 ? 4 : 3;
        for (let v = 0; v < vol; v++) after(v * 0.25, () => {
          const a0 = Math.atan2(this.pl.y - B.y, this.pl.x - B.x);
          for (let i = -2; i <= 2; i++) this._shoot(B.x, B.y, a0 + i * 0.2, 320);
        });
        break;
      }
      case "spiral": {
        let a = rand(0, TAU); const steps = p2 ? 40 : 30, arms = p2 ? 3 : 2;
        for (let i = 0; i < steps; i++) after(i * 0.075, () => { for (let k = 0; k < arms; k++) this._shoot(B.x, B.y, a + k * TAU / arms, 200); a += 0.23; });
        break;
      }
      case "wall": {      // bức tường đạn đi về phía người chơi, chừa 1 khe
        const dir = pl.x < B.x ? Math.PI : 0, x0 = B.x + (dir ? -40 : 40);
        const y1 = Math.max(AR.y1 + 12, pl.y - 420), y2 = Math.min(AR.y2 - 12, pl.y + 420);
        const gapY = clamp(pl.y + rand(-160, 160), y1 + 60, y2 - 60), gap = p2 ? 70 : 90;
        for (let y = y1; y < y2; y += 36) { if (Math.abs(y - gapY) < gap) continue; this._shoot(x0, y, dir, p2 ? 200 : 170); }
        break;
      }
      case "big": {
        const n = p2 ? 4 : 3;
        for (let i = 0; i < n; i++) this._shoot(B.x, B.y, toP + (i - (n - 1) / 2) * 0.35, 150, { r: 18, mul: 1.5, big: 1.1 });
        break;
      }
      case "charge": {
        B.charge = 0.6; B.cvx = Math.cos(toP) * 680; B.cvy = Math.sin(toP) * 680;
        this.fx.push({ type: "line", x: B.x, y: B.y, a: toP, len: 420, t: 0, life: 0.3, color: elemColor(B.element) });
        break;
      }
      case "rain": {
        const n = p2 ? 46 : 32;
        for (let i = 0; i < n; i++) after(i * 0.06, () => {
          const x = clamp(this.pl.x + rand(-780, 780), AR.x1 + 10, AR.x2 - 10);
          this._shoot(x, Math.max(AR.y1 + 4, this.pl.y - 440), Math.PI / 2 + rand(-0.12, 0.12), rand(220, 300), { r: 6 });
        });
        break;
      }
      case "summon": {
        const n = Math.min(p2 ? 3 : 2, 6 - this.minions.length);
        for (let i = 0; i < n; i++) {
          const k = this.mobKinds.length ? pick(this.mobKinds) : { name: "Lâu la", element: B.element, img: null };
          const hp = Math.round(B.maxHp * 0.025);
          this.minions.push({ name: k.name, img: k.img, element: k.element || B.element, x: B.x + rand(-60, 60), y: clamp(B.y + rand(-120, 120), AR.y1 + 30, AR.y2 - 30),
            r: 20, hp, maxHp: hp, def: B.def * 0.5, shootT: rand(1, 2.2), flash: 0, fx: {}, ccImm: 0 });
        }
        break;
      }
      case "zone": {
        const n = p2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const x = clamp(pl.x + (i ? rand(-170, 170) : 0), AR.x1 + 40, AR.x2 - 40), y = clamp(pl.y + (i ? rand(-130, 130) : 0), AR.y1 + 40, AR.y2 - 40);
          this.zones.push({ x, y, r: 75, t: 0, warn: 1.0 + i * 0.12, done: false });
        }
        break;
      }
      case "laser": {
        const a = toP, sweep = p2 ? (Math.random() < 0.5 ? -0.7 : 0.7) : 0;
        this.lasers.push({ a, sweep, t: 0, warn: 0.8, fire: p2 ? 1.0 : 0.5, w: 26, hitT: 0 });
        break;
      }
      case "boomerang": {
        const n = p2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = toP + (i - (n - 1) / 2) * 0.45;
          this.booms.push({ x: B.x, y: B.y, a, sp: 520, out: 520, d: 0, back: false, r: 22, rot: 0, hitT: 0 });
        }
        break;
      }
      case "poison_cloud": {
        const n = p2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const x = clamp(pl.x + (i ? rand(-220, 220) : rand(-40, 40)), AR.x1 + 60, AR.x2 - 60);
          const y = clamp(pl.y + (i ? rand(-160, 160) : rand(-40, 40)), AR.y1 + 60, AR.y2 - 60);
          this.clouds.push({ x, y, r: 40, rMax: 95, t: 0, life: 5.5, tick: 0 });
        }
        break;
      }
      case "needle": {
        const n = p2 ? 18 : 12;
        for (let k = 0; k < (p2 ? 2 : 1); k++) {
          after(k * 0.9, () => {
            const a0 = Math.atan2(this.pl.y - B.y, this.pl.x - B.x);
            for (let i = 0; i < n; i++) after(i * 0.05, () => this._shoot(B.x, B.y, a0 + rand(-0.03, 0.03), 560, { r: 4, mul: 0.6, needle: true }));
          });
        }
        break;
      }
      case "drain": {
        B.pull = 2.0;
        after(2.0, () => {
          if (dist(B.x, B.y, this.pl.x, this.pl.y) < 170) {
            const lost = Math.round(this.pl.mp * 0.25); this.pl.mp -= lost;
            if (lost) this._note("Bị hút " + fmt(lost) + " nội lực", "#7fb2f0");
            this._hitPlayer(B.atk * 1.3);
          }
          const n = 16; for (let i = 0; i < n; i++) this._shoot(B.x, B.y, i / n * TAU, 230);
        });
        break;
      }
      default: {
        const n = 16, off = rand(0, TAU);
        for (let i = 0; i < n; i++) this._shoot(B.x, B.y, off + i / n * TAU, 210);
      }
    }
    let t = p2 ? 1.6 : 2.3;
    if (B.fx.slow > 0) t *= 1.4;
    if (B.fx.freeze > 0) t *= 1.5;
    B.atkT = t;
  }

  // ---------- Update ----------
  update(dt) {
    this.time += dt;
    const pl = this.pl, B = this.B, st = this.st;
    this.fx.forEach(f => { f.t += dt; if (f.type === "spark") { f.x += f.vx * dt; f.y += f.vy * dt; } });
    this.fx = this.fx.filter(f => f.t < f.life);
    this.texts.forEach(t => { t.t += dt; t.y -= 40 * dt; });
    this.texts = this.texts.filter(t => t.t < 0.9);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter(b => b.t < b.life);
    if (this.over) {
      this.overT += dt;
      if (this.overT > 1.6 && !this.ended) { this.ended = true; this.destroy(); this.onEnd(this.over, this.used); }
      return;
    }

    // hồi chiêu, hiệu ứng
    for (const k in pl.cd) pl.cd[k] = Math.max(0, pl.cd[k] - dt);
    for (const k in pl.pot) pl.pot[k] = Math.max(0, pl.pot[k] - dt);
    pl.inv = Math.max(0, pl.inv - dt); pl.holy = Math.max(0, pl.holy - dt); pl.immune = Math.max(0, pl.immune - dt);
    this.vkShield = Math.max(0, this.vkShield - dt); this.dashStrikeCd = Math.max(0, this.dashStrikeCd - dt);
    this._tickFx(pl.fx, dt, (dps) => { pl.hp -= dps * dt; if (pl.hp <= 0) this._die(); }, true);
    this._tickFx(B.fx, dt, (dps) => {
      B.hp -= dps * dt;
      if (this.room) { this.dealt += dps * dt; B.hp = Math.max(0, B.hp); }
      else if (B.hp <= 0 && !this.over) { B.hp = 0; this._finish("win"); }
    }, false);
    B.ccImm = Math.max(0, B.ccImm - dt);
    if (this.buff) { this.buff.t -= dt; if (this.buff.t <= 0) { this.buff = null; this._refreshStats(); } }
    const au = this.passive.aura;
    if (au) {          // Mê Tung Nhuyễn Ảnh: 1 = vòng còn trên sân, 2 = đang hồi chiêu
      const s = this.taiji ? 1 : (au.slot && pl.cd[au.slot] > 0 ? 2 : 0);
      if (s !== this.auraState) { this.auraState = s; this._refreshStats(); }
    }
    pl.mp = Math.min(st.mp, pl.mp + st.mpRegenSec * dt);
    if (st.hpRegenSec) pl.hp = Math.min(st.hp, pl.hp + st.hpRegenSec * dt);
    this._mouseWorld();
    pl.aim = Math.atan2(this.mouse.y - pl.y, this.mouse.x - pl.x);
    for (const j of this.later) { j.t -= dt; if (j.t <= 0 && !j.done) { j.done = true; j.fn(); } }
    this.later = this.later.filter(j => !j.done);

    // di chuyển
    if (pl.dashT > 0) {
      pl.dashT -= dt; pl.x += pl.dashVx * dt; pl.y += pl.dashVy * dt;
      if (!this.low && Math.random() < 0.7) this.fx.push({ type: "ghost", x: pl.x, y: pl.y, t: 0, life: 0.25 });
      if (pl.dashT <= 0 && this.strike) {        // Thê Vân Tung tới nơi: đánh và choáng 0,5 giây
        const s = this.strike, tg = s.tg; this.strike = null;
        if (tg.hp > 0 && dist(pl.x, pl.y, tg.x, tg.y) <= s.reach && this.sc.lmb) {
          const opt = { noFx: true, stun: 0.5, imm: 1.5 };
          tg === B ? this._dmgBoss(this.sc.lmb, s.mul, opt) : this._dmgMinion(tg, this.sc.lmb, s.mul, opt);
          this.fx.push({ type: "ring", x: tg.x, y: tg.y, r: tg.r + 26, t: 0, life: 0.3, color: elemColor(this.el) });
        }
      }
    } else if (this._can("move")) {
      const sp = 270 * (1 + (st.mspd || 0) / 100) * this._speedMul();
      if (this.modeB) {
        if (this.mouse.l) this.moveTo = { x: this.mouse.x, y: this.mouse.y };     // giữ chuột: đi theo chuột
        if (this.moveTo) {
          const dx = this.moveTo.x - pl.x, dy = this.moveTo.y - pl.y, d = Math.hypot(dx, dy);
          if (d < 4) this.moveTo = null;
          else { const step = Math.min(d, sp * dt); pl.x += dx / d * step; pl.y += dy / d * step; }
        }
      } else {
        let dx = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
        let dy = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);
        if (dx || dy) { const l = Math.hypot(dx, dy); pl.x += dx / l * sp * dt; pl.y += dy / l * sp * dt; }
      }
    }
    if (B.pull > 0) {    // Hấp Tinh: bị hút về boss
      B.pull -= dt;
      const a = Math.atan2(B.y - pl.y, B.x - pl.x);
      pl.x += Math.cos(a) * 170 * dt; pl.y += Math.sin(a) * 170 * dt;
    }
    pl.x = clamp(pl.x, AR.x1 + pl.r, AR.x2 - pl.r);
    pl.y = clamp(pl.y, AR.y1 + pl.r, AR.y2 - pl.r);
    this._updateCam(dt);

    // đánh thường (chuột trái kiểu A, giữ Q kiểu B)
    const firing = this._firing();
    pl.fireCd -= dt;
    if (firing && pl.fireCd <= 0 && this._can("cast")) pl.fireCd = this._fireLmb();
    this._updateFist(dt, firing);
    if (this.beamCharge) {
      this.beamCharge.t += dt;
      if (this.beamCharge.t >= 0.4) { const bc = this.beamCharge; this.beamCharge = null; this._fireBeams(bc.slot, bc.sc); }
    }

    this._updatePlayerShots(dt);
    this._updateTraps(dt);
    this._updateOrbit(dt);
    this._updateVk(dt);
    this._updateTaiji(dt);
    this._updateTornados(dt);
    this._updateBoss(dt);
    this._updateMinions(dt);
    this._updateHazards(dt);
    this._updateBullets(dt);
    if (this.net) { this._netTick(dt); this._updateGhosts(dt); }
  }

  _tickFx(fx, dt, hurt, isPlayer) {
    for (const k of ["slow", "freeze", "stun"]) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
    if (fx.burn > 0) {
      fx.burn -= dt;
      hurt(isPlayer ? this.B.atk * 0.08 : fx.burnDps || 0);
    }
    if (fx.poison > 0) {
      fx.poison -= dt;
      hurt((isPlayer ? this.B.atk * 0.02 : fx.poisonDps || 0) * (fx.pStacks || 1));
      if (fx.poison <= 0) fx.pStacks = 0;
    }
  }

  _hitTargets(x, y, r, fn) {
    const B = this.B;
    if (dist(x, y, B.x, B.y) < r + B.r) fn(B, true);
    for (const m of this.minions) if (m.hp > 0 && dist(x, y, m.x, m.y) < r + m.r) fn(m, false);
  }

  _updatePlayerShots(dt) {
    const B = this.B;
    for (const b of this.pb) {
      b.age += dt; b.life -= dt;
      if (b.kind === "staff") {
        b.rot += dt * 18;
        const d = dist(b.x, b.y, b.tx, b.ty), step = 720 * dt;
        if (d <= step) {
          b.life = 0;
          this.traps.push({ x: b.tx, y: b.ty, r: Math.max(40, b.sc.size), t: Math.max(0.5, b.sc.dur), tick: 0.5, sc: b.sc, rot: 0 });
          if (this.traps.length > 10) this.traps.splice(0, this.traps.length - 10);     // tối đa 10 côn trên sân
          continue;
        }
        b.x += (b.tx - b.x) / d * step; b.y += (b.ty - b.y) / d * step;
        this._hitTargets(b.x, b.y, b.r, (t, boss) => {
          if (b.hitSet.has(t)) return; b.hitSet.add(t);
          boss ? this._dmgBoss(b.sc, 1) : this._dmgMinion(t, b.sc, 1);
        });
        continue;
      }
      if (this.st.homing) {
        const tgt = B;
        const va = Math.atan2(b.vy, b.vx), ta = Math.atan2(tgt.y - b.y, tgt.x - b.x), d = angDiff(ta, va);
        if (Math.abs(d) < Math.PI / 4) {
          const na = va + clamp(d, -2.5 * dt, 2.5 * dt), sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === "moon") b.r = b.r0 * (1 + 0.3 * Math.min(1, b.age / 0.8));
      if (b.conv) {           // đạn địch biến thành đạn ta
        if (dist(b.x, b.y, B.x, B.y) < b.r + B.r) { b.life = 0; this._hurtBoss(Math.max(1, Math.round(b.dmg)), false, "#c8f"); }
        continue;
      }
      let hit = null;
      if (dist(b.x, b.y, B.x, B.y) < b.r * 0.8 + B.r) hit = B;
      else for (const m of this.minions) if (m.hp > 0 && dist(b.x, b.y, m.x, m.y) < b.r * 0.8 + m.r) { hit = m; break; }
      if (hit) {
        b.life = 0;
        hit === B ? this._dmgBoss(b.sc, b.mul, b.opt) : this._dmgMinion(hit, b.sc, b.mul, b.opt);
        this._spark(b.x, b.y, elemColor(this.el), 5);
      }
    }
    this.pb = this.pb.filter(b => b.life > 0 && b.x > AR.x1 - 60 && b.x < AR.x2 + 60 && b.y > AR.y1 - 60 && b.y < AR.y2 + 60);
  }

  _updateTraps(dt) {
    for (const t of this.traps) {
      t.t -= dt; t.tick -= dt; t.rot += dt * 14;
      if (t.tick <= 0) {
        t.tick += 0.5;
        this._hitTargets(t.x, t.y, t.r, (tg, boss) => boss ? this._dmgBoss(t.sc, 0.4) : this._dmgMinion(tg, t.sc, 0.4));
      }
    }
    this.traps = this.traps.filter(t => t.t > 0);
  }

  _updateOrbit(dt) {
    const o = this.orbit; if (!o) return;
    o.t -= dt; o.ang += dt * 3.2;
    if (o.t <= 0) { this.orbit = null; return; }
    const pl = this.pl;
    for (const k in o.hitT) o.hitT[k] -= dt;
    for (let i = 0; i < o.n; i++) {
      const a = o.ang + i * TAU / o.n, x = pl.x + Math.cos(a) * o.r, y = pl.y + Math.sin(a) * o.r;
      this.eb = this.eb.filter(b => { if (dist(b.x, b.y, x, y) < b.r + 14) { this._spark(b.x, b.y, elemColor(this.el), 2); return false; } return true; });
      this._hitTargets(x, y, 14, (tg, boss) => {
        const key = (boss ? "B" : this.minions.indexOf(tg)) + ":" + i;
        if ((o.hitT[key] || 0) > 0) return; o.hitT[key] = 0.3;
        boss ? this._dmgBoss(o.sc, 1) : this._dmgMinion(tg, o.sc, 1);
      });
    }
  }

  _updateBoss(dt) {
    const B = this.B, pl = this.pl;
    B.flash = Math.max(0, B.flash - dt);
    if (this.room) return;                  // mộc nhân không đi, không đánh
    const stopped = B.fx.freeze > 0 || B.fx.stun > 0;
    const spMul = B.fx.slow > 0 ? 1 - clamp(B.slowPct ?? 40, 0, 90) / 100 : 1;
    if (B.charge > 0 && !stopped) {
      B.charge -= dt; B.x += B.cvx * dt * spMul; B.y += B.cvy * dt * spMul;
      if (B.charge <= 0) { B.charge = 0; this._bossRoam(); }
    } else if (!stopped) {
      B.moveT -= dt;
      if (B.moveT <= 0) { B.moveT = rand(1.8, 3); this._bossRoam(); }
      const dx = B.tx - B.x, dy = B.ty - B.y, d = Math.hypot(dx, dy);
      if (d > 2) { const sp = Math.min(d, 150 * dt * spMul); B.x += dx / d * sp; B.y += dy / d * sp; }
    }
    B.x = clamp(B.x, AR.x1 + B.r, AR.x2 - B.r);
    B.y = clamp(B.y, AR.y1 + B.r, AR.y2 - B.r);
    if (dist(B.x, B.y, pl.x, pl.y) < B.r + pl.hit) this._hitPlayer(B.atk * 1.2);
    if (B.fx.stun > 0) return;
    B.atkT -= dt * (B.fx.freeze > 0 ? 0.5 : 1);
    if (B.atkT <= 0) this._bossAttack();
    for (const s of B.sub) { s.t -= dt; if (s.t <= 0 && !s.done) { s.done = true; s.fn(); } }
    B.sub = B.sub.filter(s => !s.done);
  }

  _updateMinions(dt) {
    const pl = this.pl;
    for (const m of this.minions) {
      if (m.hp <= 0) continue;
      m.flash = Math.max(0, m.flash - dt);
      this._tickFx(m.fx, dt, dps => { m.hp -= dps * dt; }, false);
      m.ccImm = Math.max(0, m.ccImm - dt);
      if (!(m.fx.freeze > 0 || m.fx.stun > 0)) {
        const a = Math.atan2(pl.y - m.y, pl.x - m.x), d = dist(m.x, m.y, pl.x, pl.y);
        const sm = m.fx.slow > 0 ? 1 - clamp(m.slowPct ?? 40, 0, 90) / 100 : 1;
        if (d > 120) { m.x += Math.cos(a) * 95 * sm * dt; m.y += Math.sin(a) * 95 * sm * dt; }
        m.shootT -= dt;
        if (m.shootT <= 0) { m.shootT = rand(1.6, 2.6); this._shoot(m.x, m.y, a, 240, { r: 6, mul: 0.5 }); }
      }
      if (dist(m.x, m.y, pl.x, pl.y) < m.r + pl.hit) this._hitPlayer(this.B.atk * 0.6, { effect: false });
    }
    this.minions = this.minions.filter(m => m.hp > 0);
  }

  _updateHazards(dt) {
    const pl = this.pl, B = this.B;
    for (const z of this.zones) {
      z.t += dt;
      if (!z.done && z.t >= z.warn) {
        z.done = true;
        this.fx.push({ type: "ring", x: z.x, y: z.y, r: z.r, t: 0, life: 0.35, color: elemColor(B.element) });
        if (dist(z.x, z.y, pl.x, pl.y) < z.r) this._hitPlayer(B.atk * 1.4);
      }
    }
    this.zones = this.zones.filter(z => !z.done);
    for (const L of this.lasers) {
      L.t += dt;
      if (L.t > L.warn) {
        const k = Math.min(1, (L.t - L.warn) / L.fire);
        const a = L.a + L.sweep * k;
        L.cur = a;
        L.hitT -= dt;
        // khoảng cách từ người chơi tới tia
        const dx = pl.x - B.x, dy = pl.y - B.y;
        const along = dx * Math.cos(a) + dy * Math.sin(a);
        const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
        if (along > 0 && perp < L.w / 2 + pl.hit && L.hitT <= 0) { if (this._hitPlayer(B.atk * 1.3)) L.hitT = 0.4; }
      } else L.cur = L.a;
    }
    this.lasers = this.lasers.filter(L => L.t < L.warn + L.fire);
    for (const o of this.booms) {
      o.rot += dt * 14; o.hitT -= dt;
      if (!o.back) {
        o.x += Math.cos(o.a) * o.sp * dt; o.y += Math.sin(o.a) * o.sp * dt; o.d += o.sp * dt;
        if (o.d >= o.out || o.x < AR.x1 || o.x > AR.x2 || o.y < AR.y1 || o.y > AR.y2) o.back = true;
      } else {
        const a = Math.atan2(B.y - o.y, B.x - o.x);
        o.x += Math.cos(a) * o.sp * 1.1 * dt; o.y += Math.sin(a) * o.sp * 1.1 * dt;
        if (dist(o.x, o.y, B.x, B.y) < B.r) o.gone = true;
      }
      if (o.hitT <= 0 && dist(o.x, o.y, pl.x, pl.y) < o.r + pl.hit) { if (this._hitPlayer(B.atk * 1.2)) o.hitT = 0.5; }
    }
    this.booms = this.booms.filter(o => !o.gone);
    for (const c of this.clouds) {
      c.t += dt; c.r = Math.min(c.rMax, c.r + 40 * dt); c.tick -= dt;
      if (c.t > 0.6 && c.tick <= 0 && dist(c.x, c.y, pl.x, pl.y) < c.r) {
        c.tick = 0.5;
        if (this._hitPlayer(B.atk * 0.25, { noInv: true, effect: false })) this._effectPlayer("poison");
      }
    }
    this.clouds = this.clouds.filter(c => c.t < c.life);
  }

  _updateBullets(dt) {
    const pl = this.pl, nb = [];
    for (const b of this.eb) {
      b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.big && b.age > b.big) {
        for (let i = 0; i < 8; i++) nb.push({ x: b.x, y: b.y, vx: Math.cos(i / 8 * TAU) * 190, vy: Math.sin(i / 8 * TAU) * 190, r: 7, mul: 1, big: 0, age: 0 });
        continue;
      }
      const d = dist(b.x, b.y, pl.x, pl.y);
      if (d < b.r + pl.hit) {
        if (pl.inv <= 0 && pl.holy <= 0 && Math.random() * 100 < (this.st.bulletConvert || 0)) {
          const a = Math.atan2(this.B.y - b.y, this.B.x - b.x);
          this.pb.push({ kind: "ball", conv: true, x: b.x, y: b.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 7, r0: 7, dmg: this.B.atk * b.mul * 0.8, life: 2, age: 0 });
          this._note("Phản đạn", "#c8f");
          continue;
        }
        if (this._hitPlayer(this.B.atk * b.mul) || pl.holy > 0 || pl.inv > 0.3) continue;
      }
      if (b.x < AR.x1 - 20 || b.x > AR.x2 + 20 || b.y < AR.y1 - 20 || b.y > AR.y2 + 20) continue;
      nb.push(b);
    }
    this.eb = nb;
  }

  // ---------- Vẽ ----------
  draw() {
    const c = this.c, pl = this.pl, B = this.B, cam = this.cam;
    this._mouseWorld();
    c.fillStyle = "#16181e"; c.fillRect(0, 0, W, H);
    // ===== phần sân (tọa độ thế giới) =====
    c.save();
    c.beginPath(); c.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); c.clip();
    c.translate(VIEW.x, VIEW.y); c.scale(ZOOM, ZOOM); c.translate(-cam.x, -cam.y);
    if (this.bgCv) {
      const sx = clamp(cam.x - AR.x1, 0, this.bgCv.width), sy = clamp(cam.y - AR.y1, 0, this.bgCv.height);
      const sw = Math.min(VW + 2, this.bgCv.width - sx), sh = Math.min(VH + 2, this.bgCv.height - sy);
      if (sw > 0 && sh > 0) c.drawImage(this.bgCv, sx, sy, sw, sh, AR.x1 + sx, AR.y1 + sy, sw, sh);
    }

    const bc = elemColor(B.element);
    // mây độc, vùng nổ (dưới cùng)
    for (const cl of this.clouds) {
      const a = cl.t < 0.6 ? 0.15 : 0.32 * Math.min(1, (cl.life - cl.t) / 0.6);
      c.fillStyle = `rgba(110,200,70,${a})`; c.beginPath(); c.arc(cl.x, cl.y, cl.r, 0, TAU); c.fill();
    }
    for (const z of this.zones) {
      const k = z.t / z.warn;
      c.strokeStyle = bc; c.lineWidth = 2; c.globalAlpha = 0.8;
      c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.stroke();
      c.fillStyle = bc; c.globalAlpha = 0.18 + 0.25 * k;
      c.beginPath(); c.arc(z.x, z.y, z.r * k, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
    for (const t of this.traps) this._drawStaff(c, t.x, t.y, t.rot, 0.9, t.r);

    for (const f of this.fx) if (f.type === "cone") {
      const k = 1 - f.t / f.life, L = f.len * (0.6 + 0.4 * Math.min(1, f.t / 0.12));
      c.fillStyle = `rgba(242,194,48,${0.22 * k})`; c.strokeStyle = `rgba(255,230,120,${0.6 * k})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(f.x, f.y);
      c.lineTo(f.x + Math.cos(f.ang - f.half) * L, f.y + Math.sin(f.ang - f.half) * L);
      c.lineTo(f.x + Math.cos(f.ang + f.half) * L, f.y + Math.sin(f.ang + f.half) * L);
      c.closePath(); c.fill(); c.stroke();
      const p = Math.min(1, f.t / f.life);     // Sư Tử Hống: hình sóng âm bật ra trước mặt
      this._drawFx(c, f.slot, "A", f.x + Math.cos(f.ang) * (30 + p * f.len * 0.6), f.y + Math.sin(f.ang) * (30 + p * f.len * 0.6), f.ang, 50 + p * 120, 1 - p * 0.6);
    } else if (f.type === "ring") {
      const k = f.t / f.life;
      c.strokeStyle = f.color; c.globalAlpha = 1 - k; c.lineWidth = 6;
      c.beginPath(); c.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, TAU); c.stroke(); c.globalAlpha = 1;
    } else if (f.type === "line") {
      c.strokeStyle = f.color; c.globalAlpha = 0.5 * (1 - f.t / f.life); c.lineWidth = 8;
      c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len); c.stroke(); c.globalAlpha = 1;
    } else if (f.type === "ghost") {
      c.globalAlpha = 0.25 * (1 - f.t / f.life); c.fillStyle = "#e8892c";
      c.beginPath(); c.arc(f.x, f.y, pl.r, 0, TAU); c.fill(); c.globalAlpha = 1;
    }

    // tia laser
    for (const L of this.lasers) {
      const a = L.cur ?? L.a, len = 2400;
      if (L.t <= L.warn) {
        c.strokeStyle = bc; c.globalAlpha = 0.35 + 0.3 * Math.sin(this.time * 30); c.lineWidth = 2; c.setLineDash([10, 8]);
      } else { c.strokeStyle = bc; c.globalAlpha = 0.85; c.lineWidth = L.w; c.setLineDash([]); }
      c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(B.x + Math.cos(a) * len, B.y + Math.sin(a) * len); c.stroke();
      if (L.t > L.warn) { c.strokeStyle = "#fff"; c.lineWidth = L.w * 0.3; c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(B.x + Math.cos(a) * len, B.y + Math.sin(a) * len); c.stroke(); }
      c.setLineDash([]); c.globalAlpha = 1;
    }
    if (B.pull > 0) {
      c.strokeStyle = "rgba(160,120,255,0.6)"; c.lineWidth = 3; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(pl.x, pl.y); c.stroke(); c.setLineDash([]);
    }
    if (this.modeB && this.moveTo) {        // điểm đến kiểu B
      c.strokeStyle = "rgba(140,220,140,0.7)"; c.lineWidth = 2;
      c.beginPath(); c.arc(this.moveTo.x, this.moveTo.y, 10 + 3 * Math.sin(this.time * 10), 0, TAU); c.stroke();
    }

    for (const m of this.minions) this._drawMinion(c, m);
    this._drawBoss(c, B);
    if (this.net) this._drawRemotes(c);
    this._drawPlayer(c, pl);
    this._drawSkills(c);

    // đạn người chơi
    const pc = elemColor(this.el);
    for (const b of this.pb) {
      if (!this._inView(b.x, b.y, 80)) continue;
      if (b.kind === "staff") { this._drawStaff(c, b.x, b.y, b.rot, 0.8); continue; }
      const a = Math.atan2(b.vy, b.vx);
      if (b.kind === "moon") {
        if (this._drawFx(c, b.slot, "A", b.x, b.y, a, b.r * 2.3)) continue;
        c.lineCap = "round"; c.strokeStyle = pc; c.lineWidth = Math.max(4, b.r * 0.32);
        c.beginPath(); c.arc(b.x, b.y, b.r, a - 1.15, a + 1.15); c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = Math.max(1.5, b.r * 0.1);
        c.beginPath(); c.arc(b.x, b.y, b.r * 1.02, a - 0.8, a + 0.8); c.stroke();
        continue;
      }
      if (b.kind === "img" && this._drawFx(c, b.slot, b.key, b.x, b.y, a, clamp(b.sc.size * 4, 30, 64) * b.size)) continue;
      c.fillStyle = b.conv ? "#c8f" : pc; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
    }
    if (this.net) this._drawGhosts(c);
    // bánh xe
    for (const o of this.booms) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.rot);
      c.strokeStyle = bc; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.stroke();
      c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i * TAU / 4) * o.r, Math.sin(i * TAU / 4) * o.r); c.stroke(); }
      c.restore();
    }
    // đạn boss
    for (const b of this.eb) {
      if (!this._inView(b.x, b.y, 30)) continue;
      if (b.needle) {
        const a = Math.atan2(b.vy, b.vx);
        c.strokeStyle = "#f4f4f4"; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(b.x - Math.cos(a) * 12, b.y - Math.sin(a) * 12); c.lineTo(b.x + Math.cos(a) * 6, b.y + Math.sin(a) * 6); c.stroke();
        continue;
      }
      c.fillStyle = bc; c.strokeStyle = "#000"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); if (!this.low) c.stroke();
      c.fillStyle = "rgba(255,255,255,0.8)"; c.beginPath(); c.arc(b.x, b.y, b.r * 0.45, 0, TAU); c.fill();
      if (b.big) { c.strokeStyle = bc; c.globalAlpha = 0.5; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r + 5, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    }
    for (const f of this.fx) if (f.type === "spark") {
      c.globalAlpha = 1 - f.t / f.life; c.fillStyle = f.color; c.fillRect(f.x - 2, f.y - 2, 4, 4); c.globalAlpha = 1;
    }
    c.textAlign = "center";
    for (const t of this.texts) {
      c.globalAlpha = 1 - t.t / 0.9; c.font = `600 ${t.size}px sans-serif`;
      if (!this.low) { c.lineWidth = 4; c.strokeStyle = "#000"; c.strokeText(t.text, t.x, t.y); }
      c.fillStyle = t.color; c.fillText(t.text, t.x, t.y); c.globalAlpha = 1;
    }
    c.restore();
    // ===== màn hình (HUD) =====
    this._drawBossArrow(c);
    this._drawHud(c);
    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,0.65)"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#fff"; c.font = "600 40px sans-serif"; c.textAlign = "center";
      c.fillText("Tạm dừng", W / 2, H / 2 - 60);
      c.font = "22px sans-serif"; c.fillStyle = "#ccc";
      c.fillText(this.room ? "Esc: tiếp tục   ·   F: rời phòng" : "Esc: tiếp tục   ·   F: bỏ chạy (không nhận thưởng)", W / 2, H / 2 - 15);
      c.font = "18px sans-serif"; c.fillStyle = "#f2c230";
      c.fillText(`C: điều khiển kiểu ${this.modeB ? "B (chuột để đi)" : "A (WASD)"}   ·   G: đồ họa ${this.low ? "Thấp" : "Cao"}   ·   P: FPS ${this.p.showFps ? "bật" : "tắt"}`, W / 2, H / 2 + 25);
      c.font = "15px sans-serif"; c.fillStyle = "#999";
      c.fillText(this.modeB ? "Kiểu B: chuột trái bấm để đi, giữ để đi theo chuột · giữ Q đánh · W chiêu phụ · E buff · Space lướt về phía chuột"
        : "Kiểu A: WASD đi · giữ chuột trái đánh · chuột phải chiêu phụ · Q buff · Space lướt", W / 2, H / 2 + 58);
    }
    if (this.over && this.over !== "flee") {
      c.fillStyle = `rgba(0,0,0,${Math.min(0.6, this.overT * 0.6)})`; c.fillRect(0, 0, W, H);
      c.font = "600 56px sans-serif"; c.textAlign = "center";
      c.fillStyle = this.over === "win" ? "#f2c230" : "#ff6a5a";
      c.fillText(this.over === "win" ? "Chiến thắng!" : "Thất bại...", W / 2, H / 2);
    }
  }

  // các chiêu riêng của phái (vẽ trong sân)
  _drawSkills(c) {
    const pl = this.pl, pc = elemColor(this.el);
    // La Hán Côn Trận
    if (this.orbit) {
      const o = this.orbit;
      for (let i = 0; i < o.n; i++) {
        const a = o.ang + i * TAU / o.n;
        this._drawStaff(c, pl.x + Math.cos(a) * o.r, pl.y + Math.sin(a) * o.r, a + Math.PI / 2, 0.8);
      }
    }
    // nắm đấm Trường Quyền
    if (this.fist) {
      const f = this.fist;
      if (!this.low) { c.strokeStyle = "rgba(255,255,255,0.12)"; c.setLineDash([4, 6]); c.lineWidth = 1.5; c.beginPath(); c.arc(pl.x, pl.y, f.r, 0, TAU); c.stroke(); c.setLineDash([]); }
      if (!this._drawFx(c, "lmb", "A", f.x, f.y, f.ang, 34)) {
        c.fillStyle = pc; c.strokeStyle = "#fff"; c.lineWidth = 2;
        c.beginPath(); c.arc(f.x, f.y, 12, 0, TAU); c.fill(); c.stroke();
      }
    }
    // Vạn Kiếm Quy Tông
    if (this.vk) for (const s of this.vk.swords) {
      if (s.st === "done") continue;
      const back = s.st === "back", a = back ? (s.ba ?? s.a + Math.PI) : s.a + (s.st === "hold" ? Math.sin(this.time * 20) * 0.08 : 0);
      if (!this._drawFx(c, this.vk.slot, back ? "B" : "A", s.x, s.y, a, 62)) {
        c.save(); c.translate(s.x, s.y); c.rotate(a);
        c.strokeStyle = back ? "#9fe8ff" : pc; c.lineWidth = 4; c.beginPath(); c.moveTo(-24, 0); c.lineTo(24, 0); c.stroke();
        c.restore();
      }
    }
    // Thiên Địa Vô Cực
    if (this.taiji) {
      const T = this.taiji;
      if (!this._drawFx(c, T.slot, "A", T.x, T.y, T.rot, T.r * 2.3)) {
        c.save(); c.translate(T.x, T.y); c.rotate(T.rot);
        c.fillStyle = "#eee"; c.beginPath(); c.arc(0, 0, T.r, 0, TAU); c.fill();
        c.fillStyle = "#333"; c.beginPath(); c.arc(0, 0, T.r, -Math.PI / 2, Math.PI / 2); c.arc(0, T.r / 2, T.r / 2, Math.PI / 2, -Math.PI / 2, true); c.arc(0, -T.r / 2, T.r / 2, Math.PI / 2, -Math.PI / 2); c.fill();
        c.restore();
      }
    }
    // Lục Mạch Thần Kiếm: lúc gồng (nét đứt mảnh + hình gồng), lúc bắn (tia + hình kiếm khí bay theo)
    if (this.beamCharge) {
      const bc = this.beamCharge, angs = this._beamAngles(bc.sc);
      c.strokeStyle = "rgba(150,215,255,0.55)"; c.lineWidth = 1; c.setLineDash([4, 8]);
      for (const a of angs) { c.beginPath(); c.moveTo(pl.x, pl.y); c.lineTo(pl.x + Math.cos(a) * 1900, pl.y + Math.sin(a) * 1900); c.stroke(); }
      c.setLineDash([]);
      const p = 0.85 + 0.15 * Math.sin(this.time * 40);
      if (!this._drawFx(c, bc.slot, "B", pl.x + Math.cos(pl.aim) * 40, pl.y + Math.sin(pl.aim) * 40, pl.aim, 70 * p)) {
        c.fillStyle = "rgba(0,170,255,0.4)"; c.beginPath(); c.arc(pl.x + Math.cos(pl.aim) * 26, pl.y + Math.sin(pl.aim) * 26, 8 + bc.t * 30, 0, TAU); c.fill();
      }
    }
    for (const bm of this.beams) {
      const k = bm.t / bm.life;
      c.strokeStyle = `rgba(140,215,255,${0.85 * (1 - k * k)})`; c.lineWidth = 5;
      for (const a of bm.angs) {
        c.beginPath(); c.moveTo(bm.x, bm.y); c.lineTo(bm.x + Math.cos(a) * bm.L, bm.y + Math.sin(a) * bm.L); c.stroke();
        const d = Math.min(1, k * 1.25) * bm.L;
        this._drawFx(c, bm.slot, "A", bm.x + Math.cos(a) * d, bm.y + Math.sin(a) * d, a, 34);
      }
    }
    // Tuyết Mãn Thương Sơn: bàn tay đẩy, lốc xoáy to dần (khung 1 → 4)
    for (const p of this.palms) {
      const k = p.t / p.life;
      this._drawFx(c, p.slot, "A", pl.x + Math.cos(p.a) * (26 + k * 18), pl.y + Math.sin(p.a) * (26 + k * 18), p.a, 34, 1 - k);
    }
    for (const o of this.tornados) {
      const f = Math.min(3, Math.floor((o.k || 0) * 4));
      if (!this._drawFx(c, o.slot, "F", o.x, o.y - o.r * 0.25, 0, o.r * 2.6, 1, f)) {
        c.strokeStyle = "#bfe6ff"; c.lineWidth = 3; c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke();
      }
      if (!this.low) { c.strokeStyle = "rgba(150,215,255,0.22)"; c.setLineDash([3, 5]); c.lineWidth = 1.5; c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke(); c.setLineDash([]); }
    }
  }

  _drawStaff(c, x, y, rot, scale = 1, area) {
    if (area) {
      c.fillStyle = "rgba(242,194,48,0.10)"; c.strokeStyle = "rgba(242,194,48,0.35)"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, area, 0, TAU); c.fill(); c.stroke();
    }
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(scale, scale);
    c.strokeStyle = "#6b4a2a"; c.lineWidth = 6; c.lineCap = "round";
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(26, 0); c.stroke();
    c.strokeStyle = "#f2c230"; c.lineWidth = 7;
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(-20, 0); c.moveTo(20, 0); c.lineTo(26, 0); c.stroke();
    c.restore();
  }

  _drawPlayer(c, pl) {
    const blink = pl.inv > 0 && Math.floor(this.time * 20) % 2 === 0;
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(pl.x, pl.y + 26, 18, 6, 0, 0, TAU); c.fill();
    if (blink) c.globalAlpha = 0.45;
    if (ready(this.imgPl)) {
      const h = 96, w = h * this.imgPl.naturalWidth / this.imgPl.naturalHeight;
      c.save(); c.translate(pl.x, pl.y + 30);
      if (Math.cos(pl.aim) > 0) c.scale(-1, 1);
      c.drawImage(this.imgPl, -w / 2, -h, w, h);
      c.restore();
    } else {
      c.fillStyle = (X.sect[this.p.sect] || {}).robe || "#e8892c"; c.strokeStyle = "#5a3a1a"; c.lineWidth = 2.5;
      c.beginPath(); c.arc(pl.x, pl.y, pl.r, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = "#f2cfa4"; c.beginPath(); c.arc(pl.x, pl.y - 18, 9, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    const f = pl.fx;
    if (pl.holy > 0) {
      const k = 0.55 + 0.25 * Math.sin(this.time * 12);
      c.strokeStyle = `rgba(255,225,120,${k})`; c.fillStyle = "rgba(255,225,120,0.14)"; c.lineWidth = 3;
      c.beginPath(); c.arc(pl.x, pl.y - 10, 44, 0, TAU); c.fill(); c.stroke();
    }
    if (this.buff) { c.strokeStyle = "rgba(242,194,48,0.7)"; c.lineWidth = 3; c.beginPath(); c.arc(pl.x, pl.y - 10, 48, 0, TAU); c.stroke(); }
    if (this.vkShield > 0) { c.strokeStyle = "rgba(160,230,255,0.6)"; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); c.arc(pl.x, pl.y - 10, 52, 0, TAU); c.stroke(); c.setLineDash([]); }
    if (f.freeze > 0) { c.fillStyle = "rgba(190,232,255,0.35)"; c.fillRect(pl.x - 24, pl.y - 64, 48, 92); }
    if (f.stun > 0) { c.fillStyle = "#f2e070"; for (let i = 0; i < 3; i++) { const a = this.time * 6 + i * TAU / 3; c.beginPath(); c.arc(pl.x + Math.cos(a) * 16, pl.y - 70 + Math.sin(a) * 5, 3.5, 0, TAU); c.fill(); } }
    // tên + cấp trên đầu
    c.textAlign = "center"; c.font = "600 15px sans-serif";
    const tag = `${this.p.name} Lev.${this.p.level}`;
    if (!this.low) { c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,0.85)"; c.strokeText(tag, pl.x, pl.y - 74); }
    c.fillStyle = "#fff"; c.fillText(tag, pl.x, pl.y - 74);
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(this.mouse.x, this.mouse.y, 9, 0, TAU); c.stroke();
    c.fillStyle = "#ff4040"; c.beginPath(); c.arc(pl.x, pl.y, 3, 0, TAU); c.fill();
  }

  _drawMinion(c, m) {
    if (ready(m.img)) c.drawImage(m.img, m.x - 26, m.y - 26, 52, 52);
    else { c.fillStyle = m.flash > 0 ? "#fff" : elemColor(m.element); c.beginPath(); c.arc(m.x, m.y, m.r, 0, TAU); c.fill(); }
    if (m.fx.freeze > 0) { c.fillStyle = "rgba(190,232,255,0.35)"; c.beginPath(); c.arc(m.x, m.y, m.r + 4, 0, TAU); c.fill(); }
    c.fillStyle = "#3d1d1d"; c.fillRect(m.x - 22, m.y - m.r - 10, 44, 5);
    c.fillStyle = "#d94040"; c.fillRect(m.x - 22, m.y - m.r - 10, 44 * clamp(m.hp / m.maxHp, 0, 1), 5);
  }

  _drawBoss(c, B) {
    if (this.room && !ready(this.imgBoss)) return this._drawDummy(c, B);
    const col = elemColor(B.element);
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(B.x, B.y + B.r - 2, B.r, 9, 0, 0, TAU); c.fill();
    if (B.hp < B.maxHp * 0.5 && !this.low) {
      c.strokeStyle = col; c.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 6); c.lineWidth = 6;
      c.beginPath(); c.arc(B.x, B.y, B.r + 12, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    if (ready(this.imgBoss)) {
      const s = 116;
      c.drawImage(this.imgBoss, B.x - s / 2, B.y - s / 2 - 6, s, s);
      if (B.flash > 0) {           // chớp trắng bằng bóng vẽ sẵn
        if (!this.bossWhite) this._buildBossWhite();
        if (this.bossWhite) { c.globalAlpha = 0.55; c.drawImage(this.bossWhite, B.x - s / 2, B.y - s / 2 - 6, s, s); c.globalAlpha = 1; }
      }
    } else {
      c.fillStyle = B.flash > 0 ? "#ffffff" : col; c.strokeStyle = "#111"; c.lineWidth = 3;
      c.beginPath(); c.arc(B.x, B.y, B.r, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = "#1a1a1a";
      c.beginPath(); c.ellipse(B.x - 13, B.y - 6, 7, 9, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(B.x + 13, B.y - 6, 7, 9, 0, 0, TAU); c.fill();
    }
    if (B.fx.freeze > 0) { c.fillStyle = "rgba(190,232,255,0.3)"; c.beginPath(); c.arc(B.x, B.y, B.r + 6, 0, TAU); c.fill(); }
    if (B.fx.stun > 0) { c.fillStyle = "#f2e070"; for (let i = 0; i < 3; i++) { const a = this.time * 6 + i * TAU / 3; c.beginPath(); c.arc(B.x + Math.cos(a) * 22, B.y - B.r - 14 + Math.sin(a) * 6, 4, 0, TAU); c.fill(); } }
  }

  // mũi tên chỉ boss khi boss ra ngoài khung nhìn
  _drawBossArrow(c) {
    const B = this.B;
    if (this._inView(B.x, B.y, -10)) return;
    const sx = VIEW.x + (B.x - this.cam.x) * ZOOM, sy = VIEW.y + (B.y - this.cam.y) * ZOOM;
    const cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h / 2, a = Math.atan2(sy - cy, sx - cx);
    const px = clamp(sx, VIEW.x + 30, VIEW.x + VIEW.w - 30), py = clamp(sy, VIEW.y + 30, VIEW.y + VIEW.h - 30);
    c.save(); c.translate(px, py); c.rotate(a);
    c.fillStyle = elemColor(B.element); c.beginPath(); c.moveTo(18, 0); c.lineTo(-8, -11); c.lineTo(-8, 11); c.closePath(); c.fill();
    c.restore();
  }

  _bar(c, x, y, w, h, v, max, col, bg) {
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    c.fillStyle = col; c.fillRect(x, y, w * clamp(v / max, 0, 1), h);
    c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 1; c.strokeRect(x, y, w, h);
  }

  _fxTags(fx) {
    const out = [];
    if (fx.burn > 0) out.push(["Bỏng", "#ff6a3c"]);
    if (fx.poison > 0) out.push([`Độc ×${fx.pStacks || 1}`, "#7ad04a"]);
    if (fx.slow > 0) out.push(["Chậm", "#7fb2f0"]);
    if (fx.freeze > 0) out.push(["Đóng băng", "#bfe8ff"]);
    if (fx.stun > 0) out.push(["Choáng", "#f2e070"]);
    return out;
  }

  _drawHud(c) {
    const pl = this.pl, B = this.B, p = this.p, st = this.st;
    c.textAlign = "left"; c.font = "600 18px sans-serif"; c.fillStyle = "#f2c230";
    c.fillText(`${p.name} · Lv${p.level} · ${(X.sect[p.sect] || {}).name || ""}`, 30, 26);
    this._bar(c, 30, 36, 300, 16, pl.hp, st.hp, "#d94040", "#3d1d1d");
    this._bar(c, 30, 57, 300, 11, pl.mp, st.mp, "#3f86e0", "#1d2a3d");
    c.font = "13px sans-serif"; c.fillStyle = "#fff";
    c.fillText(`${fmt(pl.hp)} / ${fmt(st.hp)}`, 36, 49);
    let tx = 340;
    const tags = this._fxTags(pl.fx);
    if (pl.holy > 0) tags.unshift(["Bất tử", "#ffe178"]);
    if (this.buff) tags.unshift([(this.sk.q && this.sk.q.s.name) || "Buff", "#f2c230"]);
    if (this.vkShield > 0) tags.unshift(["Kiếm hộ thể −50%", "#a0e6ff"]);
    if (this.passive.aura && this.auraState === 1) tags.unshift([this.passive.aura.s.name, "#d8a050"]);
    if (this.passive.aura && this.auraState === 2) tags.unshift(["Hút nội lực", "#7fb2f0"]);
    if (pl.immune > 0) tags.push(["Miễn nhiễm", "#9ad89a"]);
    c.font = "13px sans-serif";
    for (const [t, col] of tags) { c.fillStyle = col; c.fillText(t, tx, 49); tx += c.measureText(t).width + 12; }

    c.textAlign = "center"; c.fillStyle = "#cfcfcf"; c.font = "16px sans-serif";
    const where = this.kind === "gold" ? "Boss Hoàng Kim" : this.room ? `Phòng thử · ${this.net ? Object.keys(this.net.players).length : 1}/5 người` : (this.map ? this.map.name : "");
    c.fillText(`${where} · ${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, "0")}`, W / 2, 30);
    if (this.bossBonus > 1) { c.fillStyle = "#6fd06f"; c.fillText(`Khắc chế boss: +${S.counterBonus ?? 15}% sát thương`, W / 2, 54); }
    else if (this.takenBonus > 1) { c.fillStyle = "#ff8a70"; c.fillText(`Bị boss khắc: nhận thêm ${S.counterBonus ?? 15}% sát thương`, W / 2, 54); }

    c.textAlign = "right"; c.font = "600 18px sans-serif"; c.fillStyle = elemColor(B.element);
    c.fillText(this.room ? `${B.name} · máu chung cả phòng` : `${B.name} Lv${B.lv} (${elemName(B.element)})`, 1250, 26);
    this._bar(c, 850, 36, 400, 16, B.hp, B.maxHp, "#d94040", "#3d1d1d");
    c.font = "13px sans-serif"; c.fillStyle = "#fff";
    c.fillText(`${fmt(B.hp)} / ${fmt(B.maxHp)}`, 1244, 49);
    let bx = 1250; c.textAlign = "right";
    for (const [t, col] of this._fxTags(B.fx).reverse()) { c.fillStyle = col; c.fillText(t, bx, 68); bx -= c.measureText(t).width + 12; }
    if (p.showFps) {
      c.textAlign = "left"; c.font = "600 14px sans-serif";
      c.fillStyle = this.fps >= 50 ? "#6fd06f" : this.fps >= 30 ? "#ffd23f" : "#ff7b7b";
      c.fillText(`${this.fps} FPS`, VIEW.x + 12, VIEW.y + 20);
    }

    // thanh kỹ năng
    const B2 = this.modeB, slots = [];
    const keysOf = B2 ? [["lmb", "Giữ Q"], ["rmb", "W"], ["q", "E"]] : [["lmb", "Chuột trái"], ["rmb", "Chuột phải"], ["q", "Q"]];
    for (const [slot, key] of keysOf) {
      const k = this.sk[slot], sc = this.sc[slot];
      if (!k) { slots.push({ key, name: "—", off: "Không có" }); continue; }
      const m = k.s.mech;
      const active = (m === "boomerang" && this.vk) ? (B2 ? "W: gọi kiếm về" : "Chuột phải: gọi về")
        : (m === "bounce" && this.taiji) ? "Đang bay" : (m === "beam" && this.beamCharge) ? "Đang gồng" : "";
      slots.push({ key, name: k.s.name, off: !k.learned ? "Chưa học" : !k.ok ? "Cần " + WEAPON_NAMES[k.s.weapon] : "", active,
        cd: slot === "lmb" ? 0 : pl.cd[slot], max: sc ? sc.cd || 1 : 1, mp: sc ? sc.mp : 0, img: k.s.img });
    }
    if (B2) slots.push({ key: "R", name: "Sắp có", off: "", empty: true });
    slots.push({ key: "Space", name: "Lướt né", cd: pl.cd.dash, max: 1.2 });
    for (const key of ["1", "2", "3"]) {
      const m = X.misc[p.hot[key]];
      slots.push({ key, name: m ? `${m.name} ×${p.misc[m.id] || 0}` : "—", cd: m ? pl.pot[m.id] || 0 : 0, max: m ? m.cd || 1 : 1,
        off: m && !(p.misc[m.id] > 0) ? "Hết" : "", small: true });
    }
    const sw = B2 ? 122 : 132, sws = 112, gap = 8;
    const total = slots.reduce((a, s) => a + (s.small || s.empty ? sws : sw), 0) + gap * (slots.length - 1);
    let x = W / 2 - total / 2; const sy = 642;
    slots.forEach(s => {
      const w = s.small || s.empty ? sws : sw;
      c.fillStyle = s.empty ? "#22242e" : "#2e3140"; c.fillRect(x, sy, w, 58);
      c.strokeStyle = s.empty ? "#3a3d48" : s.off ? "#7a3030" : s.small ? "#4a8a4a" : "#f2c230"; c.lineWidth = 2;
      if (s.empty) c.setLineDash([5, 4]);
      c.strokeRect(x, sy, w, 58); c.setLineDash([]);
      c.textAlign = "center"; c.fillStyle = s.off || s.empty ? "#888" : "#fff"; c.font = `600 ${s.small ? 12 : 14}px sans-serif`;
      let name = s.name; while (c.measureText(name).width > w - 8 && name.length > 4) name = name.slice(0, -2);
      if (name !== s.name) name += "…";
      c.fillText(name, x + w / 2, sy + 24);
      c.font = "12px sans-serif"; c.fillStyle = s.off ? "#ff8a80" : s.active ? "#a0e6ff" : "#aaa";
      c.fillText(s.off || s.active || s.key, x + w / 2, sy + 45);
      if (!s.off && !s.active && s.cd > 0) {
        c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(x, sy, w, 58 * clamp(s.cd / s.max, 0, 1));
        c.fillStyle = "#fff"; c.font = "600 18px sans-serif"; c.fillText(s.cd.toFixed(1), x + w / 2, sy + 36);
      } else if (!s.off && s.mp && pl.mp < s.mp) {
        c.fillStyle = "rgba(20,40,90,0.55)"; c.fillRect(x, sy, w, 58);
      }
      x += w + gap;
    });
    c.textAlign = "left"; c.fillStyle = "#777"; c.font = "13px sans-serif";
    c.fillText(B2 ? "Kiểu B: chuột trái để đi · Esc tạm dừng, đổi điều khiển" : "Kiểu A: WASD di chuyển · Esc tạm dừng, đổi điều khiển", 30, 714);
    if (this.net) this._drawNetHud(c);
  }

  // ===================== CHƠI CHUNG (bản 2.2) =====================
  // Người khác trong phòng: vị trí làm mượt, chiêu chỉ để nhìn (không gây sát thương lên mình).
  _netCast(slot, sc, m) {
    const pl = this.pl, k = this.sk[slot];
    const buff = (m === "buff_stat" || (slot === "q" && sc.stats.length)) && !["boomerang", "bounce", "beam", "tornado", "cone", "invuln", "orbit"].includes(m);
    this.net.cast({ k: slot, sid: k.s.id, c: buff ? "buff" : m, a: Math.round(pl.aim * 100) / 100,
      tx: Math.round(this.mouse.x), ty: Math.round(this.mouse.y), n: sc.count || 1, s: Math.round(sc.size || 0), d: Math.round((sc.dur || 0) * 10) / 10 });
  }
  // hình đạn skill của người khác, tô màu theo hệ phái của họ
  _remoteFx(sid, sect) {
    const key = "r:" + sid;
    if (!sid || this.fxi[key]) return key;
    const s = X.skill[sid]; if (!s) return key;
    this.fxi[key] = { A: img(s.fxA), B: img(s.fxB), F: [s.fxF1, s.fxF2, s.fxF3, s.fxF4].map(img),
      rotA: (s.fxARot || 0) * DEG, rotB: (s.fxBRot || 0) * DEG, tint: s.fxTint || "none", col: elemColor((X.sect[sect] || {}).element) };
    return key;
  }
  _netTick(dt) {
    const R = this.net, pl = this.pl, k = 1 - Math.exp(-14 * dt);
    for (const uid in R.players) {
      if (uid === R.uid) continue;
      const s = R.players[uid];
      let r = this.rem[uid];
      if (!r) {
        const g = X.gender[s.g] || {};
        r = this.rem[uid] = { uid, x: s.x ?? 650, y: s.y ?? 550, a: s.a || 0, fireT: 0, fa: 0, holy: 0, buff: 0, orbit: null, beam: null,
          img: img(g["sprite_" + (s.w || "none")] || g.sprite_none), col: elemColor((X.sect[s.s] || {}).element), robe: (X.sect[s.s] || {}).robe || "#888" };
      }
      r.s = s;
      r.x += ((s.x ?? r.x) - r.x) * k; r.y += ((s.y ?? r.y) - r.y) * k;     // làm mượt giữa các lần nhận
      r.a += angDiff(s.a ?? r.a, r.a) * k;
      r.holy = Math.max(0, r.holy - dt); r.buff = Math.max(0, r.buff - dt);
      if (r.orbit) { r.orbit.t -= dt; r.orbit.ang += dt * 3.2; if (r.orbit.t <= 0) r.orbit = null; }
      const lm = X.skill[s.lm];
      if (s.at && lm) {
        if (lm.mech === "orbit") r.fa += (3 + (s.as || 20) / 10 * 2.2) * dt;
        r.fireT -= dt;
        if (r.fireT <= 0) r.fireT = this._ghostLmb(r, lm);
      } else r.fireT = 0;
      if (r.beam) {
        r.beam.t += dt;
        if (r.beam.t >= 0.4) { this.beams.push({ x: r.x, y: r.y, angs: r.beam.angs, t: 0, life: 0.45, slot: r.beam.slot, L: 1900 }); r.beam = null; }
      }
    }
    for (const uid in this.rem) if (!R.players[uid]) delete this.rem[uid];   // đã rời phòng
    // gửi trạng thái của mình: tối đa 10 lần/giây, chỉ phần thay đổi; ẩn tab thì không gửi
    this.netT -= dt;
    if (this.netT <= 0 && !document.hidden) {
      this.netT = 1 / (S.netRate || 10);
      const sc = this.sc.lmb, lk = this.sk.lmb;
      const cur = {
        x: Math.round(pl.x), y: Math.round(pl.y), a: Math.round(pl.aim * 20) / 20,
        at: this._firing() && lk && lk.learned && lk.ok && this._can("cast") ? 1 : 0,
        hp: Math.round(100 * pl.hp / Math.max(1, this.st.hp)),
        lm: lk && lk.learned && lk.ok ? lk.s.id : "", ln: sc ? sc.count : 1, ls: sc ? Math.round(sc.size || 0) : 0,
        as: sc ? Math.round(sc.aspd * this._atkMul() * 10) : 0
      };
      if (this.time - this.netDmAt >= 0.5) { cur.dm = Math.round(this.dealt); this.netDmAt = this.time; }
      const patch = {}; let any = false;
      for (const key in cur) if (cur[key] !== this.netLast[key]) { patch[key] = cur[key]; this.netLast[key] = cur[key]; any = true; }
      if (any) R.send(patch);
    }
    if (R.isHost()) this._hostDummy(dt);
  }
  // chủ phòng: cộng sát thương của cả phòng vào mộc nhân, vỡ thì 2 giây sau dựng lại
  _hostDummy(dt) {
    const R = this.net, B = this.B;
    for (const uid in R.players) {
      if (uid === R.uid) continue;
      const dm = R.players[uid].dm || 0, last = this.hostSeen[uid];
      if (last === undefined) { this.hostSeen[uid] = dm; continue; }      // mới làm chủ phòng: tính từ lúc này
      if (dm > last) { B.hp = Math.max(0, B.hp - (dm - last)); this.hostSeen[uid] = dm; B.flash = 0.06; }
    }
    if (B.hp <= 0 && !this.dummyDown) {
      this.dummyDown = 2; this.dummyGen = (this.dummyGen || 0) + 1;
      this.texts.push({ x: B.x, y: B.y - 90, t: 0, text: "Mộc nhân vỡ! Dựng lại...", color: "#ffd23f", size: 20 });
    }
    if (this.dummyDown) { this.dummyDown -= dt; if (this.dummyDown <= 0) { this.dummyDown = 0; B.hp = B.maxHp; } }
    this.dummyT -= dt;
    const d = { hp: Math.round(B.hp), mx: B.maxHp, g: this.dummyGen || 0 }, L = this.dLast;
    if (this.dummyT <= 0 && (!L || L.hp !== d.hp || L.g !== d.g)) { this.dummyT = 0.2; this.dLast = d; R.setDummy(d); }
  }
  // người khác làm chủ phòng: nhận máu mộc nhân
  netDummy(d) {
    if (!this.net || this.net.isHost()) return;
    const B = this.B;
    if (this.dGen !== undefined && d.g !== this.dGen) this.texts.push({ x: B.x, y: B.y - 90, t: 0, text: "Mộc nhân vỡ! Dựng lại...", color: "#ffd23f", size: 20 });
    this.dGen = d.g; this.dummyGen = d.g; B.maxHp = d.mx || B.maxHp; B.hp = d.hp;
  }

  // ---- đạn "bóng" của người khác: chỉ để nhìn, trúng mộc nhân thì tan ----
  _ghost(r, a, o = {}) {
    if (this.gh.length > 160) return;
    const sp = o.sp || 620;
    this.gh.push({ x: r.x + Math.cos(a) * 20, y: r.y + Math.sin(a) * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a, age: 0,
      life: o.life || 1.6, slot: o.slot, key: o.key || "A", kind: o.kind || "shot", moon: !!o.moon, size: o.size || 1,
      sz: o.sz || 8, r: o.r || 8, r0: o.r || 8, col: r.col, owner: r, ...o.extra });
  }
  _ghostLmb(r, sk) {
    const s = r.s, slot = this._remoteFx(sk.id, s.s), m = sk.mech, a = r.a, n = Math.max(1, s.ln || 1), sz = s.ls || 8;
    const gap = 1 / Math.max(0.3, (s.as || 20) / 10);
    if (m === "orbit") return 0.2;                         // nắm đấm xoay: vẽ ở _drawRemotes
    if (m === "staff_trap") {
      for (let i = 0; i < n; i++) {
        const aa = a + (i ? rand(-0.25, 0.25) : 0), d = Math.min(460, 320 + rand(-40, 40));
        this._ghost(r, aa, { kind: "staff", sp: 720, extra: { tx: r.x + Math.cos(aa) * d, ty: r.y + Math.sin(aa) * d, rot: 0, tr: Math.max(40, sz), td: Math.max(0.5, sk.dur || 2) } });
      }
    } else if (m === "twin_sword") {
      this._ghost(r, a, { slot, key: "A", sz });
      this.later.push({ t: 0.12, fn: () => this._ghost(r, a, { slot, key: "B", sz, size: 0.85 }) });
    } else {
      for (let i = 0; i < n; i++) {
        const moon = m === "crescent";
        this._ghost(r, a + (i - (n - 1) / 2) * 0.13, { slot, moon, sz, r: moon ? Math.max(10, sz) : Math.max(6, Math.min(16, sz)) });
      }
    }
    return gap;
  }
  _ghostCast(uid, ev) {
    const r = this.rem[uid]; if (!r || !r.s) return;
    const sk = X.skill[ev.sid]; if (!sk) return;
    const slot = this._remoteFx(ev.sid, r.s.s), a = ev.a || 0, n = Math.max(1, ev.n || 1), size = ev.s || 0;
    switch (ev.c) {
      case "cone": this.fx.push({ type: "cone", x: r.x, y: r.y, ang: a, len: size || 250, half: 32 * DEG, t: 0, life: 0.4, slot }); break;
      case "circle": case "debuff_area": this.fx.push({ type: "ring", x: r.x, y: r.y, r: size || 150, t: 0, life: 0.45, color: r.col }); break;
      case "ground_burst": this.fx.push({ type: "ring", x: ev.tx ?? r.x, y: ev.ty ?? r.y, r: size || 150, t: 0, life: 0.45, color: r.col }); break;
      case "invuln": case "shield": r.holy = Math.max(1, ev.d || 2); break;
      case "buff": r.buff = Math.max(1, ev.d || 3); break;
      case "orbit": r.orbit = { t: Math.max(1, ev.d || 3), n, r: Math.max(50, size), ang: 0 }; break;
      case "boomerang":
        for (let i = 0; i < n; i++) this._ghost(r, a + (i - (n - 1) / 2) * 0.2, { kind: "vk", slot, sp: 1300, life: Math.max(1, ev.d || 4) + 1.5, extra: { st: "out", d: 0, hold: Math.max(1, ev.d || 4) } });
        break;
      case "bounce": this._ghost(r, a, { kind: "taiji", slot, sp: 560, life: Math.max(0.5, ev.d || 3.5), r: Math.max(18, size * 0.55), extra: { rot: 0 } }); break;
      case "beam": {
        const fan = 40 * DEG;
        r.beam = { t: 0, slot, angs: n === 1 ? [a] : Array.from({ length: n }, (_, i) => a - fan / 2 + fan * i / (n - 1)) };
        break;
      }
      case "tornado": {
        const rMax = Math.max(40, size * 0.55);
        this._ghost(r, a, { kind: "tornado", slot, sp: 470, life: Math.max(0.5, ev.d || 1.6), r: rMax * 0.28, extra: { r1: rMax, k: 0 } });
        break;
      }
      default: this._ghost(r, a, { slot, key: "A", sz: size || 8, r: Math.max(6, Math.min(16, size || 8)) });
    }
  }
  _updateGhosts(dt) {
    const B = this.B;
    const hitDummy = (x, y, rr) => dist(x, y, B.x, B.y) < rr + B.r;
    for (const g of this.gh) {
      g.age += dt; g.life -= dt;
      if (g.kind === "staff") {
        g.rot += dt * 18;
        const d = dist(g.x, g.y, g.tx, g.ty), step = 720 * dt;
        if (d <= step) { g.kind = "trap"; g.x = g.tx; g.y = g.ty; g.life = g.td; g.r = g.tr; continue; }
        g.x += (g.tx - g.x) / d * step; g.y += (g.ty - g.y) / d * step;
        continue;
      }
      if (g.kind === "trap") continue;
      if (g.kind === "vk") {
        const o = g.owner;
        if (g.st === "out") {
          g.x += g.vx * dt; g.y += g.vy * dt; g.d += 1300 * dt;
          if (g.d >= 620 || g.x < AR.x1 || g.x > AR.x2 || g.y < AR.y1 || g.y > AR.y2) g.st = "hold";
        }
        if (g.st !== "back" && g.age >= g.hold) g.st = "back";
        if (g.st === "back") {
          const a = Math.atan2(o.y - g.y, o.x - g.x), d = dist(g.x, g.y, o.x, o.y), step = 1500 * dt;
          g.ba = a;
          if (d <= step + 20) { g.life = 0; continue; }
          g.x += Math.cos(a) * step; g.y += Math.sin(a) * step;
        }
        continue;
      }
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.kind === "taiji") {
        g.rot += dt * 5;
        if (g.x < AR.x1 + g.r || g.x > AR.x2 - g.r) g.vx = -g.vx;
        if (g.y < AR.y1 + g.r || g.y > AR.y2 - g.r) g.vy = -g.vy;
        g.x = clamp(g.x, AR.x1 + g.r, AR.x2 - g.r); g.y = clamp(g.y, AR.y1 + g.r, AR.y2 - g.r);
        if (hitDummy(g.x, g.y, g.r)) { this.fx.push({ type: "ring", x: g.x, y: g.y, r: g.r * 1.6, t: 0, life: 0.4, color: g.col }); g.life = 0; }
        continue;
      }
      if (g.kind === "tornado") {
        g.k = Math.min(1, g.age / Math.max(0.1, g.age + g.life)); g.r = g.r0 + (g.r1 - g.r0) * g.k;
        if (hitDummy(g.x, g.y, g.r)) { this.fx.push({ type: "ring", x: g.x, y: g.y, r: g.r * 1.3, t: 0, life: 0.45, color: "#bfe8ff" }); g.life = 0; }
        continue;
      }
      if (g.moon) g.r = g.r0 * (1 + 0.3 * Math.min(1, g.age / 0.8));
      if (hitDummy(g.x, g.y, g.r * 0.8)) { g.life = 0; this._spark(g.x, g.y, g.col, 4); }
    }
    this.gh = this.gh.filter(g => g.life > 0 && g.x > AR.x1 - 60 && g.x < AR.x2 + 60 && g.y > AR.y1 - 60 && g.y < AR.y2 + 60);
  }
  _drawGhosts(c) {
    for (const g of this.gh) {
      if (!this._inView(g.x, g.y, 120)) continue;
      const a = Math.atan2(g.vy, g.vx);
      if (g.kind === "staff") { this._drawStaff(c, g.x, g.y, g.rot, 0.8); continue; }
      if (g.kind === "trap") { this._drawStaff(c, g.x, g.y, 0, 0.9, g.r); continue; }
      if (g.kind === "vk") {
        const back = g.st === "back", ang = back ? (g.ba ?? a + Math.PI) : g.a;
        if (!this._drawFx(c, g.slot, back ? "B" : "A", g.x, g.y, ang, 62)) {
          c.save(); c.translate(g.x, g.y); c.rotate(ang); c.strokeStyle = g.col; c.lineWidth = 4; c.beginPath(); c.moveTo(-24, 0); c.lineTo(24, 0); c.stroke(); c.restore();
        }
        continue;
      }
      if (g.kind === "taiji") {
        if (!this._drawFx(c, g.slot, "A", g.x, g.y, g.rot, g.r * 2.3)) { c.strokeStyle = g.col; c.lineWidth = 4; c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.stroke(); }
        continue;
      }
      if (g.kind === "tornado") {
        const f = Math.min(3, Math.floor((g.k || 0) * 4));
        if (!this._drawFx(c, g.slot, "F", g.x, g.y - g.r * 0.25, 0, g.r * 2.6, 1, f)) { c.strokeStyle = "#bfe6ff"; c.lineWidth = 3; c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.stroke(); }
        continue;
      }
      if (g.moon) {
        if (this._drawFx(c, g.slot, "A", g.x, g.y, a, g.r * 2.3)) continue;
        c.lineCap = "round"; c.strokeStyle = g.col; c.lineWidth = Math.max(4, g.r * 0.32);
        c.beginPath(); c.arc(g.x, g.y, g.r, a - 1.15, a + 1.15); c.stroke();
        continue;
      }
      if (this._drawFx(c, g.slot, g.key, g.x, g.y, a, clamp(g.sz * 4, 30, 64) * g.size)) continue;
      c.fillStyle = g.col; c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.fill();
    }
  }
  _drawRemotes(c) {
    for (const uid in this.rem) {
      const r = this.rem[uid], s = r.s || {};
      if (!this._inView(r.x, r.y, 140)) continue;
      c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(r.x, r.y + 26, 18, 6, 0, 0, TAU); c.fill();
      if (ready(r.img)) {
        const h = 96, w = h * r.img.naturalWidth / r.img.naturalHeight;
        c.save(); c.translate(r.x, r.y + 30); if (Math.cos(r.a) > 0) c.scale(-1, 1); c.drawImage(r.img, -w / 2, -h, w, h); c.restore();
      } else {
        c.fillStyle = r.robe; c.strokeStyle = "#222"; c.lineWidth = 2.5; c.beginPath(); c.arc(r.x, r.y, 16, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = "#f2cfa4"; c.beginPath(); c.arc(r.x, r.y - 18, 9, 0, TAU); c.fill();
      }
      if (r.holy > 0) { c.strokeStyle = "rgba(255,225,120,0.7)"; c.fillStyle = "rgba(255,225,120,0.12)"; c.lineWidth = 3; c.beginPath(); c.arc(r.x, r.y - 10, 44, 0, TAU); c.fill(); c.stroke(); }
      if (r.buff > 0) { c.strokeStyle = "rgba(242,194,48,0.7)"; c.lineWidth = 3; c.beginPath(); c.arc(r.x, r.y - 10, 48, 0, TAU); c.stroke(); }
      if (r.orbit) for (let i = 0; i < r.orbit.n; i++) {
        const a = r.orbit.ang + i * TAU / r.orbit.n;
        this._drawStaff(c, r.x + Math.cos(a) * r.orbit.r, r.y + Math.sin(a) * r.orbit.r, a + Math.PI / 2, 0.8);
      }
      const lm = X.skill[s.lm];
      if (s.at && lm && lm.mech === "orbit") {            // nắm đấm Trường Quyền xoay quanh người
        const rr = Math.max(50, s.ls || 50), fx = r.x + Math.cos(r.fa) * rr, fy = r.y + Math.sin(r.fa) * rr;
        if (!this._drawFx(c, this._remoteFx(lm.id, s.s), "A", fx, fy, r.fa, 34)) { c.fillStyle = r.col; c.beginPath(); c.arc(fx, fy, 12, 0, TAU); c.fill(); }
      }
      if (r.beam) {
        c.strokeStyle = "rgba(150,215,255,0.5)"; c.lineWidth = 1; c.setLineDash([4, 8]);
        for (const a of r.beam.angs) { c.beginPath(); c.moveTo(r.x, r.y); c.lineTo(r.x + Math.cos(a) * 1900, r.y + Math.sin(a) * 1900); c.stroke(); }
        c.setLineDash([]);
      }
      // tên + cấp + thanh máu nhỏ
      c.textAlign = "center"; c.font = "600 15px sans-serif";
      const tag = `${s.n || "?"} Lev.${s.l || 1}`;
      if (!this.low) { c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,0.85)"; c.strokeText(tag, r.x, r.y - 80); }
      c.fillStyle = "#9fd8ff"; c.fillText(tag, r.x, r.y - 80);
      this._bar(c, r.x - 24, r.y - 74, 48, 4, s.hp ?? 100, 100, "#d94040", "#3d1d1d");
    }
  }
  _drawDummy(c, B) {
    const x = B.x, y = B.y, down = B.hp <= 0;
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(x, y + 44, 34, 9, 0, 0, TAU); c.fill();
    c.save(); c.translate(x, y); if (down) c.rotate(0.5);
    const wood = B.flash > 0 ? "#fff" : "#8a6038", dark = "#5a3a1e";
    c.fillStyle = dark; c.fillRect(-6, 10, 12, 36);                                   // cọc
    c.fillStyle = wood; c.strokeStyle = dark; c.lineWidth = 3;
    c.beginPath(); c.roundRect ? c.roundRect(-22, -26, 44, 44, 8) : c.rect(-22, -26, 44, 44); c.fill(); c.stroke();   // thân
    c.fillRect(-46, -16, 92, 10); c.strokeRect(-46, -16, 92, 10);                    // tay ngang
    c.beginPath(); c.arc(0, -42, 15, 0, TAU); c.fill(); c.stroke();                   // đầu
    c.strokeStyle = "rgba(90,58,30,0.6)"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-14, -10); c.lineTo(14, -10); c.moveTo(-14, 4); c.lineTo(14, 4); c.stroke();
    c.restore();
    if (B.fx.freeze > 0) { c.fillStyle = "rgba(190,232,255,0.3)"; c.beginPath(); c.arc(x, y, B.r + 6, 0, TAU); c.fill(); }
    if (B.fx.stun > 0) { c.fillStyle = "#f2e070"; for (let i = 0; i < 3; i++) { const a = this.time * 6 + i * TAU / 3; c.beginPath(); c.arc(x + Math.cos(a) * 22, y - 66 + Math.sin(a) * 6, 4, 0, TAU); c.fill(); } }
  }
  _drawNetHud(c) {
    const R = this.net;
    const list = Object.keys(R.players).map(uid => {
      const s = R.players[uid], me = uid === R.uid;
      return { n: me ? this.p.name : s.n, dm: me ? this.dealt : (s.dm || 0), me };
    }).sort((a, b) => b.dm - a.dm);
    c.textAlign = "right"; c.font = "12px sans-serif";
    let y = 86;
    c.fillStyle = "#8a8d96"; c.fillText("Sát thương", 1250, y); y += 16;
    for (const x of list) { c.fillStyle = x.me ? "#f2c230" : "#cfcfcf"; c.fillText(`${x.n}  ${fmt(x.dm)}`, 1250, y); y += 15; }
    // góc dưới phải, chữ nhỏ: độ trễ và dữ liệu đã nhận (ước tính)
    c.font = "10px sans-serif"; c.fillStyle = "#5c5f68";
    c.fillText(`${R.stats.ping}ms · ${(R.stats.bytes / 1048576).toFixed(1)}MB`, 1274, 716);
  }
}
