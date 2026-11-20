// ===== ICON TRANG BỊ (vẽ bằng code) =====
import { RARITY } from "./data.js";

const SHAPES = {
  weapon: c => `
    <path d="M10 31 L27 9 Q33 6 32 12 L14 33 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <path d="M27 9 Q33 6 32 12" fill="none" stroke="#fff" stroke-width="1" opacity=".7"/>
    <rect x="7" y="29" width="9" height="4" rx="1" transform="rotate(-50 11 31)" fill="#6b4a2a" stroke="#222" stroke-width="1"/>
    <circle cx="9" cy="34" r="2.2" fill="#c33" stroke="#222" stroke-width="1"/>`,
  hat: c => `
    <path d="M8 27 Q20 4 32 27 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <rect x="6" y="26" width="28" height="5" rx="2" fill="#6b4a2a" stroke="#222" stroke-width="1.2"/>
    <circle cx="20" cy="18" r="2.5" fill="#fff" opacity=".8"/>`,
  armor: c => `
    <path d="M12 9 L17 7 Q20 11 23 7 L28 9 L34 16 L29 19 L28 33 L12 33 L11 19 L6 16 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <path d="M17 7 L23 33" stroke="#7a3f0c" stroke-width="2.5"/>
    <circle cx="21" cy="17" r="1.6" fill="#ffe070"/>`,
  boots: c => `
    <path d="M12 7 L20 7 L20 24 L32 27 Q34 33 30 33 L10 33 Z" fill="${c}" stroke="#222" stroke-width="1.5"/>
    <path d="M11 29 L31 29" stroke="#222" stroke-width="1"/>
    <path d="M13 12 L19 12 M13 17 L19 17" stroke="#fff" stroke-width="1" opacity=".6"/>`,
  ring: c => `
    <circle cx="20" cy="24" r="9" fill="none" stroke="${c}" stroke-width="4"/>
    <circle cx="20" cy="24" r="9" fill="none" stroke="#222" stroke-width=".8"/>
    <path d="M14 13 L20 6 L26 13 L20 17 Z" fill="#7fd0ff" stroke="#222" stroke-width="1.2"/>`,
  necklace: c => `
    <path d="M9 8 Q20 34 31 8" fill="none" stroke="#6b4a2a" stroke-width="1.5"/>
    ${[0.1, 0.25, 0.4, 0.6, 0.75, 0.9].map(t => {
      const x = 9 + 22 * t, y = 8 + 26 * 4 * t * (1 - t) * 0.92;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${c}" stroke="#222" stroke-width=".8"/>`;
    }).join("")}
    <circle cx="20" cy="31" r="4" fill="#c33" stroke="#222" stroke-width="1"/>`
};

export function itemIcon(slot, rarity, size = 40) {
  const col = RARITY[rarity].color;
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="6" fill="#1a1c22" stroke="${col}" stroke-width="2"/>
    ${SHAPES[slot](col)}</svg>`;
}

export function emptyIcon(size = 40) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="6" fill="#1a1c22" stroke="#444" stroke-width="1.5" stroke-dasharray="4 3"/></svg>`;
}
