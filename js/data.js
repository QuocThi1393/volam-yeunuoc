// ===== DỮ LIỆU GAME: đọc từ gamedata.json (soạn bằng editor.html) =====
export let GD = null;          // toàn bộ file gamedata.json
export let S = {};             // Cài đặt chung
export const X = {};           // các bảng tra nhanh

export const WEAPON_NAMES = { dao: "Đao", kiem: "Kiếm", bong: "Bổng", quyen: "Quyền", phidao: "Phi Đao" };
export const SLOT_NAMES_KEYS = { lmb: "Chuột trái", rmb: "Chuột phải", p1: "Bị động 1", p2: "Bị động 2", q: "Q" };
export const BIKIP_TIER_NAMES = { ha: "Hạ cấp", trung: "Trung cấp", cao: "Cao cấp" };
export const GOLD_TIER_NAMES = { ha: "Hạ", trung: "Trung", thuong: "Thượng" };
export const BIKIP_SELL = { ha: 3000, trung: 10000, cao: 30000 };   // giá bán bí kíp phái khác

const by = (arr, k = "id") => Object.fromEntries(arr.map(x => [x[k], x]));

export async function loadGameData(url = "gamedata.json") {
  let res;
  try { res = await fetch(url, { cache: "no-cache" }); }
  catch (e) { throw new Error("Không tải được gamedata.json (lỗi mạng)."); }
  if (!res.ok) throw new Error("Không tìm thấy gamedata.json. Hãy upload file này cạnh index.html.");
  const d = await res.json();
  if (!d.meta || d.meta.app !== "vlyn" || d.meta.kind !== "gamedata") throw new Error("gamedata.json không đúng định dạng.");
  GD = d; S = d.settings || {};
  build();
  return GD;
}

function build() {
  X.element = by(GD.elements);
  X.gender = by(GD.genders);
  X.sect = by(GD.sects);
  X.skill = by(GD.skills);
  X.skillOf = {};               // X.skillOf[sect][path][slot]
  for (const s of GD.skills) {
    ((X.skillOf[s.sect] ||= {})[s.path] ||= {})[s.slot] = s;
  }
  X.bikip = by(GD.bikip);
  X.stat = by(GD.stats);
  X.effect = by(GD.effects);
  X.slot = by(GD.slots);
  X.slotOrder = GD.slots.map(s => s.id);
  X.rarity = GD.rarity;
  X.rarIdx = Object.fromEntries(GD.rarity.map((r, i) => [r.id, i]));
  X.goldRar = Math.max(0, GD.rarity.findIndex(r => r.name === "Hoàng Kim"));
  if (!GD.rarity.some(r => r.name === "Hoàng Kim")) X.goldRar = GD.rarity.length - 1;
  X.item = by(GD.items);
  X.goldItem = by(GD.goldItems || []);
  X.misc = by(GD.misc || []);
  X.maps = [...GD.maps].sort((a, b) => a.order - b.order);
  X.map = by(GD.maps);
  X.monOf = {};
  for (const m of GD.monsters) (X.monOf[m.map] ||= []).push(m);
  X.bossOf = by(GD.bosses, "map");
  X.boss = by(GD.bosses);
  X.goldBoss = by(GD.goldBosses);
  X.pattern = by(GD.patterns);
}

export function elemBonus(att, def) {
  const a = X.element[att];
  return a && a.counters === def ? 1 + (S.counterBonus || 15) / 100 : 1;
}
export function elemColor(id) { return (X.element[id] || {}).color || "#999"; }
export function elemName(id) { return (X.element[id] || {}).name || ""; }
export function statName(id) { return (X.stat[id] || {}).name || id; }
export function statPct(id) { return (X.stat[id] || {}).unit === "%"; }
export function rarityOf(i) { return X.rarity[i] || X.rarity[0]; }
export function miscByKind(kind) { return (GD.misc || []).filter(m => m.kind === kind); }
export function sectPathWeapon(sect, path) { const s = X.sect[sect]; return s ? s[path === 1 ? "weapon1" : "weapon2"] : ""; }
export function sectPathName(sect, path) { const s = X.sect[sect]; return s ? s[path === 1 ? "path1" : "path2"] : ""; }
