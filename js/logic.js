// ===== LOGIC: chỉ số, skill, trang bị, treo máy, thưởng, cửa hàng =====
import {
  GD, S, X, elemBonus, rarityOf, miscByKind, sectPathWeapon, BIKIP_SELL
} from "./data.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const fmt = n => Math.round(n).toLocaleString("vi-VN");
export const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString("vi-VN");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const PCT_ROUND = v => Math.round(v * 10) / 10;

export const SAVE_VERSION = 2;
const CAPS = { crit: 75, dodge: 60, cdr: 50, mspd: 100 };

// ================= NHÂN VẬT =================
export function newPlayer(name, gender, sect) {
  const p = {
    version: SAVE_VERSION, name, gender, sect,
    level: 1, exp: 0, gold: 0, skillPoints: 1, gemsSpent: 0,
    skills: {}, bikip: {},
    equip: Object.fromEntries(X.slotOrder.map(s => [s, null])),
    bag: [], misc: {}, books: {},
    hot: {}, mapId: X.maps[0].id, mapUnlocked: 1, beaten: {},
    autoSellCommon: false, createdAt: Date.now(), lastSeen: Date.now(),
    ctrl: "A", gfx: "cao", showFps: false
  };
  // chưa học chiêu nào: 2 điểm skill (= cấp + 1) để tự chọn đường
  p.skillPoints = 2;
  // 2 vũ khí khởi đầu của 2 đường nằm sẵn trong túi
  [1, 2].forEach(path => {
    const wt = sectPathWeapon(sect, path);
    const tpl = GD.items.filter(t => t.slot === "weapon" && t.weaponType === wt).sort((a, b) => a.lvFrom - b.lvFrom)[0];
    if (tpl && !p.bag.some(it => it.wt === wt)) p.bag.push(makeItem(tpl, 0, tpl.lvFrom));
  });
  // quà khởi đầu: Lễ bao tân thủ (thuốc, ngọc, vũ khí Huyền thoại tự chọn) — bản 2.3
  const cure = miscByKind("cure")[0];
  giveNewbieBox(p);
  defaultHotkeys(p);
  if (cure) p.hot[3] = cure.id;
  return p;
}
// tặng Lễ bao tân thủ 1 lần cho mỗi nhân vật (cả nhân vật tạo trước bản 2.3)
export function giveNewbieBox(p) {
  if (p.newbieGiven) return false;
  const box = miscByKind("newbie")[0];
  if (!box) return false;
  p.misc[box.id] = (p.misc[box.id] || 0) + 1;
  p.newbieGiven = true;
  return true;
}
// Mở Lễ bao tân thủ: wt = loại vũ khí chọn (1 trong 2 vũ khí của phái)
export function openNewbieBox(p, wt) {
  const box = miscByKind("newbie")[0];
  if (!box || !(p.misc[box.id] > 0)) return { err: "Không có Lễ bao tân thủ." };
  const lv = S.newbieWeaponLv ?? 10, rar = Math.min(X.rarity.length - 1, S.newbieWeaponRar ?? 3);
  const tpl = GD.items.filter(t => t.slot === "weapon" && t.weaponType === wt && t.lvFrom <= lv).sort((a, b) => b.lvFrom - a.lvFrom)[0];
  if (!tpl) return { err: "Không tìm thấy vũ khí loại này." };
  if (p.bag.length >= (S.invSize || 50)) return { err: "Túi trang bị đã đầy." };
  const got = [];
  const add = (kind, qty) => { const m = miscByKind(kind)[0]; if (m && qty > 0) { p.misc[m.id] = (p.misc[m.id] || 0) + qty; got.push(`${m.name} ×${qty}`); } };
  useMisc(p, box.id);
  add("skillup", S.newbieGems ?? 10); add("hp", S.newbieHp ?? 10); add("mp", S.newbieMp ?? 10);
  const it = makeItem(tpl, rar, lv);
  p.bag.push(it);
  return { item: it, got };
}
// Thiên Sơn Tuyết Liên: lên ngay 1 cấp, giữ % kinh nghiệm, mỗi loại tối đa useLimit bông mỗi nhân vật
export function lotusCheck(p, m) {
  const used = (p.lotus || {})[m.id] || 0, lim = m.useLimit || 3, maxLv = S.maxLevel || 99;
  if (used >= lim) return `Mỗi nhân vật chỉ dùng tối đa ${lim} bông loại này.`;
  if (p.level >= maxLv) return "Đã đạt cấp tối đa.";
  if (p.level >= (m.useBelow || 100)) return `Chỉ dùng được khi dưới cấp ${m.useBelow}.`;
  return "";
}
export function useLotus(p, id) {
  const m = X.misc[id];
  if (!m || m.kind !== "levelup") return { err: "Không dùng được." };
  if (!(p.misc[id] > 0)) return { err: "Không có vật phẩm này." };
  const e = lotusCheck(p, m); if (e) return { err: e };
  const ratio = Math.min(0.999, Math.max(0, p.exp / expToNext(p.level)));
  useMisc(p, id);
  p.level++; p.skillPoints++;
  p.exp = Math.floor(ratio * expToNext(p.level));
  p.lotus = { ...(p.lotus || {}), [id]: ((p.lotus || {})[id] || 0) + 1 };
  return { level: p.level };
}

export function defaultHotkeys(p) {
  const firstOwned = kind => (miscByKind(kind).find(m => (p.misc[m.id] || 0) > 0) || miscByKind(kind)[0] || {}).id;
  if (!p.hot[1]) p.hot[1] = firstOwned("hp");
  if (!p.hot[2]) p.hot[2] = firstOwned("mp");
  if (!p.hot[3]) p.hot[3] = firstOwned("cure");
}

// Bổ sung trường còn thiếu, bỏ đồ không còn trong data
export function normalizePlayer(p) {
  p.skills ||= {}; p.bikip ||= {}; p.misc ||= {}; p.books ||= {}; p.hot ||= {}; p.beaten ||= {};
  p.bag ||= []; p.equip ||= {};
  X.slotOrder.forEach(s => { if (p.equip[s] === undefined) p.equip[s] = null; });
  for (const k in p.skills) if (!X.skill[k]) delete p.skills[k];
  for (const k in p.misc) if (!X.misc[k]) delete p.misc[k];
  for (const k in p.books) if (!X.bikip[k]) delete p.books[k];
  const valid = it => it && (it.gold ? X.goldItem[it.gold] : true);
  p.bag = p.bag.filter(valid);
  X.slotOrder.forEach(s => { if (!valid(p.equip[s])) p.equip[s] = null; });
  if (!X.map[p.mapId]) p.mapId = X.maps[0].id;
  p.mapUnlocked = Math.max(1, p.mapUnlocked || 1);
  p.gemsSpent ||= 0;
  p.ctrl = p.ctrl === "B" ? "B" : "A";
  p.gfx = p.gfx === "thap" ? "thap" : "cao";
  p.showFps = !!p.showFps;
  p.lotus ||= {};
  giveNewbieBox(p);
  defaultHotkeys(p);
  return p;
}

// Đã học chiêu chính (chuột trái) của đường nào chưa
export function hasMainSkill(p) {
  const o = X.skillOf[p.sect] || {};
  return [1, 2].some(path => o[path] && o[path].lmb && p.skills[o[path].lmb.id]);
}

export function expToNext(lv) { return Math.floor((S.expBase || 100) * Math.pow(lv, S.expPow || 2.2)); }

export function gainExp(p, amount) {
  p.exp += Math.round(amount);
  const ups = [], maxLv = S.maxLevel || 99;
  while (p.level < maxLv && p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++; p.skillPoints++;
    ups.push(p.level);
  }
  if (p.level >= maxLv) p.exp = Math.min(p.exp, expToNext(p.level));
  return ups;
}

// ================= TRANG BỊ =================
export function itemStats(it) {
  if (!it) return {};
  if (it.gold) {
    const g = X.goldItem[it.gold]; const o = {};
    (g ? g.stats : []).forEach(s => o[s.stat] = (o[s.stat] || 0) + s.v);
    return o;
  }
  const o = { ...it.main };
  (it.aff || []).forEach(a => o[a.s] = (o[a.s] || 0) + a.v);
  return o;
}
export function itemImg(it) {
  if (!it) return "";
  if (it.gold) return (X.goldItem[it.gold] || {}).img || "";
  return (X.item[it.tpl] || {}).img || "";
}
export function itemWeaponType(it) {
  if (!it || it.slot !== "weapon") return "";
  if (it.gold) return (X.goldItem[it.gold] || {}).weaponType || "";
  return it.wt || (X.item[it.tpl] || {}).weaponType || "";
}
export function equippedWeapon(p) { return itemWeaponType(p.equip.weapon); }

function rollStat(stat, v) {
  if ((X.stat[stat] || {}).unit === "%") return PCT_ROUND(v);
  return Math.max(1, Math.round(v));
}

export function makeItem(tpl, rIdx, lv) {
  const r = rarityOf(rIdx), mul = (r.mul || 100) / 100;
  const ilv = clamp(Math.round(lv), tpl.lvFrom, tpl.lvTo);
  const main = {};
  tpl.main.forEach(m => main[m.stat] = rollStat(m.stat, (m.base + m.per * (ilv - tpl.lvFrom)) * mul));
  const aff = [];
  const pool = GD.affixes.filter(a => (!a.slots.length || a.slots.includes(tpl.slot)) && (X.rarIdx[a.minRarity] ?? 0) <= rIdx);
  const n = r.affix || 0;
  for (let i = 0; i < n && pool.length; i++) {
    const k = Math.floor(Math.random() * pool.length);
    const a = pool.splice(k, 1)[0];
    let v = (a.base + a.per * ilv) * rand(0.6, 1.0);
    v = a.stat === "allSkills" ? Math.max(1, Math.round(v)) : rollStat(a.stat, v);
    aff.push({ s: a.stat, v });
  }
  return { id: uid(), tpl: tpl.id, slot: tpl.slot, wt: tpl.weaponType || "", r: rIdx, lv: ilv, name: tpl.name, main, aff };
}

export function makeGoldItem(g) {
  return { id: uid(), gold: g.id, slot: g.slot, wt: g.weaponType || "", r: X.goldRar, lv: g.lv, name: g.name, main: {}, aff: [] };
}

export function rollRarity(source) {
  const key = source === "mob" ? "wMob" : source === "boss" ? "wBoss" : "wGold";
  const w = X.rarity.map((r, i) => (i === X.goldRar ? 0 : Math.max(0, r[key] || 0)));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let x = Math.random() * total;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return 0;
}

export function genItem(lv, source) {
  let tpls = GD.items.filter(t => t.sources.includes(source) && t.lvFrom <= lv && lv <= t.lvTo);
  if (!tpls.length) {   // không có mẫu đúng cấp: lấy bậc cao nhất thấp hơn cấp
    const lower = GD.items.filter(t => t.lvFrom <= lv);
    const best = {};
    lower.forEach(t => { const k = t.slot + (t.weaponType || ""); if (!best[k] || best[k].lvFrom < t.lvFrom) best[k] = t; });
    tpls = Object.values(best);
  }
  if (!tpls.length) return null;
  // chọn ô trước (các ô chia đều), rồi chọn loại vũ khí (chia đều), rồi mới chọn món
  const slot = pick([...new Set(tpls.map(t => t.slot))]);
  let cands = tpls.filter(t => t.slot === slot);
  if (slot === "weapon") {
    const wt = pick([...new Set(cands.map(t => t.weaponType || ""))]);
    cands = cands.filter(t => (t.weaponType || "") === wt);
  }
  return makeItem(pick(cands), rollRarity(source), lv);
}

export function sellPrice(it) {
  if (it.gold) return Math.round(it.lv * 400);
  return Math.round((it.lv * 3 + 5) * Math.pow(it.r + 1, 2));
}

export function canEquipLevel(p, it) { return it.lv <= p.level + (S.maxOverLevel ?? 0); }

export function addItem(p, it, logs) {
  const full = p.bag.length >= (S.invSize || 50);
  if ((p.autoSellCommon && it.r === 0 && !it.gold) || full) {
    const g = sellPrice(it); p.gold += g;
    return { kept: false, gold: g };
  }
  p.bag.push(it);
  return { kept: true };
}

export function sellItem(p, id) {
  const i = p.bag.findIndex(x => x.id === id);
  if (i < 0 || p.bag[i].lock) return 0;
  const g = sellPrice(p.bag[i]);
  p.bag.splice(i, 1); p.gold += g;
  return g;
}

// Bán nhanh theo độ hiếm: bỏ qua đồ khóa và đồ Hoàng Kim
const quickSellable = (it, r) => it.r === r && !it.gold && !it.lock;
export function previewSellRarity(p, r) {
  const list = p.bag.filter(it => quickSellable(it, r));
  return { n: list.length, g: list.reduce((a, it) => a + sellPrice(it), 0) };
}
export function sellAllRarity(p, r) {
  const res = previewSellRarity(p, r);
  p.bag = p.bag.filter(it => !quickSellable(it, r));
  p.gold += res.g;
  return res;
}
export function sellAllCommon(p) { return sellAllRarity(p, 0); }

export function toggleLock(p, id) {
  const it = p.bag.find(x => x.id === id) || X.slotOrder.map(s => p.equip[s]).find(x => x && x.id === id);
  if (!it) return false;
  it.lock = !it.lock;
  if (!it.lock) delete it.lock;
  return !!it.lock;
}

export function equipItem(p, id) {
  const i = p.bag.findIndex(x => x.id === id);
  if (i < 0) return "Không tìm thấy món đồ.";
  const it = p.bag[i];
  if (!canEquipLevel(p, it)) return `Cần cấp ${it.lv - (S.maxOverLevel ?? 0)} để mặc.`;
  const old = p.equip[it.slot];
  p.bag.splice(i, 1);
  if (old) p.bag.push(old);
  p.equip[it.slot] = it;
  return "";
}

export function unequip(p, slot) {
  const it = p.equip[slot];
  if (!it) return "";
  if (p.bag.length >= (S.invSize || 50)) return "Túi trang bị đã đầy.";
  p.equip[slot] = null; p.bag.push(it);
  return "";
}

// ================= TÚI VẬT PHẨM =================
export function miscSlotsUsed(p) {
  let n = 0;
  for (const id in p.misc) { const m = X.misc[id]; if (m && p.misc[id] > 0) n += Math.ceil(p.misc[id] / Math.max(1, m.stack || 1)); }
  for (const id in p.books) if (p.books[id] > 0) n += 1;
  return n;
}
export function miscSpaceFor(p, id, qty) {
  const m = X.misc[id]; if (!m) return false;
  const st = Math.max(1, m.stack || 1), have = p.misc[id] || 0;
  const extra = Math.ceil((have + qty) / st) - Math.ceil(have / st);
  return miscSlotsUsed(p) + extra <= (S.invMiscSize || 30);
}
export function addMisc(p, id, qty) {
  if (!miscSpaceFor(p, id, qty)) return false;
  p.misc[id] = (p.misc[id] || 0) + qty;
  return true;
}
export function useMisc(p, id, qty = 1) {
  if ((p.misc[id] || 0) < qty) return false;
  p.misc[id] -= qty;
  if (p.misc[id] <= 0) delete p.misc[id];
  return true;
}
export function countKind(p, kind) { return miscByKind(kind).reduce((a, m) => a + (p.misc[m.id] || 0), 0); }
function useKind(p, kind, qty) {
  let need = qty;
  for (const m of miscByKind(kind)) {
    const take = Math.min(need, p.misc[m.id] || 0);
    if (take) { useMisc(p, m.id, take); need -= take; }
    if (!need) break;
  }
  return need === 0;
}
export function addBook(p, bkId) {
  if (!p.books[bkId] && miscSlotsUsed(p) + 1 > (S.invMiscSize || 30)) return false;
  p.books[bkId] = (p.books[bkId] || 0) + 1;
  return true;
}

export function buy(p, id, qty) {
  const m = X.misc[id];
  qty = Math.max(1, Math.round(qty || 1));
  if (!m || !m.shop) return "Món này không bán ở cửa hàng.";
  const cost = (m.price || 0) * qty;
  if (cost > p.gold) return `Không đủ vàng: cần ${fmt(cost)}.`;
  if (!addMisc(p, id, qty)) return "Túi vật phẩm đã đầy.";
  p.gold -= cost;
  return "";
}

// ================= BÍ KÍP =================
export function readBook(p, bkId) {
  const b = X.bikip[bkId];
  if (!b || !p.books[bkId]) return "Không có bí kíp này.";
  if (b.sect !== p.sect) return "Bí kíp phái khác, chỉ bán được.";
  const lv = p.bikip[bkId] || 0;
  if (lv >= (b.maxLv || S.bikipMaxLv || 3)) return "Bí kíp đã đạt cấp tối đa.";
  p.books[bkId]--; if (p.books[bkId] <= 0) delete p.books[bkId];
  p.bikip[bkId] = lv + 1;
  return "";
}
export function sellBook(p, bkId) {
  const b = X.bikip[bkId];
  if (!b || !p.books[bkId]) return 0;
  p.books[bkId]--; if (p.books[bkId] <= 0) delete p.books[bkId];
  const g = BIKIP_SELL[b.tier] || 1000; p.gold += g;
  return g;
}

// ================= KỸ NĂNG =================
export function skillBonusLevels(p) {
  const out = {}; let all = 0;
  X.slotOrder.forEach(s => {
    const it = p.equip[s]; if (!it) return;
    all += itemStats(it).allSkills || 0;
    if (it.gold) {
      const g = X.goldItem[it.gold];
      if (g && g.sect === p.sect) (g.skills || []).forEach(x => out[x.skill] = (out[x.skill] || 0) + x.lv);
    }
  });
  return { all, per: out };
}

export function skillLevel(p, id, bonus) {
  const base = p.skills[id] || 0;
  if (!base) return 0;
  bonus ||= skillBonusLevels(p);
  return base + bonus.all + (bonus.per[id] || 0);
}

// Số liệu skill ở cấp hiện tại (đã cộng bị động). Trả null nếu chưa học.
export function skillCalc(p, id, st, bonus) {
  const sk = X.skill[id]; if (!sk) return null;
  const lv = skillLevel(p, id, bonus);
  if (!lv) return null;
  const L = lv - 1;
  const bst = { dmg: 0, aspd: 0, cd: 0, size: 0, dur: 0, count: 0, mp: 0, effectChance: 0, crit: 0, critdmg: 0 };
  GD.skills.forEach(ps => {
    if (ps.sect !== sk.sect || ps.target !== id || (ps.slot !== "p1" && ps.slot !== "p2")) return;
    if (ps.mech === "aura_while") return;   // tăng cường có điều kiện: trận đánh tự cộng
    const pl = skillLevel(p, ps.id, bonus);
    if (pl) (ps.boosts || []).forEach(b => bst[b.attr] = (bst[b.attr] || 0) + b.per * pl);
  });
  const aspdStat = st ? st.aspd || 0 : 0, cdr = st ? st.cdr || 0 : 0;
  return {
    sk, id, lv,
    dmg: (sk.dmg + sk.dmgLv * L) * (1 + bst.dmg / 100),
    flat: (sk.flatDmg || 0) + (sk.flatDmgLv || 0) * L,
    aspd: sk.aspd * (1 + (bst.aspd + aspdStat) / 100),
    cd: sk.cd ? Math.max(0.5, (sk.cd - sk.cdLv * L) * (1 + bst.cd / 100) * (1 - cdr / 100)) : 0,
    mp: (sk.slot === "rmb" || sk.slot === "q")      // bản 2.4: chiêu chính miễn phí; chiêu phụ, Q = gốc + cấp nhân vật × hệ số của phái
      ? Math.max(0, Math.round((sk.mp + (p.level || 1) * ((X.sect[sk.sect] || {}).mpPerLv || 0)) * (1 + bst.mp / 100))) : 0,
    dur: (sk.dur + sk.durLv * L) * (1 + bst.dur / 100),
    size: (sk.size + sk.sizeLv * L) * (1 + bst.size / 100),
    count: Math.max(1, Math.floor(sk.count + sk.countLv * L + bst.count + 1e-9)),
    effect: sk.effect || "",
    effectChance: sk.effectChance + sk.effectChanceLv * L + bst.effectChance,
    crit: bst.crit, critdmg: bst.critdmg,
    stats: (sk.stats || []).map(x => ({ stat: x.stat, v: x.base + x.per * L }))
  };
}

// Đường đang dùng = đường có vũ khí trùng vũ khí đang cầm
export function activePath(p) {
  const w = equippedWeapon(p), s = X.sect[p.sect];
  if (s && w && s.weapon2 === w && s.weapon1 !== w) return 2;
  return 1;
}
export function weaponOk(p, sk) { return !sk.weapon || sk.weapon === equippedWeapon(p); }

// Bản 2.2: mỗi skill có thêm 3 tầng sau cấp tối đa gốc; mỗi tầng tốn 2 điểm và gấp đôi ngọc
export function skillMaxLv(sk) { return (sk.maxLv || 10) + (S.skillExtraTiers ?? 3); }
export function upgradeCost(p, id) {
  const lv = p.skills[id] || 0, sk = X.skill[id], extra = sk && lv >= (sk.maxLv || 10);
  const gems = lv === 0 ? 0 : lv * (S.skillGemMul ?? 1) * (extra ? (S.skillExtraGemMul ?? 2) : 1);
  return { points: extra ? (S.skillExtraPoints ?? 2) : 1, gems, extra };
}
export function upgradeSkill(p, id) {
  const sk = X.skill[id];
  if (!sk || sk.sect !== p.sect) return "Không phải skill của phái.";
  const lv = p.skills[id] || 0;
  if (lv >= skillMaxLv(sk)) return "Đã đạt cấp tối đa.";
  const c = upgradeCost(p, id);
  if (p.skillPoints < c.points) return c.extra ? `Tầng này cần ${c.points} điểm skill.` : "Hết điểm skill. Lên cấp để có thêm điểm.";
  if (countKind(p, "skillup") < c.gems) return `Thiếu ngọc: cần ${c.gems} viên ${(miscByKind("skillup")[0] || {}).name || "ngọc nâng skill"}.`;
  if (c.gems) useKind(p, "skillup", c.gems);
  p.skillPoints -= c.points; p.gemsSpent += c.gems;
  p.skills[id] = lv + 1;
  return "";
}
export function resetSkills(p) {
  if (countKind(p, "reset") < 1) return `Cần 1 ${(miscByKind("reset")[0] || {}).name || "ngọc reset"} (mua ở cửa hàng).`;
  const gemsBack = Math.floor(p.gemsSpent * (S.resetRefund ?? 100) / 100);
  const gem = miscByKind("skillup")[0];
  if (gemsBack && gem && !miscSpaceFor(p, gem.id, gemsBack)) return "Túi vật phẩm đầy, không trả lại ngọc được.";
  useKind(p, "reset", 1);
  if (gemsBack && gem) addMisc(p, gem.id, gemsBack);
  p.skills = {}; p.gemsSpent = 0;
  p.skillPoints = p.level + 1;
  return "";
}

// ================= CHỈ SỐ =================
export function calcStats(p, extra) {
  const sect = X.sect[p.sect], lv = p.level, g = X.gender[p.gender] || {};
  const s = {
    atk: sect.atkBase + sect.atkLv * (lv - 1), hp: sect.hpBase + sect.hpLv * (lv - 1),
    mp: sect.mpBase + sect.mpLv * (lv - 1), def: sect.defBase + sect.defLv * (lv - 1),
    crit: 5, critdmg: 0
  };
  const add = (k, v) => { s[k] = (s[k] || 0) + v; };
  X.slotOrder.forEach(sl => { const st = itemStats(p.equip[sl]); for (const k in st) add(k, st[k]); });
  for (const id in p.bikip) {
    const b = X.bikip[id], l = p.bikip[id];
    if (b && l > 0) b.stats.forEach(x => add(x.stat, x["v" + Math.min(3, l)] || 0));
  }
  const bonus = skillBonusLevels(p);
  GD.skills.forEach(sk => {      // bị động cộng chỉ số
    if (sk.sect !== p.sect || sk.mech !== "passive_stat") return;
    const l = skillLevel(p, sk.id, bonus);
    if (l) (sk.stats || []).forEach(x => add(x.stat, x.base + x.per * (l - 1)));
  });
  if (extra) for (const k in extra) add(k, extra[k]);
  s.hp = Math.round(s.hp * (1 + (s.hpPct || 0) / 100));
  s.mp = Math.round(s.mp * (1 + (s.mpPct || 0) / 100));
  s.atk = Math.round(s.atk * (1 + (s.atkPct || 0) / 100));
  s.def = Math.round(s.def * (1 + (s.defPct || 0) / 100));
  for (const k in CAPS) if (s[k] > CAPS[k]) s[k] = CAPS[k];
  s.manaShield = Math.min(S.manaShieldCap ?? 80, (sect.manaShield || 0) + (s.manaShield || 0));
  s.reflect = Math.min(S.reflectCap ?? 50, s.reflect || 0);
  s.mpRegenSec = (S.mpRegenFlat ?? 5) + (sect.mpRegen || 0) * s.mp / 100 + (s.mpregen || 0);
  s.hpRegenSec = s.hpregen || 0;
  s.dmgBonus = g.dmgBonus || 0; s.spread = g.spread ?? 10; s.idleHit = (g.idleHit ?? 90) / 100; s.homing = !!g.homing;
  s.element = sect.element;
  return s;
}

// Giảm sát thương theo phòng thủ, có tính cấp người đánh
export function mitigate(def, attackerLv) { return 1 - def / (def + 10 * attackerLv + 100); }

export function critRoll(st, sc) { return Math.random() * 100 < (st.crit || 0) + (sc ? sc.crit : 0); }
export function critMul(st, sc) { return 1.5 + ((st.critdmg || 0) + (sc ? sc.critdmg : 0)) / 100; }

// Sát thương 1 đòn skill lên mục tiêu (chưa trừ phòng thủ)
export function rawSkillDamage(st, sc, targetElem, isBoss) {
  let d = st.atk * sc.dmg / 100 + sc.flat;
  d *= 1 + (st.dmgBonus || 0) / 100;
  const eb = elemBonus(st.element, targetElem);
  if (eb > 1) d *= eb + (st.counterDmg || 0) / 100;
  if (isBoss) d *= 1 + (st.bossDmg || 0) / 100;
  return d;
}

export function damageTaken(raw, attElem, attLv, st) {
  let d = raw;
  const eb = elemBonus(attElem, st.element);
  if (eb > 1) d *= Math.max(1, eb - (st.counterRes || 0) / 100);
  return d * mitigate(st.def, attLv);
}

// ================= MAP & QUÁI =================
export function getMap(id) { return X.map[id] || X.maps[0]; }
export function mapUnlocked(p, map) { return map.order <= p.mapUnlocked; }

export function monsterBase(lv) {
  return { hp: 50 + 28 * lv, atk: 6 + 5 * lv, def: 2 + 1.5 * lv, exp: 10 + 8 * lv, gold: 3 + 2 * lv };
}
export function levelPenalty(pLv, mLv) {
  const d = pLv - mLv;
  return d <= 3 ? 1 : Math.max(0.1, 1 - 0.15 * (d - 3));
}
// Bản 2.3: quái cao cấp hơn mình thì kinh nghiệm thêm overLevelExpPer % mỗi cấp (tối đa overLevelExpMax %)
export function overLevelBonus(pLv, mLv) {
  const d = mLv - pLv;
  return d > 0 ? 1 + Math.min(S.overLevelExpMax ?? 200, d * (S.overLevelExpPer ?? 10)) / 100 : 1;
}
const mobKinds = map => X.monOf[map.id] || [{ name: "Thổ phỉ", element: map.element, hpMul: 100, atkMul: 100, expMul: 100 }];
// Chỉ số 1 con quái: hệ số máu / sát thương / kinh nghiệm theo từng map (editor → Map), vàng = giá trị khi có rơi
export function mobStats(p, map, k, lv) {
  const b = monsterBase(lv), pen = levelPenalty(p.level, lv), over = overLevelBonus(p.level, lv);
  const hp = Math.round(b.hp * (k.hpMul ?? 100) / 100 * (map.mobHp ?? 100) / 100);
  return {
    id: k.id, name: k.name, img: k.img || "", lv, element: k.element || map.element, hp, maxHp: hp,
    atk: b.atk * (k.atkMul ?? 100) / 100 * (map.mobAtk ?? 100) / 100, def: b.def,
    exp: Math.round(b.exp * (k.expMul || 100) / 100 * (map.mobExp ?? 100) / 100 * pen * over),
    gold: Math.round(b.gold * (S.mobGoldMul ?? 50) / 100 * pen), pen, over
  };
}
export function spawnMonster(p) {
  const map = getMap(p.mapId);
  const lv = clamp(randInt(p.level - 2, p.level + 1), map.lvFrom, map.lvTo);
  const m = mobStats(p, map, pick(mobKinds(map)), lv);
  if (!(Math.random() * 100 < (S.mobGoldChance ?? 70))) m.gold = 0;      // không phải con nào cũng rơi vàng
  return m;
}

// Skill chuột trái đang dùng được (theo vũ khí). null = đánh tay không
export function idleAttack(p, st) {
  const path = activePath(p);
  const sk = (X.skillOf[p.sect] && X.skillOf[p.sect][path] || {}).lmb;
  if (sk && p.skills[sk.id] && weaponOk(p, sk)) return skillCalc(p, sk.id, st);
  return { sk: { name: "Đánh tay không" }, dmg: 50, flat: 0, aspd: 1, crit: 0, critdmg: 0, effectChance: 0, effect: "" };
}

export const IDLE_TICK = 1200;

// 1 lượt treo máy (1,2 giây). state = {mon, hp, restUntil}
export function idleRound(p, state, now) {
  const logs = [];
  const st = calcStats(p);
  if (state.hp == null || state.hp > st.hp) state.hp = st.hp;
  if (state.restUntil && now < state.restUntil) return { logs, changed: false };
  if (state.restUntil) { state.restUntil = 0; state.hp = st.hp; logs.push({ t: "Hồi phục xong, tiếp tục luyện công.", c: "info" }); }
  if (!state.mon) {
    state.mon = spawnMonster(p);
    const m = state.mon;
    logs.push({ t: `Gặp ${m.name} Lv${m.lv}${m.pen < 1 ? ` (quái thấp cấp, kinh nghiệm còn ${Math.round(m.pen * 100)}%)` : m.over > 1 ? ` (quái cao cấp hơn, kinh nghiệm +${Math.round((m.over - 1) * 100)}%)` : ""}`, c: "dim" });
    return { logs, changed: false };
  }
  const mon = state.mon, sc = idleAttack(p, st);
  const hits = Math.max(1, Math.round(sc.aspd * IDLE_TICK / 1000));
  let total = 0, crits = 0, landed = 0;
  for (let i = 0; i < hits; i++) {
    if (Math.random() > st.idleHit) continue;
    landed++;
    let d = rawSkillDamage(st, sc, mon.element, false) * mitigate(mon.def, p.level) * rand(0.9, 1.1);
    if (critRoll(st, sc)) { d *= critMul(st, sc); crits++; }
    total += d;
  }
  total = Math.round(total);
  if (landed) {
    mon.hp -= total;
    if (st.lifesteal) state.hp = Math.min(st.hp, state.hp + total * st.lifesteal / 100);
    logs.push({ t: `${sc.sk.name}${landed > 1 ? " ×" + landed : ""} trúng ${mon.name} -${fmt(total)}${crits ? ` (${crits} chí mạng)` : ""}`, c: crits ? "crit" : "" });
  } else logs.push({ t: `Đánh trượt ${mon.name}`, c: "dim" });

  if (mon.hp <= 0) {
    const ups = gainExp(p, mon.exp);
    p.gold += mon.gold;
    logs.push({ t: `Tiêu diệt ${mon.name} · +${fmt(mon.exp)} EXP${mon.gold ? ` · +${fmt(mon.gold)} vàng` : ""}`, c: "good" });
    if (Math.random() * 100 < (S.mobDropChance ?? 12)) {
      const it = genItem(mon.lv, "mob");
      if (it) {
        const blue = p.autoSellBlue && it.r === 1 && !it.gold;     // bản 2.4: treo máy không nhặt đồ xanh → tự bán
        const r = blue ? { kept: false, gold: sellPrice(it) } : addItem(p, it);
        if (blue) p.gold += r.gold;
        const rn = rarityOf(it.r).name;
        logs.push(r.kept ? { t: `Nhặt được [${rn}] ${it.name} Lv${it.lv}`, c: "r" + it.r }
          : { t: `Tự bán [${rn}] ${it.name} +${fmt(r.gold)} vàng`, c: "dim" });
      }
    }
    ups.forEach(lv => logs.push({ t: `Lên cấp ${lv}! +1 điểm skill`, c: "level" }));
    state.mon = null;
    state.hp = Math.min(st.hp, state.hp + st.hp * 0.15);
    return { logs, changed: true, levelUp: ups.length > 0 };
  }
  // quái đánh lại
  if (Math.random() * 100 < (st.dodge || 0)) {
    logs.push({ t: `Né được đòn của ${mon.name}`, c: "info" });
  } else {
    const md = Math.max(1, Math.round(damageTaken(mon.atk, mon.element, mon.lv, st) * rand(0.85, 1.15)));
    state.hp -= md;
    logs.push({ t: `Bị ${mon.name} đánh -${fmt(md)}`, c: "bad" });
  }
  if (state.hp <= 0) {
    state.hp = 0; state.mon = null; state.restUntil = now + 8000;
    logs.push({ t: "Trọng thương! Nghỉ 8 giây để hồi phục...", c: "bad" });
  } else {
    state.hp = Math.min(st.hp, state.hp + st.hp * 0.03 + st.hpRegenSec * IDLE_TICK / 1000);
  }
  return { logs, changed: false };
}

// Treo máy khi vắng mặt (bản 2.3): tính đúng như lúc mở web — từng loại quái, từng cấp quái có thể gặp,
// số lượt đánh, đòn quái đánh lại, chết thì nghỉ 8 giây
// noCap = true: đang mở web (tab bị trình duyệt cho chạy chậm), không giới hạn giờ
export function idleRates(p) {
  const map = getMap(p.mapId), st = calcStats(p), sc = idleAttack(p, st), R = IDLE_TICK / 1000;
  const hits = Math.max(1, Math.round(sc.aspd * IDLE_TICK / 1000));
  const crit = 1 + Math.min(75, (st.crit || 0) + (sc.crit || 0)) / 100 * (critMul(st, sc) - 1);
  const regen = st.hp * 0.03 + (st.hpRegenSec || 0) * R, dodge = Math.min(60, st.dodge || 0) / 100;
  let T = 0, E = 0, G = 0, K = 0, D = 0;
  for (let l = p.level - 2; l <= p.level + 1; l++) {
    const lv = clamp(l, map.lvFrom, map.lvTo);
    for (const k of mobKinds(map)) {
      const m = mobStats(p, map, k, lv);
      const perRound = rawSkillDamage(st, sc, m.element, false) * mitigate(m.def, p.level) * hits * st.idleHit * crit;
      const rounds = Math.max(1, Math.ceil(m.hp / Math.max(1, perRound)));
      const hit = damageTaken(m.atk, m.element, m.lv, st) * (1 - dodge);
      const fight = Math.max(0, (hit - regen) * (rounds - 1));          // máu mất trong 1 trận
      const tKill = (rounds + 1) * R;                                     // 1 lượt gặp quái + các lượt đánh
      if (fight >= st.hp) {                                               // đánh không lại: chết rồi nghỉ, không có gì
        T += (Math.ceil(st.hp / Math.max(1, hit - regen)) + 1) * R + 8.4; D++; continue;
      }
      const net = fight - st.hp * 0.15;                                   // hạ xong hồi 15% máu
      const perLife = net > 0 ? Math.max(1, (st.hp - fight) / net + 1) : Infinity;
      const extra = perLife === Infinity ? 0 : (tKill / 2 + 8.4) / perLife; // trận chết dở + nghỉ, chia đều cho các con
      T += tKill + extra; E += m.exp; G += m.gold * (S.mobGoldChance ?? 70) / 100; K++;
      if (perLife !== Infinity) D += 1 / perLife;
    }
  }
  return { perSec: { kills: K / T, exp: E / T, gold: G / T, deaths: D / T }, map };
}
export function offlineGains(p, seconds, noCap = false) {
  if (!noCap) seconds = Math.min(seconds, (S.offlineHours ?? 24) * 3600);
  const { perSec, map } = idleRates(p);
  const lv = clamp(p.level, map.lvFrom, map.lvTo);
  const kills = Math.floor(seconds * perSec.kills);
  const res = { seconds, kills, exp: 0, gold: 0, levels: [], kept: [], sold: 0, soldGold: 0, deaths: Math.round(seconds * perSec.deaths) };
  if (kills <= 0) return res;
  res.exp = Math.round(seconds * perSec.exp); res.gold = Math.round(seconds * perSec.gold);
  p.gold += res.gold;
  res.levels = gainExp(p, res.exp);
  const drops = Math.min(300, Math.round(kills * (S.mobDropChance ?? 12) / 100));
  for (let i = 0; i < drops; i++) {
    const it = genItem(lv, "mob"); if (!it) continue;
    const keep = it.r >= 1 && !(p.autoSellBlue && it.r === 1) && p.bag.length < (S.invSize || 50);
    if (keep) { p.bag.push(it); res.kept.push(it); }
    else { const g = sellPrice(it); p.gold += g; res.sold++; res.soldGold += g; }
  }
  return res;
}

// ================= BOSS =================
export function bossCanFight(p, kind, b) {
  if (kind === "map") return mapUnlocked(p, getMap(b.map)) ? "" : "Chưa mở map này.";
  const m = X.map[b.unlock];
  if (m && !mapUnlocked(p, m)) return `Mở ${m.name} trước.`;
  const tk = miscByKind("ticket").find(t => t.bossTier === b.tier);
  if (tk && !(p.misc[tk.id] > 0)) return `Cần 1 ${tk.name} (mua ở cửa hàng).`;
  return "";
}
export function ticketFor(b) { return miscByKind("ticket").find(t => t.bossTier === b.tier); }

function dropMisc(p, source, out) {
  (GD.misc || []).forEach(m => {
    if (m.kind === "levelup" || m.kind === "newbie") return;     // Tuyết Liên rơi theo cách riêng, lễ bao không rơi
    if (!(m.sources || []).includes(source) || !(Math.random() * 100 < (m.dropChance || 0))) return;
    const q = Math.max(1, m.dropQty || 1);
    const ok = addMisc(p, m.id, q);
    out.push({ misc: m, qty: q, kept: ok });
  });
}
function dropBook(p, tiers, out) {
  const list = GD.bikip.filter(b => tiers.includes(b.tier));
  if (!list.length) return;
  const b = pick(list);
  out.push({ book: b, kept: addBook(p, b.id) });
}

export function bossRewards(p, kind, b) {
  const lv = b.lv, mb = monsterBase(lv);
  const res = { exp: 0, gold: 0, levels: [], items: [], misc: [], books: [], gold_items: [], unlocked: null };
  const mulE = kind === "gold" ? 60 : 25, mulG = kind === "gold" ? 50 : 20;
  res.exp = mb.exp * mulE; res.gold = mb.gold * mulG;
  p.gold += res.gold;
  res.levels = gainExp(p, res.exp);
  const source = kind === "gold" ? "gold" : "boss";
  const n = (b.drops || 2) + (Math.random() * 100 < (b.dropExtra || 0) ? 1 : 0);
  // boss map (bản 2.4): mỗi trận có tỉ lệ rơi thêm 1 món Hoàng Kim (Cài đặt chung, mặc định 2%); đồ Hoàng Kim luôn vào túi kể cả khi túi đầy
  const goldList = (GD.goldItems || []).filter(g => g.lv <= Math.max(50, lv));
  if (kind === "map" && goldList.length && Math.random() * 100 < (S.mapBossGoldChance ?? 2)) {
    const it = makeGoldItem(pick(goldList)); p.bag.push(it);
    res.gold_items.push({ it, kept: true });
  }
  for (let i = 0; i < n; i++) {
    const it = genItem(lv, source); if (!it) continue;
    const r = addItem(p, it);
    res.items.push({ it, kept: r.kept, gold: r.gold });
  }
  // Thiên Sơn Tuyết Liên (bản 2.3): boss map rơi loại hợp cấp boss; boss Hoàng Kim rơi kèm theo loại boss
  const lotus = miscByKind("levelup");
  const lm = kind === "gold" ? lotus.find(x => x.bossTier === b.tier)
    : lotus.filter(x => (x.useBelow || 100) > lv).sort((x, y) => (x.useBelow || 100) - (y.useBelow || 100))[0];
  if (lm && Math.random() * 100 < (kind === "gold" ? (S.lotusGoldChance ?? 28) : (lm.dropChance ?? 5))) {
    res.misc.push({ misc: lm, qty: 1, kept: addMisc(p, lm.id, 1) });
  }
  if (kind === "map") {
    if (Math.random() * 100 < (b.bikipChance || 0)) dropBook(p, [b.bikipTier || "ha"], res.books);
    if (!p.beaten[b.id]) {
      p.beaten[b.id] = true;
      const map = getMap(b.map), next = X.maps.find(m => m.order === map.order + 1);
      if (next && p.mapUnlocked < next.order) { p.mapUnlocked = next.order; res.unlocked = next; }
    }
  } else {
    p.beaten[b.id] = (p.beaten[b.id] || 0) + 1;
    const tiers = { ha: ["ha"], trung: ["ha", "trung"], thuong: ["ha", "trung", "cao"] }[b.bikipMax || "ha"] || ["ha"];
    if (Math.random() * 100 < (b.bikipChance || 0)) dropBook(p, tiers, res.books);
    if (Math.random() * 100 < (b.goldItemChance ?? 10)) {
      const list = (GD.goldItems || []).filter(g => (g.dropTiers || []).includes(b.tier));
      if (list.length) {
        const it = makeGoldItem(pick(list));
        p.bag.push(it);                     // bản 2.4: đồ Hoàng Kim không bao giờ bị tự bán, túi đầy vẫn cho vào
        res.gold_items.push({ it, kept: true });
      }
    }
  }
  dropMisc(p, source, res.misc);
  return res;
}

// Boss mạnh thêm theo số người (cộng dồn): mỗi người thêm +25% máu, +10% sát thương
export function partyMul(n) {
  const k = Math.max(0, (n || 1) - 1);
  return { hp: 1 + k * (S.partyHpPer ?? 25) / 100, dmg: 1 + k * (S.partyDmgPer ?? 10) / 100 };
}

// ================= CHỢ =================
export const MARKET_MAX = 10;
// Lấy món ra khỏi túi để rao bán. kind: "item" | "misc" | "book"
export function takeForMarket(p, kind, id, qty, price) {
  price = Math.round(Number(price));
  if (!(price >= 1)) return { err: "Nhập giá bán (vàng) lớn hơn 0." };
  if (kind === "item") {
    const i = p.bag.findIndex(x => x.id === id);
    if (i < 0) return { err: "Không tìm thấy món đồ trong túi." };
    if (p.bag[i].lock) return { err: "Món này đang khóa. Mở khóa rồi mới rao bán được." };
    const it = p.bag.splice(i, 1)[0];
    return { listing: { kind, item: it, qty: 1, price, name: it.name } };
  }
  qty = Math.max(1, Math.round(Number(qty) || 1));
  if (kind === "misc") {
    const m = X.misc[id];
    if (!m || (p.misc[id] || 0) < qty) return { err: "Không đủ số lượng." };
    if (m.quest) return { err: "Vật phẩm nhiệm vụ không rao bán được." };
    useMisc(p, id, qty);
    return { listing: { kind, ref: id, qty, price, name: m.name } };
  }
  if (kind === "book") {
    const b = X.bikip[id];
    if (!b || (p.books[id] || 0) < qty) return { err: "Không đủ số lượng." };
    p.books[id] -= qty; if (p.books[id] <= 0) delete p.books[id];
    return { listing: { kind, ref: id, qty, price, name: b.name } };
  }
  return { err: "Loại hàng không hợp lệ." };
}
// Túi còn chỗ nhận món này không (mua hoặc rút về)
export function marketSpaceFor(p, L) {
  if (L.kind === "item") return p.bag.length < (S.invSize || 50) ? "" : "Túi trang bị đã đầy.";
  if (L.kind === "misc") return miscSpaceFor(p, L.ref, L.qty) ? "" : "Túi vật phẩm đã đầy.";
  if (L.kind === "book") return (p.books[L.ref] || miscSlotsUsed(p) + 1 <= (S.invMiscSize || 30)) ? "" : "Túi vật phẩm đã đầy.";
  return "Món không hợp lệ.";
}
export function giveFromMarket(p, L) {
  if (L.kind === "item") { const it = { ...L.item }; delete it.lock; p.bag.push(it); return; }
  if (L.kind === "misc") { p.misc[L.ref] = (p.misc[L.ref] || 0) + L.qty; return; }
  if (L.kind === "book") p.books[L.ref] = (p.books[L.ref] || 0) + L.qty;
}
export function marketValid(L) {
  if (!L || !(L.price >= 1)) return false;
  if (L.kind === "item") return !!(L.item && (L.item.gold ? X.goldItem[L.item.gold] : X.item[L.item.tpl]));
  if (L.kind === "misc") return !!X.misc[L.ref];
  if (L.kind === "book") return !!X.bikip[L.ref];
  return false;
}

// ================= ĐIỂM SO SÁNH ĐỒ =================
const W = { atk: 3, hp: 0.5, def: 2, mp: 0.3, crit: 8, critdmg: 2, aspd: 6, mspd: 3, atkPct: 12, hpPct: 6, defPct: 6, mpPct: 2 };
export function itemScore(it) {
  if (!it) return 0;
  const s = itemStats(it); let v = 0;
  for (const k in s) v += (W[k] ?? 4) * s[k];
  return v + (it.gold ? 5000 : 0);
}
