// ===== DỮ LIỆU GAME =====

export const ELEMENTS = {
  kim:  { name: "Kim",  color: "#f2c230", dark: "#7a5c00" },
  moc:  { name: "Mộc",  color: "#4caf50", dark: "#1f5a22" },
  tho:  { name: "Thổ",  color: "#b07a3c", dark: "#5a3a16" },
  thuy: { name: "Thủy", color: "#3f86e0", dark: "#163a6a" },
  hoa:  { name: "Hỏa",  color: "#e04040", dark: "#6a1414" }
};

// A khắc B: A đánh B được +15% sát thương
export const COUNTER = { kim: "moc", moc: "tho", tho: "thuy", thuy: "hoa", hoa: "kim" };
export const COUNTER_BONUS = 0.15;

export function elementBonus(att, def) {
  return COUNTER[att] === def ? 1 + COUNTER_BONUS : 1;
}

export const GENDERS = {
  nam: { name: "Nam", dmgMul: 1.15, spreadDeg: 10, idleHit: 0.85, homing: false,
         desc: "Sát thương +15%, đạn lệch ±10°" },
  nu:  { name: "Nữ",  dmgMul: 1.0,  spreadDeg: 3,  idleHit: 0.95, homing: true,
         desc: "Đạn chuẩn ±3°, tự bám mục tiêu" }
};

export const SECTS = {
  thieulam: { name: "Thiếu Lâm", element: "kim",  enabled: true,  robe: "#e8892c", robeDark: "#7a3f0c" },
  duongmon: { name: "Đường Môn", element: "moc",  enabled: false, robe: "#3f9a4a", robeDark: "#1a4a20" },
  vodang:   { name: "Võ Đang",   element: "tho",  enabled: false, robe: "#9a7040", robeDark: "#4a3010" },
  doanthi:  { name: "Đoàn Thị",  element: "thuy", enabled: false, robe: "#3f7ad0", robeDark: "#142e5a" },
  caibang:  { name: "Cái Bang",  element: "hoa",  enabled: false, robe: "#b04030", robeDark: "#501410" }
};

// Kỹ năng Thiếu Lâm. base = cấp có sẵn khi tạo nhân vật (không tốn điểm).
export const SKILLS = {
  nguyetdao: {
    name: "Nguyệt Đao Trảm", path: "dao", key: "Chuột trái", kind: "Chính", max: 10, base: 1,
    desc: lv => `Bắn trăng khuyết vàng. Sát thương ${Math.round(100 + 12 * (lv - 1))}% công, trăng cỡ ${14 + 3 * lv}.`
  },
  sutuhong: {
    name: "Sư Tử Hống", path: "dao", key: "Chuột phải", kind: "Chính", max: 10, base: 0,
    desc: lv => lv === 0 ? "Chưa học. Hét vùng tam giác trước mặt, gây sát thương và xóa đạn."
      : `Vùng tam giác trước mặt: ${Math.round(200 + 30 * lv)}% công, xóa đạn. Hồi chiêu ${sutuCooldown(lv).toFixed(1)}s, tốn 30 nội lực.`
  },
  nguyetanh: {
    name: "Nguyệt Ảnh Đao Pháp", path: "dao", key: "Bị động", kind: "Bị động", max: 10, base: 0,
    desc: lv => `Nguyệt Đao Trảm +${5 * lv}% sát thương, +${4 * lv}% tốc độ đánh.`
  },
  dichcan: {
    name: "Dịch Cân Kinh", path: "dao", key: "Bị động", kind: "Bị động", max: 10, base: 0,
    desc: lv => `+${8 * lv}% máu (tối đa 80%), tính trên tổng máu sau khi mặc đồ.`
  },
  kimcang: {
    name: "Kim Cang Hộ Thể", path: "dao", key: "Q", kind: "Buff", max: 10, base: 0,
    desc: lv => lv === 0 ? "Chưa học. Khiên vàng chặn mọi đạn trong vài giây."
      : `Khiên vàng chặn đạn ${kimcangDuration(lv).toFixed(1)}s. Hồi chiêu ${kimcangCooldown(lv).toFixed(1)}s, tốn 40 nội lực.`
  }
};

export const SKILL_ORDER = ["nguyetdao", "sutuhong", "nguyetanh", "dichcan", "kimcang"];

export const PATHS = {
  dao: { name: "Đường Đao", enabled: true },
  con: { name: "Đường Côn", enabled: false }
};

export function sutuCooldown(lv) { return Math.max(3, 8 - 0.3 * (lv - 1)); }
export function kimcangDuration(lv) { return 2.5 + 0.15 * lv; }
export function kimcangCooldown(lv) { return Math.max(8, 18 - 0.6 * lv); }

// Bãi luyện + boss
export const MAPS = [
  { id: "rungtruc", name: "Rừng Trúc", element: "moc", min: 1, max: 10,
    monsters: ["Trúc Yêu", "Độc Xà", "Mộc Tinh"], boss: "Trúc Lâm Yêu Vương" },
  { id: "hoangtho", name: "Hoàng Thổ Lĩnh", element: "tho", min: 10, max: 20,
    monsters: ["Thạch Quái", "Sa Trùng", "Thổ Hành Tôn"], boss: "Thạch Ma Vương" },
  { id: "bangcoc", name: "Băng Cốc", element: "thuy", min: 20, max: 30,
    monsters: ["Băng Hồn", "Hàn Ngư Tinh", "Tuyết Lang"], boss: "Băng Hồn Nữ Vương" },
  { id: "hoadiem", name: "Hỏa Diệm Sơn", element: "hoa", min: 30, max: 40,
    monsters: ["Hỏa Linh", "Viêm Hổ", "Hỏa Ma"], boss: "Xích Diệm Ma Quân" },
  { id: "kimson", name: "Kim Sơn Phế Tự", element: "kim", min: 40, max: 50,
    monsters: ["Kim Giáp Thi", "Đồng Nhân", "Kiếm Hồn"], boss: "Kim Giáp Tướng Quân" }
];

export const RARITY = [
  { name: "Thường",      color: "#c8c8c8", mul: 1.0,  affix: 0 },
  { name: "Hiếm",        color: "#4a90e2", mul: 1.3,  affix: 1 },
  { name: "Quý",         color: "#a066e0", mul: 1.65, affix: 2 },
  { name: "Huyền thoại", color: "#f2a530", mul: 2.1,  affix: 3 }
];

export const DROP_WEIGHTS_IDLE = [70, 22, 7, 1];
export const DROP_WEIGHTS_BOSS = [0, 50, 38, 12];

export const SLOTS = {
  weapon:   { name: "Vũ khí",     names: ["Giới Đao", "Nguyệt Nha Đao", "Kim Cang Đao", "Phục Ma Đao", "Phật Quang Đao"] },
  hat:      { name: "Mũ",         names: ["Tăng Mạo", "La Hán Mạo", "Bồ Đề Mạo", "Phật Quang Mạo", "Kim Liên Mạo"] },
  armor:    { name: "Áo",         names: ["Tăng Bào", "Cà Sa", "La Hán Giáp", "Kim Lan Cà Sa", "Phật Quang Giáp"] },
  boots:    { name: "Giày",       names: ["Giày Vải", "Hài Cỏ", "Đạp Tuyết Hài", "Truy Phong Hài", "Lăng Ba Hài"] },
  ring:     { name: "Nhẫn",       names: ["Nhẫn Đồng", "Nhẫn Bồ Đề", "Ngọc Giới", "Xá Lợi Giới", "Kim Cang Giới"] },
  necklace: { name: "Dây chuyền", names: ["Chuỗi Hạt Gỗ", "Chuỗi Bồ Đề", "Chuỗi Phật Châu", "Xá Lợi Liên", "Kim Liên Chuỗi"] }
};
export const SLOT_ORDER = ["weapon", "hat", "armor", "boots", "ring", "necklace"];

export const STAT_NAMES = {
  atk: "Công", hp: "Máu", def: "Phòng", mp: "Nội lực", crit: "Chí mạng %", speed: "Tốc chạy %"
};

export const INVENTORY_SIZE = 40;
export const OFFLINE_MAX_HOURS = 8;
