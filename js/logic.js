// ===== LOGIC: chỉ số, cấp, trang bị, treo máy =====
import {
  ELEMENTS, GENDERS, SECTS, SKILLS, SKILL_ORDER, MAPS, RARITY, SLOTS, SLOT_ORDER,
  DROP_WEIGHTS_IDLE, DROP_WEIGHTS_BOSS, INVENTORY_SIZE, OFFLINE_MAX_HOURS, elementBonus
} from "./data.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const fmt = n => Math.round(n).toLocaleString("vi-VN");

// ---------- Nhân vật ----------
export function newPlayer(name, gender, sect) {
  const skills = {};
  SKILL_ORDER.forEach(id => skills[id] = SKILLS[id].base);
  const equip = {};
  SLOT_ORDER.forEach(s => equip[s] = null);
  const p = {
    version: 1, name, gender, sect,
    level: 1, exp: 0, gold: 0, skillPoints: 1,
    skills, inventory: [], equip,
    mapId: MAPS[0].id, autoSellCommon: false,
    createdAt: Date.now(), lastSeen: Date.now()
  };
  // Tặng vũ khí khởi đầu
  p.equip.weapon = genItem(1, 0, "weapon");
  return p;
}

// Bổ sung trường còn thiếu cho save cũ
export function normalizePlayer(p) {
  p.skills = p.skills || {};
  SKILL_ORDER.forEach(id => { if (p.skills[id] == null) p.skills[id] = SKILLS[id].base; });
  p.equip = p.equip || {};
  SLOT_ORDER.forEach(s => { if (p.equip[s] === undefined) p.equip[s] = null; });
  p.inventory = p.inventory || [];
  if (!MAPS.find(m => m.id === p.mapId)) p.mapId = MAPS[0].id;
  return p;
}

export function expToNext(lv) { return Math.floor(100 * Math.pow(lv, 2.2)); }

export function calcStats(p) {
  const lv = p.level;
  const s = {
    atk: 20 + 6 * (lv - 1), hp: 200 + 40 * (lv - 1), mp: 100 + 10 * (lv - 1),
    def: 5 + 2 * (lv - 1), crit: 5, speed: 0
  };
  SLOT_ORDER.forEach(slot => {
    const it = p.equip[slot];
    if (!it) return;
    for (const k in it.stats) s[k] = (s[k] || 0) + it.stats[k];
  });
  // Dịch Cân Kinh: % máu trên tổng sau khi mặc đồ, tối đa 80%
  const hpBonus = Math.min(0.8, 0.08 * (p.skills.dichcan || 0));
  s.hpBonus = hpBonus;
  s.hp = Math.round(s.hp * (1 + hpBonus));
  s.crit = Math.min(60, s.crit);
  s.speed = Math.min(50, s.speed);
  const g = GENDERS[p.gender];
  s.dmgMul = g.dmgMul; s.spreadDeg = g.spreadDeg; s.idleHit = g.idleHit; s.homing = g.homing;
  s.element = SECTS[p.sect].element;
  return s;
}

// Sát thương 1 phát Nguyệt Đao (chưa tính chí mạng, phòng thủ)
export function nguyetDaoDamage(p, st) {
  return st.atk * st.dmgMul * (1 + 0.12 * (p.skills.nguyetdao - 1)) * (1 + 0.05 * p.skills.nguyetanh);
}

export function reduceByDef(dmg, def) { return dmg * 100 / (100 + def); }

// ---------- Kỹ năng ----------
export function addSkillPoint(p, id) {
  const sk = SKILLS[id];
  if (!sk || p.skillPoints <= 0 || p.skills[id] >= sk.max) return false;
  p.skills[id]++; p.skillPoints--;
  return true;
}

export function resetSkills(p) {
  SKILL_ORDER.forEach(id => p.skills[id] = SKILLS[id].base);
  p.skillPoints = p.level;
}

// ---------- Kinh nghiệm ----------
export function gainExp(p, amount) {
  p.exp += Math.round(amount);
  const ups = [];
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++; p.skillPoints++;
    ups.push(p.level);
  }
  return ups;
}

// ---------- Trang bị ----------
export function rollRarity(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return 0;
}

const AFFIX_POOL = {
  atk: lv => 1 + 1.5 * lv, hp: lv => 10 + 6 * lv, def: lv => 1 + 0.8 * lv,
  crit: lv => 1 + 0.08 * lv, mp: lv => 5 + 2 * lv, speed: lv => 1 + 0.1 * lv
};

export function genItem(lv, rarity, slot) {
  slot = slot || pick(SLOT_ORDER);
  lv = Math.max(1, Math.round(lv));
  const tier = Math.min(4, Math.floor((lv - 1) / 10));
  const m = RARITY[rarity].mul;
  const st = {};
  const add = (k, v) => { v = Math.max(1, Math.round(v)); st[k] = (st[k] || 0) + v; };
  switch (slot) {
    case "weapon": add("atk", (6 + 4 * lv) * m); break;
    case "hat": add("hp", (20 + 10 * lv) * m); add("def", (2 + lv) * m); break;
    case "armor": add("hp", (35 + 16 * lv) * m); add("def", (3 + 1.5 * lv) * m); break;
    case "boots": add("speed", (3 + 0.2 * lv) * m); add("def", (1 + 0.6 * lv) * m); break;
    case "ring": add("crit", (2 + 0.12 * lv) * m); add("atk", (2 + 1.5 * lv) * m); break;
    case "necklace": add("mp", (10 + 4 * lv) * m); add("hp", (15 + 8 * lv) * m); break;
  }
  const keys = Object.keys(AFFIX_POOL);
  for (let i = 0; i < RARITY[rarity].affix; i++) {
    const k = pick(keys);
    add(k, AFFIX_POOL[k](lv) * rand(0.6, 1.0));
  }
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    slot, rarity, lv, name: SLOTS[slot].names[tier], stats: st
  };
}

export function itemScore(it) {
  if (!it) return 0;
  const s = it.stats;
  return (s.atk || 0) * 3 + (s.hp || 0) * 0.5 + (s.def || 0) * 2 + (s.mp || 0) * 0.3 +
         (s.crit || 0) * 8 + (s.speed || 0) * 4;
}

export function sellPrice(it) { return Math.round((it.lv * 3 + 5) * Math.pow(it.rarity + 1, 2)); }

// Thêm đồ vào túi. Trả về {kept:true} hoặc {kept:false, gold}
export function addItem(p, it) {
  if ((p.autoSellCommon && it.rarity === 0) || p.inventory.length >= INVENTORY_SIZE) {
    const g = sellPrice(it); p.gold += g;
    return { kept: false, gold: g };
  }
  p.inventory.push(it);
  return { kept: true };
}

export function sellItem(p, id) {
  const i = p.inventory.findIndex(x => x.id === id);
  if (i < 0) return 0;
  const g = sellPrice(p.inventory[i]);
  p.inventory.splice(i, 1); p.gold += g;
  return g;
}

export function sellAllCommon(p) {
  let g = 0, n = 0;
  p.inventory = p.inventory.filter(it => {
    if (it.rarity === 0) { g += sellPrice(it); n++; return false; }
    return true;
  });
  p.gold += g;
  return { n, g };
}

export function equipItem(p, id) {
  const i = p.inventory.findIndex(x => x.id === id);
  if (i < 0) return false;
  const it = p.inventory[i];
  if (it.lv > p.level + 5) return false; // đồ quá cấp
  const old = p.equip[it.slot];
  p.inventory.splice(i, 1);
  if (old) p.inventory.push(old);
  p.equip[it.slot] = it;
  return true;
}

export function unequip(p, slot) {
  const it = p.equip[slot];
  if (!it || p.inventory.length >= INVENTORY_SIZE) return false;
  p.equip[slot] = null; p.inventory.push(it);
  return true;
}

// ---------- Quái ----------
export function monsterStats(lv) {
  return { hp: 50 + 28 * lv, atk: 6 + 5 * lv, def: 2 + 1.5 * lv, exp: 10 + 8 * lv, gold: 3 + 2 * lv };
}

export function getMap(id) { return MAPS.find(m => m.id === id) || MAPS[0]; }

export function spawnMonster(p) {
  const map = getMap(p.mapId);
  const lv = clamp(randInt(p.level - 2, p.level + 1), map.min, map.max);
  const ms = monsterStats(lv);
  return { name: pick(map.monsters), lv, element: map.element, hp: ms.hp, maxHp: ms.hp, ...ms };
}

export function idleInterval(p) { return 1200 / (1 + 0.04 * (p.skills.nguyetanh || 0)); }

// Một lượt đánh treo máy. state = {mon, hp, restUntil}. Trả về {logs:[], changed}
export function idleRound(p, state, now) {
  const logs = [];
  const st = calcStats(p);
  if (state.hp == null || state.hp > st.hp) state.hp = st.hp;
  if (state.restUntil && now < state.restUntil) return { logs, changed: false };
  if (state.restUntil) { state.restUntil = 0; state.hp = st.hp; logs.push({ t: "Hồi phục xong, tiếp tục luyện công.", c: "info" }); }
  if (!state.mon) { state.mon = spawnMonster(p); logs.push({ t: `Gặp ${state.mon.name} Lv${state.mon.lv} (${ELEMENTS[state.mon.element].name})`, c: "dim" }); return { logs, changed: false }; }

  const mon = state.mon;
  // Người chơi đánh
  if (Math.random() < st.idleHit) {
    const eb = elementBonus(st.element, mon.element);
    let dmg = reduceByDef(nguyetDaoDamage(p, st) * eb, mon.def) * rand(0.9, 1.1);
    const crit = Math.random() * 100 < st.crit;
    if (crit) dmg *= 1.5;
    dmg = Math.max(1, Math.round(dmg));
    mon.hp -= dmg;
    logs.push({ t: `Nguyệt Đao chém ${mon.name} -${fmt(dmg)}${crit ? " (chí mạng)" : ""}${eb > 1 ? " (khắc +15%)" : ""}`, c: crit ? "crit" : "" });
  } else {
    logs.push({ t: `Đánh trượt ${mon.name}`, c: "dim" });
  }
  let changed = false;
  if (mon.hp <= 0) {
    const ups = gainExp(p, mon.exp);
    p.gold += mon.gold;
    logs.push({ t: `Tiêu diệt ${mon.name} · +${fmt(mon.exp)} EXP · +${fmt(mon.gold)} vàng`, c: "good" });
    if (Math.random() < 0.12) {
      const it = genItem(mon.lv, rollRarity(DROP_WEIGHTS_IDLE));
      const r = addItem(p, it);
      logs.push(r.kept
        ? { t: `Nhặt được [${RARITY[it.rarity].name}] ${it.name}`, c: "r" + it.rarity }
        : { t: `Tự bán [${RARITY[it.rarity].name}] ${it.name} +${r.gold} vàng`, c: "dim" });
    }
    ups.forEach(lv => logs.push({ t: `Lên cấp ${lv}! +1 điểm kỹ năng`, c: "level" }));
    state.mon = null;
    state.hp = Math.min(calcStats(p).hp, state.hp + calcStats(p).hp * 0.15);
    changed = true;
    return { logs, changed, levelUp: ups.length > 0 };
  }
  // Quái đánh lại
  const eb2 = elementBonus(mon.element, st.element);
  const mdmg = Math.max(1, Math.round(reduceByDef(mon.atk * eb2, st.def) * rand(0.85, 1.15)));
  state.hp -= mdmg;
  logs.push({ t: `Bị ${mon.name} đánh -${fmt(mdmg)}`, c: "bad" });
  if (state.hp <= 0) {
    state.hp = 0; state.mon = null; state.restUntil = now + 8000;
    logs.push({ t: "Trọng thương! Nghỉ 8 giây để hồi phục...", c: "bad" });
  } else {
    state.hp = Math.min(st.hp, state.hp + st.hp * 0.03);
  }
  return { logs, changed };
}

// ---------- Treo máy offline ----------
export function offlineGains(p, seconds) {
  seconds = Math.min(seconds, OFFLINE_MAX_HOURS * 3600);
  const map = getMap(p.mapId);
  const st = calcStats(p);
  const lv = clamp(p.level, map.min, map.max);
  const ms = monsterStats(lv);
  const eb = elementBonus(st.element, map.element);
  const dmg = reduceByDef(nguyetDaoDamage(p, st) * eb, ms.def) * st.idleHit * (1 + st.crit / 100 * 0.5);
  const rounds = Math.ceil(ms.hp / Math.max(1, dmg));
  const timePerKill = rounds * idleInterval(p) / 1000 + 1.2;
  const taken = reduceByDef(ms.atk * elementBonus(map.element, st.element), st.def) * rounds;
  const eff = taken > st.hp * 0.9 ? 0.4 : 1;
  const kills = Math.floor(seconds / timePerKill * eff);
  const res = { seconds, kills, exp: 0, gold: 0, levels: [], kept: [], sold: 0, soldGold: 0 };
  if (kills <= 0) return res;
  res.exp = kills * ms.exp; res.gold = kills * ms.gold;
  p.gold += res.gold;
  res.levels = gainExp(p, res.exp);
  const drops = Math.min(300, Math.round(kills * 0.12));
  for (let i = 0; i < drops; i++) {
    const it = genItem(lv, rollRarity(DROP_WEIGHTS_IDLE));
    if (it.rarity >= 1 && p.inventory.length < INVENTORY_SIZE && !(p.autoSellCommon && it.rarity === 0)) {
      p.inventory.push(it); res.kept.push(it);
    } else {
      const g = sellPrice(it); p.gold += g; res.sold++; res.soldGold += g;
    }
  }
  return res;
}

// ---------- Boss ----------
export function bossStats(map) {
  const lv = map.max;
  return { lv, hp: 150 * lv * lv + 4000, atk: 15 + 10 * lv, def: 3 + 2 * lv, element: map.element, name: map.boss };
}

export function bossRewards(p, map) {
  const lv = map.max;
  const ms = monsterStats(lv);
  const exp = ms.exp * 25, gold = ms.gold * 20;
  p.gold += gold;
  const levels = gainExp(p, exp);
  const n = 2 + (Math.random() < 0.4 ? 1 : 0);
  const items = [];
  for (let i = 0; i < n; i++) {
    const it = genItem(lv, rollRarity(DROP_WEIGHTS_BOSS));
    const r = addItem(p, it);
    items.push({ it, kept: r.kept, gold: r.gold });
  }
  return { exp, gold, levels, items };
}
