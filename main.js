// ===== GIAO DIỆN CHÍNH =====
import * as store from "./store.js";
import {
  ELEMENTS, GENDERS, SECTS, SKILLS, SKILL_ORDER, PATHS, MAPS, RARITY, SLOTS, SLOT_ORDER,
  STAT_NAMES, INVENTORY_SIZE, OFFLINE_MAX_HOURS, elementBonus
} from "./data.js";
import * as L from "./logic.js";
import { itemIcon, emptyIcon } from "./icons.js";
import { Battle } from "./battle.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = L.fmt;

let user = null, P = null;
let idle = { mon: null, hp: null, restUntil: 0 };
let idleTimer = null, saveTimer = null, battle = null;
let logs = [];
let tab = "idle", selItem = null;

// ---------- Tiện ích ----------
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("hidden", s.id !== id));
}
function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600);
}
function modal(html) { $("modal-box").innerHTML = html; $("modal").classList.remove("hidden"); }
function closeModal() { $("modal").classList.add("hidden"); }
window.closeModal = closeModal;

function statLines(stats) {
  return Object.keys(STAT_NAMES).filter(k => stats[k]).map(k =>
    `<div>${STAT_NAMES[k]}: <b>+${fmt(stats[k])}</b></div>`).join("");
}
function itemTitle(it) {
  return `[${RARITY[it.rarity].name}] ${it.name} · Lv${it.lv}\n` +
    Object.keys(STAT_NAMES).filter(k => it.stats[k]).map(k => `${STAT_NAMES[k]} +${it.stats[k]}`).join("\n");
}

// ---------- Lưu ----------
async function saveNow() {
  if (!P || !user) return;
  clearTimeout(saveTimer); saveTimer = null;
  P.lastSeen = Date.now();
  try { await store.savePlayer(user.uid, P); }
  catch (e) { console.error(e); toast("Lưu thất bại: " + (e.code || e.message)); }
}
function markDirty(delay = 5000) {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, delay);
}
setInterval(() => { if (P) saveNow(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
window.addEventListener("beforeunload", () => { saveNow(); });

// ---------- Khởi động ----------
if (store.DEMO) $("demo-banner").classList.remove("hidden");
store.init(async u => {
  user = u;
  if (!u) { show("scr-login"); return; }
  try {
    const data = await store.loadPlayer(u.uid);
    if (!data) { showCreate(); return; }
    P = L.normalizePlayer(data);
    const away = (Date.now() - (P.lastSeen || Date.now())) / 1000;
    let off = null;
    if (away > 120) off = L.offlineGains(P, away);
    startMain();
    if (off && off.kills > 0) showOffline(off);
    await saveNow();
  } catch (e) {
    console.error(e);
    show("scr-login");
    $("login-err").textContent = "Không tải được dữ liệu: " + (e.code || e.message);
  }
}).catch(e => {
  console.error(e);
  show("scr-login");
  $("login-err").textContent = "Không kết nối được Firebase. Kiểm tra js/config.js.";
});

// ---------- Đăng nhập ----------
$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("login-err").textContent = "";
  const btn = $("login-btn"); btn.disabled = true; btn.textContent = "Đang vào...";
  try { await store.login($("login-user").value, $("login-pass").value); }
  catch (err) { $("login-err").textContent = err.message; }
  btn.disabled = false; btn.textContent = "Đăng nhập";
});
if (store.DEMO) $("login-note").textContent = "Chế độ thử: nhập tên bất kỳ, mật khẩu bỏ trống cũng được.";

// ---------- Tạo nhân vật ----------
let cGender = "nam", cSect = "thieulam";
function showCreate() {
  show("scr-create");
  renderCreate();
}
function renderCreate() {
  $("c-gender").innerHTML = Object.entries(GENDERS).map(([k, g]) =>
    `<button type="button" class="card ${cGender === k ? "sel" : ""}" data-g="${k}">
      <div class="card-t">${g.name}</div><div class="card-s">${g.desc}</div></button>`).join("");
  $("c-sect").innerHTML = Object.entries(SECTS).map(([k, s]) => {
    const e = ELEMENTS[s.element];
    return `<button type="button" class="card sect ${cSect === k ? "sel" : ""}" data-s="${k}" ${s.enabled ? "" : "disabled"}
      style="--el:${e.color}"><div class="card-t" style="color:${s.enabled ? e.color : "#666"}">${s.name}</div>
      <div class="card-s">${e.name}${s.enabled ? "" : " · sắp ra mắt"}</div></button>`;
  }).join("");
  document.querySelectorAll("#c-gender .card").forEach(b => b.onclick = () => { cGender = b.dataset.g; renderCreate(); });
  document.querySelectorAll("#c-sect .card").forEach(b => b.onclick = () => { cSect = b.dataset.s; renderCreate(); });
}
$("create-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("c-name").value.trim();
  if (name.length < 2 || name.length > 16) { $("create-err").textContent = "Tên nhân vật từ 2 đến 16 ký tự."; return; }
  P = L.newPlayer(name, cGender, cSect);
  P.username = user.username;
  await saveNow();
  startMain();
  addLog({ t: `${name} bái nhập ${SECTS[cSect].name}, bắt đầu luyện công tại ${L.getMap(P.mapId).name}.`, c: "level" });
});

// ---------- Màn chính ----------
function startMain() {
  show("scr-main");
  $("tab-btn-admin").classList.toggle("hidden", !user.isAdmin);
  setTab(tab);
  startIdle();
}

function setTab(t) {
  tab = t;
  document.querySelectorAll(".tabs button[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  document.querySelectorAll(".tab").forEach(d => d.classList.toggle("hidden", d.id !== "tab-" + t));
  renderAll();
}
document.querySelectorAll(".tabs button[data-tab]").forEach(b => b.onclick = () => setTab(b.dataset.tab));
$("btn-logout").onclick = async () => { await saveNow(); store.logout(); };
$("btn-pass").onclick = () => passwordModal();

function renderAll() {
  renderHeader();
  if (tab === "idle") renderIdle();
  if (tab === "bag") renderBag();
  if (tab === "skill") renderSkills();
  if (tab === "admin") renderAdmin();
}

function renderHeader() {
  const sect = SECTS[P.sect], e = ELEMENTS[sect.element];
  const need = L.expToNext(P.level);
  $("hd-lv").textContent = "Lv" + P.level;
  $("hd-lv").style.background = sect.robe;
  $("hd-name").innerHTML = `${esc(P.name)} · <span style="color:${e.color}">${sect.name} (${e.name})</span> · ${GENDERS[P.gender].name}`;
  $("hd-exp").style.width = (P.exp / need * 100).toFixed(1) + "%";
  $("hd-exptext").textContent = `EXP ${fmt(P.exp)} / ${fmt(need)}`;
  $("hd-gold").textContent = fmt(P.gold) + " vàng";
  $("tab-btn-bag").textContent = `Túi đồ (${P.inventory.length}/${INVENTORY_SIZE})`;
  $("tab-btn-skill").innerHTML = "Kỹ năng" + (P.skillPoints > 0 ? ` <span class="badge">${P.skillPoints}</span>` : "");
}

// ----- Treo máy -----
function equipPanelHtml(withUnequip) {
  const st = L.calcStats(P);
  const slots = SLOT_ORDER.map(s => {
    const it = P.equip[s];
    if (!it) return `<div class="eq empty">${emptyIcon(36)}<span>${SLOTS[s].name}</span></div>`;
    return `<div class="eq" title="${esc(itemTitle(it))}" style="border-color:${RARITY[it.rarity].color}">
      ${itemIcon(s, it.rarity, 36)}<span style="color:${RARITY[it.rarity].color}">${esc(it.name)}</span>
      ${withUnequip ? `<button class="mini" data-uneq="${s}">Tháo</button>` : ""}</div>`;
  }).join("");
  return `<div class="panel-t">Trang bị</div><div class="eq-grid">${slots}</div>
    <div class="stats">
      <div>Công <b>${fmt(st.atk)}</b></div><div>Máu <b>${fmt(st.hp)}</b>${st.hpBonus ? ` <small class="good">(+${Math.round(st.hpBonus * 100)}%)</small>` : ""}</div>
      <div>Nội lực <b>${fmt(st.mp)}</b></div><div>Phòng <b>${fmt(st.def)}</b></div>
      <div>Chí mạng <b>${st.crit}%</b></div><div>Tốc chạy <b>+${st.speed}%</b></div>
      <div>Chính xác <b>${Math.round(st.idleHit * 100)}%</b></div><div>Sát thương <b>×${st.dmgMul}</b></div>
    </div>`;
}

function renderIdle() {
  $("idle-left").innerHTML = equipPanelHtml(false);
  renderIdleStatus();
  renderLog();
  const right = MAPS.map(m => {
    const ok = P.level >= m.min, on = P.mapId === m.id, e = ELEMENTS[m.element];
    return `<button class="map ${on ? "on" : ""}" data-map="${m.id}" ${ok ? "" : "disabled"}>
      <span style="color:${ok ? e.color : "#555"}">●</span> ${m.name} <small>Lv ${m.min}–${m.max}${ok ? "" : " (khóa)"}</small></button>`;
  }).join("");
  const bosses = MAPS.map(m => {
    const ok = P.level >= m.min, e = ELEMENTS[m.element];
    return `<button class="boss" data-boss="${m.id}" ${ok ? "" : "disabled"} style="--el:${e.color}">
      ${m.boss} <small>Lv${m.max} · ${e.name}</small></button>`;
  }).join("");
  $("idle-right").innerHTML = `<div class="panel-t">Bãi luyện</div>${right}
    <div class="panel-t" style="margin-top:12px">Khiêu chiến boss (1 người)</div>${bosses}
    <button class="big-btn red" disabled>Party đánh boss<br><small>Giai đoạn 2</small></button>
    <button class="big-btn blue" disabled>Phòng PK<br><small>Giai đoạn 3</small></button>`;
  document.querySelectorAll("[data-map]").forEach(b => b.onclick = () => {
    P.mapId = b.dataset.map; idle.mon = null;
    addLog({ t: `Chuyển tới ${L.getMap(P.mapId).name}.`, c: "info" });
    markDirty(); renderIdle();
  });
  document.querySelectorAll("[data-boss]").forEach(b => b.onclick = () => bossIntro(b.dataset.boss));
}

function renderIdleStatus() {
  const el = $("idle-status"); if (!el) return;
  const st = L.calcStats(P), map = L.getMap(P.mapId);
  const hp = idle.hp == null ? st.hp : idle.hp;
  const m = idle.mon;
  const resting = idle.restUntil && Date.now() < idle.restUntil;
  el.innerHTML = `<div class="st-row"><span>Đang treo: <b>${map.name}</b></span>
    <span class="muted">${resting ? "Đang nghỉ hồi phục..." : ""}</span></div>
    <div class="st-row"><span class="lbl">Bản thân</span><div class="bar"><i style="width:${(hp / st.hp * 100).toFixed(1)}%;background:#d94040"></i><em>${fmt(hp)} / ${fmt(st.hp)}</em></div></div>
    <div class="st-row"><span class="lbl" style="color:${m ? ELEMENTS[m.element].color : "#777"}">${m ? esc(m.name) + " Lv" + m.lv : "Tìm quái..."}</span>
    <div class="bar"><i style="width:${m ? Math.max(0, m.hp / m.maxHp * 100).toFixed(1) : 0}%;background:#8a5ad0"></i>${m ? `<em>${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}</em>` : ""}</div></div>`;
}

function addLog(l) {
  const d = new Date();
  l.time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  logs.push(l);
  if (logs.length > 150) logs.splice(0, logs.length - 150);
  if (tab === "idle") renderLog();
}
function renderLog() {
  const el = $("idle-log"); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = logs.map(l => `<div class="lg ${l.c || ""}"><span class="tm">[${l.time}]</span> ${esc(l.t)}</div>`).join("");
  if (atBottom || !renderLog._init) { el.scrollTop = el.scrollHeight; renderLog._init = true; }
}

function startIdle() {
  stopIdle();
  const step = () => {
    if (battle) return;
    const r = L.idleRound(P, idle, Date.now());
    r.logs.forEach(addLog);
    if (r.levelUp) idle.hp = null; // lên cấp hồi đầy máu
    if (r.changed) markDirty(r.levelUp ? 1500 : 8000);
    renderHeader();
    if (tab === "idle") { renderIdleStatus(); if (r.levelUp) $("idle-left").innerHTML = equipPanelHtml(false); }
    if (r.levelUp && tab === "skill") renderSkills();
    idleTimer = setTimeout(step, L.idleInterval(P));
  };
  idleTimer = setTimeout(step, 600);
}
function stopIdle() { clearTimeout(idleTimer); idleTimer = null; }

function showOffline(o) {
  const h = Math.floor(o.seconds / 3600), m = Math.floor(o.seconds % 3600 / 60);
  const kept = o.kept.slice(0, 12).map(it =>
    `<div class="rw" style="color:${RARITY[it.rarity].color}">${itemIcon(it.slot, it.rarity, 24)} ${esc(it.name)} Lv${it.lv}</div>`).join("");
  modal(`<h3>Treo máy khi vắng mặt</h3>
    <p class="muted">Vắng ${h} giờ ${m} phút (tính tối đa ${OFFLINE_MAX_HOURS} giờ)</p>
    <div class="rw">Tiêu diệt: <b>${fmt(o.kills)}</b> quái</div>
    <div class="rw">EXP: <b>+${fmt(o.exp)}</b>${o.levels.length ? ` · <span class="lvup">Lên cấp ${o.levels[o.levels.length - 1]}!</span>` : ""}</div>
    <div class="rw">Vàng: <b>+${fmt(o.gold + o.soldGold)}</b> (gồm ${o.sold} món đồ tự bán)</div>
    ${o.kept.length ? `<div class="panel-t" style="margin-top:10px">Nhặt được ${o.kept.length} món</div>${kept}${o.kept.length > 12 ? `<div class="muted">... và ${o.kept.length - 12} món khác</div>` : ""}` : ""}
    <div class="m-act"><button class="btn" onclick="closeModal()">Nhận</button></div>`);
  addLog({ t: `Treo máy vắng mặt: ${fmt(o.kills)} quái, +${fmt(o.exp)} EXP.`, c: "level" });
}

// ----- Túi đồ -----
function renderBag() {
  $("bag-left").innerHTML = equipPanelHtml(true);
  document.querySelectorAll("[data-uneq]").forEach(b => b.onclick = () => {
    if (!L.unequip(P, b.dataset.uneq)) { toast("Túi đồ đã đầy."); return; }
    markDirty(); renderAll();
  });
  const items = [...P.inventory].sort((a, b) => b.rarity - a.rarity || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || b.lv - a.lv);
  const cells = [];
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const it = items[i];
    if (!it) { cells.push(`<div class="cell">${emptyIcon(48)}</div>`); continue; }
    const better = L.itemScore(it) > L.itemScore(P.equip[it.slot]);
    cells.push(`<button class="cell ${selItem === it.id ? "sel" : ""}" data-item="${it.id}" title="${esc(itemTitle(it))}">
      ${itemIcon(it.slot, it.rarity, 48)}${better ? `<span class="up">▲</span>` : ""}</button>`);
  }
  $("bag-grid").innerHTML = cells.join("");
  $("bag-auto").checked = !!P.autoSellCommon;
  document.querySelectorAll("[data-item]").forEach(b => b.onclick = () => { selItem = b.dataset.item; renderBag(); });
  renderItemDetail();
}

function renderItemDetail() {
  const box = $("bag-detail");
  const it = P.inventory.find(x => x.id === selItem);
  if (!it) { box.innerHTML = `<div class="muted">Chọn một món đồ để xem chi tiết. Mũi tên ▲ là đồ tốt hơn đồ đang mặc.</div>`; return; }
  const cur = P.equip[it.slot];
  const diff = Object.keys(STAT_NAMES).map(k => {
    const d = (it.stats[k] || 0) - ((cur && cur.stats[k]) || 0);
    if (!d) return "";
    return `<div class="${d > 0 ? "good" : "bad"}">${STAT_NAMES[k]} ${d > 0 ? "+" : ""}${d}</div>`;
  }).join("");
  const tooHigh = it.lv > P.level + 5;
  box.innerHTML = `<div class="det-head">${itemIcon(it.slot, it.rarity, 56)}
    <div><div style="color:${RARITY[it.rarity].color};font-weight:600">${esc(it.name)}</div>
    <div class="muted">${RARITY[it.rarity].name} · ${SLOTS[it.slot].name} · Lv${it.lv}</div></div></div>
    <div class="det-stats">${statLines(it.stats)}</div>
    <div class="panel-t">So với đồ đang mặc${cur ? "" : " (đang trống)"}</div>
    <div class="det-stats">${diff || '<div class="muted">Như nhau</div>'}</div>
    ${tooHigh ? `<div class="bad">Cần cấp ${it.lv - 5} để mặc.</div>` : ""}
    <div class="m-act"><button class="btn" id="d-equip" ${tooHigh ? "disabled" : ""}>Mặc</button>
    <button class="btn ghost" id="d-sell">Bán +${L.sellPrice(it)} vàng</button></div>`;
  $("d-equip").onclick = () => { if (L.equipItem(P, it.id)) { selItem = null; markDirty(2000); renderAll(); } };
  $("d-sell").onclick = () => { const g = L.sellItem(P, it.id); toast(`Đã bán, +${g} vàng`); selItem = null; markDirty(); renderAll(); };
}
$("bag-sellall").onclick = () => {
  const r = L.sellAllCommon(P);
  toast(r.n ? `Đã bán ${r.n} món Thường, +${fmt(r.g)} vàng` : "Không có đồ Thường để bán.");
  markDirty(); renderAll();
};
$("bag-auto").onchange = e => { P.autoSellCommon = e.target.checked; markDirty(); };

// ----- Kỹ năng -----
function renderSkills() {
  const paths = Object.entries(PATHS).map(([k, pa]) =>
    `<span class="path ${k === "dao" ? "on" : ""} ${pa.enabled ? "" : "off"}">${pa.name}${pa.enabled ? "" : " (sắp ra mắt)"}</span>`).join("");
  const rows = SKILL_ORDER.map(id => {
    const sk = SKILLS[id], lv = P.skills[id];
    const can = P.skillPoints > 0 && lv < sk.max;
    return `<div class="sk-row">
      <span class="sk-key">${sk.key}</span>
      <div class="sk-main"><div class="sk-name">${sk.name} <small class="muted">${sk.kind}</small></div>
      <div class="sk-desc">${sk.desc(lv)}</div>
      ${lv < sk.max ? `<div class="sk-next muted">Cấp sau: ${sk.desc(lv + 1)}</div>` : ""}</div>
      <span class="sk-lv">Cấp ${lv}/${sk.max}</span>
      <button class="mini plus" data-sk="${id}" ${can ? "" : "disabled"}>+</button></div>`;
  }).join("");
  $("tab-skill").innerHTML = `<div class="panel wide">
    <div class="sk-head"><span class="panel-t">Kỹ năng · ${SECTS[P.sect].name}</span>
    <span class="pts">Điểm còn: <b>${P.skillPoints}</b></span></div>
    <div class="paths">${paths}</div>${rows}
    <p class="muted">Mỗi cấp nhận 1 điểm. Điểm nâng được cho cả 2 đường. Nâng sai thì reset để cộng lại (miễn phí).</p>
    <button class="btn danger" id="sk-reset">Reset kỹ năng</button></div>`;
  document.querySelectorAll("[data-sk]").forEach(b => b.onclick = () => {
    if (L.addSkillPoint(P, b.dataset.sk)) { markDirty(2000); renderAll(); }
  });
  $("sk-reset").onclick = () => {
    modal(`<h3>Reset kỹ năng?</h3><p>Tất cả điểm sẽ được trả lại để cộng lại từ đầu.</p>
      <div class="m-act"><button class="btn danger" id="m-ok">Reset</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
    $("m-ok").onclick = () => { L.resetSkills(P); closeModal(); markDirty(1000); renderAll(); toast("Đã reset kỹ năng."); };
  };
}

// ----- Admin -----
async function renderAdmin() {
  const box = $("tab-admin");
  box.innerHTML = `<div class="panel wide"><div class="panel-t">Danh sách người chơi</div><div class="muted">Đang tải...</div></div>`;
  try {
    const list = await store.listPlayers();
    list.sort((a, b) => (b.level || 0) - (a.level || 0));
    const rows = list.map(p => {
      const online = Date.now() - (p.lastSeen || 0) < 90000;
      const seen = p.lastSeen ? new Date(p.lastSeen).toLocaleString("vi-VN") : "-";
      return `<tr><td>${esc(p.name)}</td><td>${esc(p.username || p.uid)}</td><td>${SECTS[p.sect] ? SECTS[p.sect].name : "-"}</td>
        <td>${GENDERS[p.gender] ? GENDERS[p.gender].name : "-"}</td><td>${p.level}</td><td>${fmt(p.gold || 0)}</td>
        <td>${(p.inventory || []).length}</td><td>${online ? '<span class="good">Đang online</span>' : seen}</td></tr>`;
    }).join("");
    box.innerHTML = `<div class="panel wide"><div class="sk-head"><span class="panel-t">Danh sách người chơi (${list.length})</span>
      <button class="btn ghost" id="ad-ref">Tải lại</button></div>
      <table class="tbl"><thead><tr><th>Nhân vật</th><th>Tài khoản</th><th>Phái</th><th>Giới tính</th><th>Cấp</th><th>Vàng</th><th>Đồ</th><th>Lần cuối</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="muted">Chưa có ai</td></tr>'}</tbody></table>
      <p class="muted">Thêm người chơi: Firebase Console → Authentication → Users → Add user. Email nhập dạng <b>tendangnhap@vlyn.game</b>, mật khẩu từ 6 ký tự. Người chơi tự đổi mật khẩu trong game.</p></div>`;
    $("ad-ref").onclick = renderAdmin;
  } catch (e) {
    box.innerHTML = `<div class="panel wide"><div class="bad">Không tải được: ${esc(e.code || e.message)}. Kiểm tra tên admin trong firestore.rules.</div></div>`;
  }
}

// ----- Đổi mật khẩu -----
function passwordModal() {
  modal(`<h3>Đổi mật khẩu</h3>
    <form id="pw-form" class="form">
      <label>Mật khẩu hiện tại<input type="password" id="pw-cur" autocomplete="current-password"></label>
      <label>Mật khẩu mới (từ 6 ký tự)<input type="password" id="pw-new" autocomplete="new-password"></label>
      <label>Nhập lại mật khẩu mới<input type="password" id="pw-new2" autocomplete="new-password"></label>
      <div class="bad" id="pw-err"></div>
      <div class="m-act"><button class="btn" type="submit">Đổi</button><button class="btn ghost" type="button" onclick="closeModal()">Hủy</button></div>
    </form>`);
  $("pw-form").onsubmit = async e => {
    e.preventDefault();
    const n = $("pw-new").value;
    if (n !== $("pw-new2").value) { $("pw-err").textContent = "Hai mật khẩu mới không khớp."; return; }
    try { await store.changePassword($("pw-cur").value, n); closeModal(); toast("Đã đổi mật khẩu."); }
    catch (err) { $("pw-err").textContent = err.message; }
  };
}

// ----- Boss -----
function bossIntro(mapId) {
  const map = L.getMap(mapId), b = L.bossStats(map), e = ELEMENTS[b.element];
  const pe = SECTS[P.sect].element;
  const note = elementBonus(pe, b.element) > 1 ? `<span class="good">${ELEMENTS[pe].name} khắc ${e.name}: bạn gây thêm 15% sát thương.</span>`
    : elementBonus(b.element, pe) > 1 ? `<span class="bad">${e.name} khắc ${ELEMENTS[pe].name}: bạn nhận thêm 15% sát thương.</span>`
    : "Không tương khắc.";
  modal(`<h3 style="color:${e.color}">${b.name} · Lv${b.lv} (${e.name})</h3>
    <p class="muted">Máu ${fmt(b.hp)} · Rớt 2–3 món, chắc chắn từ Hiếm trở lên.</p>
    <div class="ctrl">
      <div><b>WASD</b> di chuyển</div><div><b>Giữ chuột trái</b> Nguyệt Đao Trảm</div>
      <div><b>Chuột phải</b> Sư Tử Hống (xóa đạn)</div><div><b>Q</b> Kim Cang Hộ Thể</div>
      <div><b>Space</b> lướt né (bất tử ngắn)</div><div><b>Esc</b> tạm dừng / bỏ chạy</div>
    </div>
    <p>${note}</p>
    <p class="muted">Chấm đỏ giữa người là điểm trúng đạn, chỉ đạn chạm chấm này mới mất máu.</p>
    <div class="m-act"><button class="btn" id="m-fight">Vào trận</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
  $("m-fight").onclick = () => { closeModal(); startBattle(map, b); };
}

function startBattle(map, b) {
  stopIdle();
  show("scr-battle");
  battle = new Battle($("cv"), P, map, b, result => {
    battle = null;
    idle.hp = null; idle.mon = null;
    show("scr-main");
    if (result === "win") {
      const r = L.bossRewards(P, map);
      const items = r.items.map(x => `<div class="rw" style="color:${RARITY[x.it.rarity].color}">
        ${itemIcon(x.it.slot, x.it.rarity, 28)} [${RARITY[x.it.rarity].name}] ${esc(x.it.name)} Lv${x.it.lv}
        ${x.kept ? "" : `<small class="muted">(túi đầy, tự bán +${x.gold})</small>`}</div>`).join("");
      modal(`<h3 style="color:#f2c230">Đánh bại ${map.boss}!</h3>
        <div class="rw">EXP <b>+${fmt(r.exp)}</b>${r.levels.length ? ` · <span class="lvup">Lên cấp ${r.levels[r.levels.length - 1]}!</span>` : ""}</div>
        <div class="rw">Vàng <b>+${fmt(r.gold)}</b></div>${items}
        <div class="m-act"><button class="btn" onclick="closeModal()">Nhận</button></div>`);
      addLog({ t: `Đánh bại boss ${map.boss}! +${fmt(r.exp)} EXP`, c: "level" });
      r.items.forEach(x => addLog({ t: `Boss rớt [${RARITY[x.it.rarity].name}] ${x.it.name}`, c: "r" + x.it.rarity }));
      saveNow();
    } else if (result === "lose") {
      modal(`<h3 class="bad">Thất bại</h3><p>Bị ${map.boss} đánh bại. Hãy treo máy thêm, nâng đồ và kỹ năng rồi quay lại.</p>
        <div class="m-act"><button class="btn" onclick="closeModal()">Về thành</button></div>`);
    } else {
      toast("Đã bỏ chạy khỏi trận.");
    }
    renderAll();
    startIdle();
  });
  battle.start();
}

$("modal").addEventListener("mousedown", e => { if (e.target.id === "modal") closeModal(); });
