// ===== ĐÁNH BOSS: né đạn thời gian thực (canvas) =====
import { GD, S, X, elemBonus, elemColor, elemName, miscByKind, WEAPON_NAMES } from "./data.js";
import {
  calcStats, skillCalc, skillBonusLevels, activePath, weaponOk, equippedWeapon,
  rawSkillDamage, damageTaken, mitigate, critRoll, critMul, rand, clamp, fmt, pick, useMisc
} from "./logic.js";

const W = 1280, H = 720;
const AR = { x1: 30, y1: 84, x2: 1250, y2: 630 };
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
const img = src => { if (!src) return null; const i = new Image(); i.src = src; return i; };
const ready = i => i && i.complete && i.naturalWidth > 0;

export class Battle {
  // ctx = { kind: "map" | "gold", boss, map }
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
    this._refreshStats();
    const b = ctx.boss;
    this.el = this.st.element;
    this.pl = {
      x: 220, y: (AR.y1 + AR.y2) / 2, r: 16, hit: 7,
      hp: this.st.hp, mp: this.st.mp, aim: 0, fireCd: 0,
      dashT: 0, dashVx: 0, dashVy: 0, inv: 0, holy: 0, immune: 0,
      cd: { rmb: 0, q: 0, dash: 0 }, pot: {}, fx: {}, revived: false
    };
    this.B = {
      name: b.name, lv: b.lv, element: b.element, hp: b.hp, maxHp: b.hp, atk: b.atk, def: b.def,
      patterns: (b.patterns && b.patterns.length) ? b.patterns : ["ring", "fan"], effect: b.effect || "", effectChance: b.effectChance || 0,
      x: 1050, y: (AR.y1 + AR.y2) / 2, r: 40, tx: 1050, ty: 360, moveT: 0, atkT: 1.5, pi: 0, sub: [], flash: 0,
      charge: 0, cvx: 0, cvy: 0, fx: {}, ccImm: 0, pull: 0
    };
    this.pb = []; this.eb = []; this.fx = []; this.texts = [];
    this.traps = []; this.orbit = null; this.minions = []; this.zones = []; this.lasers = []; this.clouds = []; this.booms = [];
    this.keys = {}; this.mouse = { x: W / 2, y: H / 2, l: false };
    this.time = 0; this.paused = false; this.over = null; this.overT = 0;
    this.bossBonus = elemBonus(this.el, b.element);
    this.takenBonus = elemBonus(b.element, this.el);
    this.used = {};
    // hình
    const g = X.gender[player.gender] || {};
    const wt = equippedWeapon(player);
    this.imgPl = img(g["sprite_" + (wt || "none")] || g.sprite_none);
    this.imgBoss = img(b.img);
    this.imgBg = img(this.map && this.map.bg);
    this.mobKinds = (X.monOf[this.map ? this.map.id : ""] || []).map(m => ({ name: m.name, element: m.element, img: img(m.img) }));
    this._bind();
  }

  _refreshStats() {
    const extra = {};
    if (this.buff) this.buff.stats.forEach(x => extra[x.stat] = (extra[x.stat] || 0) + x.v);
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
        if (["w", "a", "s", "d", " ", "q", "escape", "f", "1", "2", "3"].includes(k)) e.preventDefault();
        if (k === "escape" && !this.over) { this.paused = !this.paused; return; }
        if (this.paused) { if (k === "f") this._finish("flee"); return; }
        if (!this.keys[k]) {
          if (k === " ") this._dash();
          if (k === "q") this._cast("q");
          if (k === "1" || k === "2" || k === "3") this._potion(k);
        }
        this.keys[k] = true;
      },
      ku: e => { this.keys[e.key.toLowerCase()] = false; },
      mm: e => toLocal(e),
      md: e => {
        toLocal(e); e.preventDefault();
        if (this.paused || this.over) return;
        if (e.button === 0) this.mouse.l = true;
        if (e.button === 2) this._cast("rmb");
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

  // ---------- Kỹ năng ----------
  _dash() {
    const pl = this.pl;
    if (pl.cd.dash > 0 || this.over || !this._can("move")) return;
    let dx = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
    let dy = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);
    if (!dx && !dy) { dx = Math.cos(pl.aim); dy = Math.sin(pl.aim); }
    const l = Math.hypot(dx, dy);
    pl.dashVx = dx / l * 950; pl.dashVy = dy / l * 950;
    pl.dashT = 0.16; pl.inv = Math.max(pl.inv, 0.28); pl.cd.dash = 1.2;
  }

  _note(text, color = "#ffb070") { this.texts.push({ x: this.pl.x, y: this.pl.y - 46, t: 0, text, color, size: 16 }); }

  _cast(slot) {
    const pl = this.pl, k = this.sk[slot], sc = this.sc[slot];
    if (this.over || !k) return;
    if (!k.learned) return this._note("Chưa học " + k.s.name);
    if (!k.ok) return this._note("Cần cầm " + WEAPON_NAMES[k.s.weapon]);
    if (!this._can("cast")) return;
    if (pl.cd[slot] > 0) return;
    if (pl.mp < sc.mp) return this._note("Thiếu nội lực", "#7fb2f0");
    pl.mp -= sc.mp; pl.cd[slot] = sc.cd || 1;
    const m = k.s.mech;
    if (m === "cone") return this._cone(sc);
    if (m === "invuln") { pl.holy = sc.dur; return; }
    if (m === "orbit") { this.orbit = { t: sc.dur, n: sc.count, r: Math.max(50, sc.size), ang: 0, sc, hitT: {} }; return; }
    if (m === "buff_stat" || (slot === "q" && sc.stats.length)) {
      this.buff = { t: Math.max(1, sc.dur), stats: sc.stats }; this._refreshStats(); return;
    }
    if (m === "shield") { pl.holy = Math.max(pl.holy, sc.dur || 2); return; }
    if (m === "circle" || m === "debuff_area" || m === "ground_burst") return this._circle(sc, m === "ground_burst");
    // các cơ chế chưa có code riêng: bắn đạn thường
    this._shootPlayer(sc, pl.aim, 1.2);
  }

  _cone(sc) {
    const pl = this.pl, ang = pl.aim, len = sc.size || 250, half = 32 * Math.PI / 180;
    this.fx.push({ type: "cone", x: pl.x, y: pl.y, ang, len, half, t: 0, life: 0.4 });
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
    const spread = this.st.spread * Math.PI / 180;
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
    } else {
      const n = sc.count, gap = 0.13;
      for (let i = 0; i < n; i++) this._shootPlayer(sc, pl.aim + (i - (n - 1) / 2) * gap + rand(-spread, spread), 1, m === "crescent" ? "moon" : "ball");
    }
    return 1 / Math.max(0.3, sc.aspd * this._atkMul());
  }

  _shootPlayer(sc, a, mul = 1, kind = "ball") {
    const pl = this.pl, r = kind === "moon" ? Math.max(10, sc.size) : Math.max(6, Math.min(16, sc.size || 8)), sp = 620;
    this.pb.push({ kind, x: pl.x + Math.cos(a) * 20, y: pl.y + Math.sin(a) * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, r0: r, sc, mul, life: 1.6, age: 0 });
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
  _onHitEffects(target, sc, dealt) {
    const st = this.st, fx = target.fx;
    if (st.lifesteal) this.pl.hp = Math.min(this.st.hp, this.pl.hp + dealt * st.lifesteal / 100);
    if (st.manasteal) this.pl.mp = Math.min(this.st.mp, this.pl.mp + dealt * st.manasteal / 100);
    if (st.burnDmg) { fx.burn = this._effDur("burn", 3); fx.burnDps = st.burnDmg / fx.burn; }
    if (st.poisonDmg) { fx.poison = this._effDur("poison", 10); fx.pStacks = Math.min((X.effect.poison || {}).stack || 5, (fx.pStacks || 0) + 1); fx.poisonDps = st.poisonDmg / fx.poison; }
    const cc = (id, chance) => {
      if (!chance || target.ccImm > 0 || Math.random() * 100 >= chance) return;
      fx[id] = this._effDur(id, id === "slow" ? 2 : 1); target.ccImm = (fx[id] || 1) + 2;
    };
    cc("slow", st.slowChance); cc("freeze", st.freezeChance); cc("stun", st.stunChance);
    if (sc && sc.effect && sc.effectChance && Math.random() * 100 < sc.effectChance) {
      let e = sc.effect === "random" ? pick(["burn", "poison", "slow", "freeze", "stun"]) : sc.effect;
      if (e === "burn") { fx.burn = this._effDur("burn", 3); fx.burnDps = Math.max(fx.burnDps || 0, dealt * 0.3 / fx.burn); }
      else if (e === "poison") { fx.poison = this._effDur("poison", 10); fx.pStacks = Math.min(5, (fx.pStacks || 0) + 1); fx.poisonDps = Math.max(fx.poisonDps || 0, dealt * 0.2 / fx.poison); }
      else if (target.ccImm <= 0) { fx[e] = this._effDur(e, 1); target.ccImm = fx[e] + 2; }
    }
  }
  _dmgBoss(sc, mul) {
    const B = this.B;
    const { d, crit } = this._calcHit(sc, mul, true, B.element, B.def, B.lv);
    this._hurtBoss(d, crit);
    this._onHitEffects(B, sc, d);
  }
  _hurtBoss(d, crit, color) {
    const B = this.B;
    B.hp -= d; B.flash = 0.08;
    this.texts.push({ x: B.x + rand(-25, 25), y: B.y - B.r - 10, t: 0, text: (crit ? "Chí mạng " : "") + fmt(d),
      color: color || (crit ? "#ffe070" : "#ffffff"), size: crit ? 26 : 20 });
    if (B.hp <= 0 && !this.over) { B.hp = 0; this._finish("win"); }
  }
  _dmgMinion(m, sc, mul) {
    const { d, crit } = this._calcHit(sc, mul, false, m.element, m.def, this.B.lv);
    m.hp -= d; m.flash = 0.08;
    this.texts.push({ x: m.x, y: m.y - m.r - 6, t: 0, text: fmt(d), color: crit ? "#ffe070" : "#ddd", size: 15 });
    if (m.hp <= 0) this._spark(m.x, m.y, "#fff", 10);
  }

  _hitPlayer(raw, opts = {}) {
    const pl = this.pl, st = this.st;
    if (pl.inv > 0 || pl.holy > 0 || this.over) return false;
    if (Math.random() * 100 < (st.dodge || 0)) { this._note("Né", "#9adfff"); pl.inv = 0.2; return false; }
    let dmg = damageTaken(raw, this.B.element, this.B.lv, st) * rand(0.9, 1.1);
    if (this.B.fx.burn > 0) dmg *= 1 - this._effVal("burn", 15) / 100;
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
      this.texts.push({ x: pl.x, y: pl.y - 50, t: 0, text: rv.name + "!", color: "#ffd23f", size: 22 });
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
      case "wall": {
        const gapY = rand(AR.y1 + 80, AR.y2 - 80), gap = p2 ? 70 : 90;
        for (let y = AR.y1 + 12; y < AR.y2; y += 36) { if (Math.abs(y - gapY) < gap) continue; this._shoot(B.x - 40, y, Math.PI, p2 ? 200 : 170); }
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
          const x = rand(AR.x1 + 10, AR.x2 - 10);
          this._shoot(x, AR.y1 + 4, Math.PI / 2 + rand(-0.12, 0.12), rand(220, 300), { r: 6 });
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
    if (this.over) {
      this.overT += dt;
      if (this.overT > 1.6 && !this.ended) { this.ended = true; this.destroy(); this.onEnd(this.over, this.used); }
      return;
    }

    // hồi chiêu, hiệu ứng
    for (const k in pl.cd) pl.cd[k] = Math.max(0, pl.cd[k] - dt);
    for (const k in pl.pot) pl.pot[k] = Math.max(0, pl.pot[k] - dt);
    pl.inv = Math.max(0, pl.inv - dt); pl.holy = Math.max(0, pl.holy - dt); pl.immune = Math.max(0, pl.immune - dt);
    this._tickFx(pl.fx, dt, (dps) => { pl.hp -= dps * dt; if (pl.hp <= 0) this._die(); }, true);
    this._tickFx(B.fx, dt, (dps) => { B.hp -= dps * dt; if (B.hp <= 0 && !this.over) { B.hp = 0; this._finish("win"); } }, false);
    B.ccImm = Math.max(0, B.ccImm - dt);
    if (this.buff) { this.buff.t -= dt; if (this.buff.t <= 0) { this.buff = null; this._refreshStats(); } }
    pl.mp = Math.min(st.mp, pl.mp + st.mpRegenSec * dt);
    if (st.hpRegenSec) pl.hp = Math.min(st.hp, pl.hp + st.hpRegenSec * dt);
    pl.aim = Math.atan2(this.mouse.y - pl.y, this.mouse.x - pl.x);

    // di chuyển
    if (pl.dashT > 0) {
      pl.dashT -= dt; pl.x += pl.dashVx * dt; pl.y += pl.dashVy * dt;
      if (Math.random() < 0.7) this.fx.push({ type: "ghost", x: pl.x, y: pl.y, t: 0, life: 0.25 });
    } else if (this._can("move")) {
      let dx = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
      let dy = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);
      const sp = 270 * (1 + (st.mspd || 0) / 100) * this._speedMul();
      if (dx || dy) { const l = Math.hypot(dx, dy); pl.x += dx / l * sp * dt; pl.y += dy / l * sp * dt; }
    }
    if (B.pull > 0) {    // Hấp Tinh: bị hút về boss
      B.pull -= dt;
      const a = Math.atan2(B.y - pl.y, B.x - pl.x);
      pl.x += Math.cos(a) * 170 * dt; pl.y += Math.sin(a) * 170 * dt;
    }
    pl.x = clamp(pl.x, AR.x1 + pl.r, AR.x2 - pl.r);
    pl.y = clamp(pl.y, AR.y1 + pl.r, AR.y2 - pl.r);

    // chuột trái
    pl.fireCd -= dt;
    if (this.mouse.l && pl.fireCd <= 0 && this._can("cast")) pl.fireCd = this._fireLmb();

    this._updatePlayerShots(dt);
    this._updateTraps(dt);
    this._updateOrbit(dt);
    this._updateBoss(dt);
    this._updateMinions(dt);
    this._updateHazards(dt);
    this._updateBullets(dt);
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
        hit === B ? this._dmgBoss(b.sc, b.mul) : this._dmgMinion(hit, b.sc, b.mul);
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
    const stopped = B.fx.freeze > 0 || B.fx.stun > 0;
    const spMul = B.fx.slow > 0 ? 0.6 : 1;
    if (B.charge > 0 && !stopped) {
      B.charge -= dt; B.x += B.cvx * dt * spMul; B.y += B.cvy * dt * spMul;
      if (B.charge <= 0) { B.charge = 0; B.tx = rand(850, 1180); B.ty = rand(AR.y1 + 60, AR.y2 - 60); }
    } else if (!stopped) {
      B.moveT -= dt;
      if (B.moveT <= 0) { B.moveT = rand(1.8, 3); B.tx = rand(820, 1180); B.ty = rand(AR.y1 + 60, AR.y2 - 60); }
      const dx = B.tx - B.x, dy = B.ty - B.y, d = Math.hypot(dx, dy);
      if (d > 2) { const sp = Math.min(d, 140 * dt * spMul); B.x += dx / d * sp; B.y += dy / d * sp; }
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
        if (d > 120) { m.x += Math.cos(a) * 95 * dt; m.y += Math.sin(a) * 95 * dt; }
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
    const c = this.c, pl = this.pl, B = this.B;
    c.fillStyle = "#16181e"; c.fillRect(0, 0, W, H);
    if (ready(this.imgBg)) {
      c.drawImage(this.imgBg, AR.x1, AR.y1, AR.x2 - AR.x1, AR.y2 - AR.y1);
      c.fillStyle = "rgba(10,12,16,0.35)"; c.fillRect(AR.x1, AR.y1, AR.x2 - AR.x1, AR.y2 - AR.y1);
    } else {
      c.fillStyle = "#2a2a26"; c.fillRect(AR.x1, AR.y1, AR.x2 - AR.x1, AR.y2 - AR.y1);
      c.strokeStyle = "rgba(255,255,255,0.04)"; c.lineWidth = 1;
      for (let x = AR.x1; x < AR.x2; x += 80) { c.beginPath(); c.moveTo(x, AR.y1); c.lineTo(x, AR.y2); c.stroke(); }
      for (let y = AR.y1; y < AR.y2; y += 80) { c.beginPath(); c.moveTo(AR.x1, y); c.lineTo(AR.x2, y); c.stroke(); }
    }
    c.strokeStyle = elemColor(this.map ? this.map.element : B.element); c.globalAlpha = 0.5; c.lineWidth = 2;
    c.strokeRect(AR.x1, AR.y1, AR.x2 - AR.x1, AR.y2 - AR.y1); c.globalAlpha = 1;

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
      c.fillStyle = `rgba(242,194,48,${0.35 * k})`; c.strokeStyle = `rgba(255,230,120,${0.8 * k})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(f.x, f.y);
      c.lineTo(f.x + Math.cos(f.ang - f.half) * L, f.y + Math.sin(f.ang - f.half) * L);
      c.lineTo(f.x + Math.cos(f.ang + f.half) * L, f.y + Math.sin(f.ang + f.half) * L);
      c.closePath(); c.fill(); c.stroke();
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
      const a = L.cur ?? L.a, len = 1500;
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

    for (const m of this.minions) this._drawMinion(c, m);
    this._drawBoss(c, B);
    this._drawPlayer(c, pl);

    // La Hán Côn Trận
    if (this.orbit) {
      const o = this.orbit;
      for (let i = 0; i < o.n; i++) {
        const a = o.ang + i * TAU / o.n;
        this._drawStaff(c, pl.x + Math.cos(a) * o.r, pl.y + Math.sin(a) * o.r, a + Math.PI / 2, 0.8);
      }
    }
    // đạn người chơi
    const pc = elemColor(this.el);
    for (const b of this.pb) {
      if (b.kind === "staff") { this._drawStaff(c, b.x, b.y, b.rot, 0.8); continue; }
      if (b.kind === "moon") {
        const a = Math.atan2(b.vy, b.vx);
        c.lineCap = "round"; c.strokeStyle = pc; c.lineWidth = Math.max(4, b.r * 0.32);
        c.beginPath(); c.arc(b.x, b.y, b.r, a - 1.15, a + 1.15); c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = Math.max(1.5, b.r * 0.1);
        c.beginPath(); c.arc(b.x, b.y, b.r * 1.02, a - 0.8, a + 0.8); c.stroke();
        continue;
      }
      c.fillStyle = b.conv ? "#c8f" : pc; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
    }
    // bánh xe
    for (const o of this.booms) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.rot);
      c.strokeStyle = bc; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.stroke();
      c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i * TAU / 4) * o.r, Math.sin(i * TAU / 4) * o.r); c.stroke(); }
      c.restore();
    }
    // đạn boss
    for (const b of this.eb) {
      if (b.needle) {
        const a = Math.atan2(b.vy, b.vx);
        c.strokeStyle = "#f4f4f4"; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(b.x - Math.cos(a) * 12, b.y - Math.sin(a) * 12); c.lineTo(b.x + Math.cos(a) * 6, b.y + Math.sin(a) * 6); c.stroke();
        continue;
      }
      c.fillStyle = bc; c.strokeStyle = "#000"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = "rgba(255,255,255,0.8)"; c.beginPath(); c.arc(b.x, b.y, b.r * 0.45, 0, TAU); c.fill();
      if (b.big) { c.strokeStyle = bc; c.globalAlpha = 0.5; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r + 5, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    }
    for (const f of this.fx) if (f.type === "spark") {
      c.globalAlpha = 1 - f.t / f.life; c.fillStyle = f.color; c.fillRect(f.x - 2, f.y - 2, 4, 4); c.globalAlpha = 1;
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
    if (f.freeze > 0) { c.fillStyle = "rgba(190,232,255,0.35)"; c.fillRect(pl.x - 24, pl.y - 64, 48, 92); }
    if (f.stun > 0) { c.fillStyle = "#f2e070"; for (let i = 0; i < 3; i++) { const a = this.time * 6 + i * TAU / 3; c.beginPath(); c.arc(pl.x + Math.cos(a) * 16, pl.y - 70 + Math.sin(a) * 5, 3.5, 0, TAU); c.fill(); } }
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(this.mouse.x, this.mouse.y, 9, 0, TAU); c.stroke();
    c.fillStyle = "#ff4040"; c.beginPath(); c.arc(pl.x, pl.y, 3, 0, TAU); c.fill();
  }

  _drawMinion(c, m) {
    if (ready(m.img)) c.drawImage(m.img, m.x - 26, m.y - 26, 52, 52);
    else { c.fillStyle = m.flash > 0 ? "#fff" : elemColor(m.element); c.beginPath(); c.arc(m.x, m.y, m.r, 0, TAU); c.fill(); }
    c.fillStyle = "#3d1d1d"; c.fillRect(m.x - 22, m.y - m.r - 10, 44, 5);
    c.fillStyle = "#d94040"; c.fillRect(m.x - 22, m.y - m.r - 10, 44 * clamp(m.hp / m.maxHp, 0, 1), 5);
  }

  _drawBoss(c, B) {
    const col = elemColor(B.element);
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(B.x, B.y + B.r - 2, B.r, 9, 0, 0, TAU); c.fill();
    if (B.hp < B.maxHp * 0.5) {
      c.strokeStyle = col; c.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 6); c.lineWidth = 6;
      c.beginPath(); c.arc(B.x, B.y, B.r + 12, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    if (ready(this.imgBoss)) {
      const s = 116;
      c.save();
      if (B.flash > 0) c.filter = "brightness(2.2)";
      c.drawImage(this.imgBoss, B.x - s / 2, B.y - s / 2 - 6, s, s);
      c.restore();
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
    if (pl.immune > 0) tags.push(["Miễn nhiễm", "#9ad89a"]);
    c.font = "13px sans-serif";
    for (const [t, col] of tags) { c.fillStyle = col; c.fillText(t, tx, 49); tx += c.measureText(t).width + 12; }

    c.textAlign = "center"; c.fillStyle = "#cfcfcf"; c.font = "16px sans-serif";
    const where = this.kind === "gold" ? "Boss Hoàng Kim" : (this.map ? this.map.name : "");
    c.fillText(`${where} · ${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, "0")}`, W / 2, 30);
    if (this.bossBonus > 1) { c.fillStyle = "#6fd06f"; c.fillText(`Khắc chế boss: +${S.counterBonus ?? 15}% sát thương`, W / 2, 54); }
    else if (this.takenBonus > 1) { c.fillStyle = "#ff8a70"; c.fillText(`Bị boss khắc: nhận thêm ${S.counterBonus ?? 15}% sát thương`, W / 2, 54); }

    c.textAlign = "right"; c.font = "600 18px sans-serif"; c.fillStyle = elemColor(B.element);
    c.fillText(`${B.name} Lv${B.lv} (${elemName(B.element)})`, 1250, 26);
    this._bar(c, 850, 36, 400, 16, B.hp, B.maxHp, "#d94040", "#3d1d1d");
    c.font = "13px sans-serif"; c.fillStyle = "#fff";
    c.fillText(`${fmt(B.hp)} / ${fmt(B.maxHp)}`, 1244, 49);
    let bx = 1250; c.textAlign = "right";
    for (const [t, col] of this._fxTags(B.fx).reverse()) { c.fillStyle = col; c.fillText(t, bx, 68); bx -= c.measureText(t).width + 12; }

    // thanh kỹ năng
    const slots = [];
    for (const [slot, key] of [["lmb", "Chuột trái"], ["rmb", "Chuột phải"], ["q", "Q"]]) {
      const k = this.sk[slot], sc = this.sc[slot];
      if (!k) { slots.push({ key, name: "—", off: "Không có" }); continue; }
      slots.push({ key, name: k.s.name, off: !k.learned ? "Chưa học" : !k.ok ? "Cần " + WEAPON_NAMES[k.s.weapon] : "",
        cd: slot === "lmb" ? 0 : pl.cd[slot], max: sc ? sc.cd || 1 : 1, mp: sc ? sc.mp : 0, img: k.s.img });
    }
    slots.push({ key: "Space", name: "Lướt né", cd: pl.cd.dash, max: 1.2 });
    for (const key of ["1", "2", "3"]) {
      const m = X.misc[p.hot[key]];
      slots.push({ key, name: m ? `${m.name} ×${p.misc[m.id] || 0}` : "—", cd: m ? pl.pot[m.id] || 0 : 0, max: m ? m.cd || 1 : 1,
        off: m && !(p.misc[m.id] > 0) ? "Hết" : "", small: true });
    }
    const sw = 132, sws = 120, gap = 8;
    const total = slots.reduce((a, s) => a + (s.small ? sws : sw), 0) + gap * (slots.length - 1);
    let x = W / 2 - total / 2; const sy = 642;
    slots.forEach(s => {
      const w = s.small ? sws : sw;
      c.fillStyle = "#2e3140"; c.fillRect(x, sy, w, 58);
      c.strokeStyle = s.off ? "#7a3030" : s.small ? "#4a8a4a" : "#f2c230"; c.lineWidth = 2; c.strokeRect(x, sy, w, 58);
      c.textAlign = "center"; c.fillStyle = s.off ? "#888" : "#fff"; c.font = `600 ${s.small ? 12 : 14}px sans-serif`;
      let name = s.name; while (c.measureText(name).width > w - 8 && name.length > 4) name = name.slice(0, -2);
      if (name !== s.name) name += "…";
      c.fillText(name, x + w / 2, sy + 24);
      c.font = "12px sans-serif"; c.fillStyle = s.off ? "#ff8a80" : "#aaa";
      c.fillText(s.off || s.key, x + w / 2, sy + 45);
      if (!s.off && s.cd > 0) {
        c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(x, sy, w, 58 * clamp(s.cd / s.max, 0, 1));
        c.fillStyle = "#fff"; c.font = "600 18px sans-serif"; c.fillText(s.cd.toFixed(1), x + w / 2, sy + 36);
      } else if (!s.off && s.mp && pl.mp < s.mp) {
        c.fillStyle = "rgba(20,40,90,0.55)"; c.fillRect(x, sy, w, 58);
      }
      x += w + gap;
    });
    c.textAlign = "left"; c.fillStyle = "#777"; c.font = "13px sans-serif";
    c.fillText("WASD di chuyển · Esc tạm dừng", 30, 712);
  }
}
