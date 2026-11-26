// ===== ICON: dùng hình trong gamedata.json, thiếu hình thì vẽ bằng code =====
import { rarityOf } from "./data.js";

const SHAPES = {
  weapon: c => `
    <path d="M10 31 L27 9 Q33 6 32 12 L14 33 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <rect x="7" y="29" width="9" height="4" rx="1" transform="rotate(-50 11 31)" fill="#6b4a2a" stroke="#222" stroke-width="1"/>`,
  hat: c => `
    <path d="M8 27 Q20 4 32 27 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <rect x="6" y="26" width="28" height="5" rx="2" fill="#6b4a2a" stroke="#222" stroke-width="1.2"/>`,
  armor: c => `
    <path d="M12 9 L17 7 Q20 11 23 7 L28 9 L34 16 L29 19 L28 33 L12 33 L11 19 L6 16 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>`,
  boots: c => `
    <path d="M12 7 L20 7 L20 24 L32 27 Q34 33 30 33 L10 33 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>`,
  ring: c => `
    <circle cx="20" cy="24" r="9" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M14 13 L20 6 L26 13 L20 17 Z" fill="#7fd0ff" stroke="#222" stroke-width="1.2"/>`,
  necklace: c => `
    <path d="M9 8 Q20 34 31 8" fill="none" stroke="#6b4a2a" stroke-width="1.5"/>
    <circle cx="20" cy="31" r="4" fill="${c}" stroke="#222" stroke-width="1"/>`,
  misc: c => `<circle cx="20" cy="20" r="10" fill="${c}" stroke="#222" stroke-width="1.5"/>`,
  book: c => `<rect x="10" y="7" width="20" height="26" rx="2" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <path d="M14 13 H26 M14 18 H26" stroke="#222" stroke-width="1.2"/>`,
  skill: c => `<path d="M21 5 L11 22 H19 L17 35 L29 16 H21 Z" fill="${c}" stroke="#222" stroke-width="1.3"/>`
};

// Ô hình vuông có viền màu; src = hình trong data (nếu có)
export function iconBox(src, shape, color, size = 40, extra = "") {
  const inner = src
    ? `<img src="${src}" alt="" draggable="false">`
    : `<svg viewBox="0 0 40 40" aria-hidden="true">${(SHAPES[shape] || SHAPES.misc)(color)}</svg>`;
  return `<span class="ico" style="width:${size}px;height:${size}px;border-color:${color}">${inner}${extra}</span>`;
}

export function rarityColor(r) { return rarityOf(r).color || "#c8c8c8"; }

export function emptyBox(size = 40, label = "") {
  return `<span class="ico empty" style="width:${size}px;height:${size}px">${label ? `<em>${label}</em>` : ""}</span>`;
}
