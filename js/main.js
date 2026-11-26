// ===== GIAO DIỆN CHÍNH — bản 2.0 =====
import * as store from "./store.js";
import {
  GD, S, X, loadGameData, elemBonus, elemColor, elemName, statName, statPct, rarityOf, miscByKind,
  sectPathWeapon, sectPathName, WEAPON_NAMES, SLOT_NAMES_KEYS, BIKIP_TIER_NAMES, GOLD_TIER_NAMES, BIKIP_SELL
} from "./data.js";
import * as L from "./logic.js";
import { iconBox, rarityColor, emptyBox } from "./icons.js";
import { Battle } from "./battle.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = L.fmt;

let user = null, P = null;
let idle = { mon: null, hp: null, restUntil: 0 };
let idleTimer = null, saveTimer = null, battle = null;
let logs = [];
let tab = "idle", sel = null;     // sel = {type:"item"|"eq"|"misc"|"book", id}

// ---------- Tiện ích ----------
function show(id) { document.querySelectorAll(".screen").forEach(s => s.classList.toggle("hidden", s.id !== id)); }
function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600);
}
function modal(html) { $("modal-box").innerHTML = html; $("modal").classList.remove("hidden"); }
function closeModal() { $("modal").classList.add("hidden"); }
window.closeModal = closeModal;
$("modal").addEventListener("mousedown", e => { if (e.target.id === "modal") closeModal(); });

const statVal = (k, v) => (statPct(k) ? L.fmt1(v) + "%" : fmt(v));
const statLine = (k, v, cls = "") => `<div class="${cls}">${esc(statName(k))} <b>+${statVal(k, v)}</b></div>`;
const sprite = (gender, wt) => { const g = X.gender[gender] || {}; return g["sprite_" + (wt || "none")] || g.sprite_none || ""; };
const sectShort = s => s.short || (s.desc || "").split(/[.:]/)[0];

function itemIcon(it, size = 44) {
  const col = rarityColor(it.r);
  return iconBox(L.itemImg(it), it.slot, col, size);
}
function slotLabel(it) {
  const s = X.slot[it.slot]; const w = L.itemWeaponType(it);
  return (s ? s.name : it.slot) + (w ? " · " + WEAPON_NAMES[w] : "");
}
function itemTitle(it) {
  const st = L.itemStats(it);
  return `[${rarityOf(it.r).name}] ${it.name} · Lv${it.lv}\n` + Object.keys(st).map(k => `${statName(k)} +${statVal(k, st[k])}`).join("\n");
}
function itemDetailHtml(it) {
  const r = rarityOf(it.r), col = rarityColor(it.r);
  let body = "";
  if (it.gold) {
    const g = X.goldItem[it.gold] || {};
    body += g.stats.map(s => statLine(s.stat, s.v)).join("");
    if ((g.skills || []).length) {
      const own = g.sect === P.sect;
      body += `<div class="det-sub">Cộng cấp skill ${own ? "" : `<span class="bad">(chỉ phái ${esc((X.sect[g.sect] || {}).name || "")})</span>`}</div>` +
        g.skills.map(x => `<div class="${own ? "good" : "muted"}">${esc((X.skill[x.skill] || {}).name || "")} +${x.lv}</div>`).join("");
    }
    if (g.uniqueName) body += `<div class="det-sub" style="color:#ffd23f">${esc(g.uniqueName)}</div><div class="small">${esc(g.unique)}</div><div class="muted small">Đặc tính riêng sẽ có tác dụng ở bản sau.</div>`;
    if (g.origin) body += `<div class="muted small" style="margin-top:6px">Xuất xứ: ${esc(g.origin)}</div>`;
  } else {
    body += Object.keys(it.main).map(k => statLine(k, it.main[k])).join("");
    if (it.aff.length) body += `<div class="det-sub">Dòng phụ</div>` + it.aff.map(a => statLine(a.s, a.v, "aff")).join("");
  }
  return `<div class="det-head">${itemIcon(it, 56)}<div><div style="color:${col};font-weight:600">${esc(it.name)}</div>
    <div class="muted small">${r.name} · ${esc(slotLabel(it))} · Lv${it.lv}</div></div></div><div class="det-stats">${body}</div>`;
}

// ---------- Lưu ----------
async function saveNow() {
  if (!P || !user) return;
  clearTimeout(saveTimer); saveTimer = null;
  P.lastSeen = Date.now();
  try { await store.savePlayer(user.uid, P); }
  catch (e) { console.error(e); toast("Lưu thất bại: " + (e.code || e.message)); }
}
function markDirty(delay = 5000) { if (!saveTimer) saveTimer = setTimeout(saveNow, delay); }
setInterval(() => { if (P) saveNow(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
window.addEventListener("beforeunload", () => { saveNow(); });

// ---------- Khởi động ----------
if (store.DEMO) $("demo-banner").classList.remove("hidden");
if (store.DEMO) $("login-note").textContent = "Chế độ thử: nhập tên bất kỳ, mật khẩu bỏ trống cũng được.";
(async () => {
  try { await loadGameData(); }
  catch (e) { $("load-msg").innerHTML = `<span class="bad">${esc(e.message)}</span>`; return; }
  store.init(async u => {
    user = u;
    if (!u) { show("scr-login"); return; }
    try {
      const data = await store.loadPlayer(u.uid);
      if (!data) { showCreate(); return; }
      if (data.version !== L.SAVE_VERSION) { showCreate(data); return; }
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
})();

// ---------- Đăng nhập ----------
$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("login-err").textContent = "";
  const btn = $("login-btn"); btn.disabled = true; btn.textContent = "Đang vào...";
  try { await store.login($("login-user").value, $("login-pass").value); }
  catch (err) { $("login-err").textContent = err.message; }
  btn.disabled = false; btn.textContent = "Đăng nhập";
});

// ---------- Tạo nhân vật ----------
let cGender = "nam", cSect = null;
function showCreate(old) {
  show("scr-create");
  cSect = cSect || (GD.sects.find(s => s.enabled) || GD.sects[0]).id;
  $("create-old").textContent = old ? `Bản 2.0 đổi toàn bộ dữ liệu, nhân vật bản cũ (${old.name || ""} Lv${old.level || 1}) không dùng tiếp được. Tạo nhân vật mới để chơi.` : "";
  renderCreate();
}
function renderCreate() {
  const s = X.sect[cSect];
  const w1 = sectPathWeapon(cSect, 1);
  $("c-gender").innerHTML = GD.genders.map(g => `<button type="button" class="card gcard ${cGender === g.id ? "sel" : ""}" data-g="${g.id}">
      ${sprite(g.id, w1) ? `<img class="spr" src="${sprite(g.id, w1)}" alt="">` : ""}
      <div><div class="card-t">${esc(g.name)}</div><div class="card-s">${esc(g.note || "")}<br>Lệch đạn ±${g.spread}° · treo máy trúng ${g.idleHit}%${g.dmgBonus ? ` · sát thương +${g.dmgBonus}%` : ""}</div></div></button>`).join("");
  $("c-sect").innerHTML = GD.sects.map(x => {
    const col = elemColor(x.element);
    return `<button type="button" class="card sect ${cSect === x.id ? "sel" : ""}" data-s="${x.id}" ${x.enabled ? "" : "disabled"} style="border-top:3px solid ${x.enabled ? col : "#444"}">
      ${x.img ? `<img class="sect-img" src="${x.img}" alt="">` : ""}
      <div class="card-t" style="color:${x.enabled ? col : "#777"}">${esc(x.name)}</div>
      <div class="card-s">${elemName(x.element)}${x.enabled ? "" : " · sắp mở"}</div>
      <div class="card-s">${esc(sectShort(x))}</div></button>`;
  }).join("");
  $("c-paths").innerHTML = [1, 2].map(path => {
    const wt = sectPathWeapon(cSect, path), lmb = ((X.skillOf[cSect] || {})[path] || {}).lmb;
    const src = sprite(cGender, wt);
    return `<div class="card pcard">${src ? `<img class="spr" src="${src}" alt="">` : ""}<div>
      <div class="card-t">${esc(sectPathName(cSect, path))}</div><div class="card-s">Vũ khí: ${WEAPON_NAMES[wt] || "—"}</div>
      <div class="card-s">Chiêu chính: <span class="gold">${esc(lmb ? lmb.name : "—")}</span></div></div></div>`;
  }).join("");
  document.querySelectorAll("#c-gender .card").forEach(b => b.onclick = () => { cGender = b.dataset.g; renderCreate(); });
  document.querySelectorAll("#c-sect .card").forEach(b => b.onclick = () => { cSect = b.dataset.s; renderCreate(); });
}
$("create-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("c-name").value.trim();
  if (name.length < 2 || name.length > 16) { $("create-err").textContent = "Tên nhân vật từ 2 đến 16 ký tự."; return; }
  if (!X.sect[cSect] || !X.sect[cSect].enabled) { $("create-err").textContent = "Phái này chưa mở."; return; }
  P = L.newPlayer(name, cGender, cSect);
  P.username = user.username;
  await saveNow();
  startMain();
  addLog({ t: `${name} bái nhập ${X.sect[cSect].name}, bắt đầu luyện công tại ${L.getMap(P.mapId).name}.`, c: "level" });
});

// ---------- Màn chính ----------
function startMain() {
  show("scr-main");
  $("tab-btn-admin").classList.toggle("hidden", !user.isAdmin);
  setTab(tab);
  startIdle();
}
function setTab(t) {
  tab = t; sel = null;
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
  if (tab === "shop") renderShop();
  if (tab === "book") renderBooks();
  if (tab === "admin") renderAdmin();
}

function renderHeader() {
  const sect = X.sect[P.sect];
  const need = L.expToNext(P.level);
  $("hd-lv").textContent = "Lv" + P.level;
  $("hd-lv").style.background = sect.robe || "#e8892c";
  $("hd-name").innerHTML = `${esc(P.name)} · <span style="color:${elemColor(sect.element)}">${esc(sect.name)} (${elemName(sect.element)})</span> · ${esc((X.gender[P.gender] || {}).name || "")}`;
  $("hd-exp").style.width = Math.min(100, P.exp / need * 100).toFixed(1) + "%";
  $("hd-exptext").textContent = `EXP ${fmt(P.exp)} / ${fmt(need)}`;
  $("hd-gold").textContent = fmt(P.gold) + " vàng";
  $("tab-btn-bag").textContent = `Túi đồ (${P.bag.length}/${S.invSize || 40})`;
  $("tab-btn-skill").innerHTML = "Kỹ năng" + (P.skillPoints > 0 ? ` <span class="badge">${P.skillPoints}</span>` : "");
  const readable = Object.keys(P.books).some(id => X.bikip[id] && X.bikip[id].sect === P.sect && (P.bikip[id] || 0) < (X.bikip[id].maxLv || 3));
  $("tab-btn-book").innerHTML = "Bí kíp" + (readable ? ` <span class="badge">!</span>` : "");
}

// ----- Bảng nhân vật (trang bị quanh hình) -----
function equipPanelHtml(withUnequip) {
  const st = L.calcStats(P), wt = L.equippedWeapon(P);
  const slot = s => {
    const it = P.equip[s], name = (X.slot[s] || {}).name || s;
    if (!it) return `<div class="eqs" title="${esc(name)}">${emptyBox(46, name)}</div>`;
    return `<button class="eqs ${sel && sel.type === "eq" && sel.id === s ? "sel" : ""}" data-eq="${s}" title="${esc(itemTitle(it))}">${itemIcon(it, 46)}</button>`;
  };
  const left = X.slotOrder.slice(0, 3), right = X.slotOrder.slice(3);
  const path = L.activePath(P), lmb = ((X.skillOf[P.sect] || {})[path] || {}).lmb;
  const usable = lmb && P.skills[lmb.id] && L.weaponOk(P, lmb);
  const line = wt ? (usable ? `<div class="good small">Đang cầm ${WEAPON_NAMES[wt]}: dùng được ${esc(lmb.name)}</div>`
    : `<div class="bad small">Đang cầm ${WEAPON_NAMES[wt]}: ${lmb && !P.skills[lmb.id] ? "chưa học " + esc(lmb.name) : "không hợp chiêu chính nào, hãy đổi vũ khí"}</div>`)
    : `<div class="bad small">Chưa cầm vũ khí</div>`;
  const src = sprite(P.gender, wt);
  const extra = ["lifesteal", "manasteal", "reflect", "manaShield", "bossDmg", "cdr", "dodge", "bulletConvert", "burnDmg", "poisonDmg",
    "slowChance", "freezeChance", "stunChance", "burnRes", "poisonRes", "slowRes", "freezeRes", "stunRes", "counterDmg", "counterRes", "hpregen", "mpregen", "allSkills"]
    .filter(k => st[k]).map(k => `<div>${esc(statName(k))} <b>${statVal(k, st[k])}</b></div>`).join("");
  return `<div class="panel-t">Nhân vật</div>
    <div class="eq-wrap"><div class="eq-col">${left.map(slot).join("")}</div>
      <div class="eq-spr">${src ? `<img src="${src}" alt="">` : ""}</div>
      <div class="eq-col">${right.map(slot).join("")}</div></div>
    ${line}
    <div class="stats">
      <div>Công <b>${fmt(st.atk)}</b></div><div>Máu <b>${fmt(st.hp)}</b></div>
      <div>Nội lực <b>${fmt(st.mp)}</b></div><div>Phòng <b>${fmt(st.def)}</b></div>
      <div>Chí mạng <b>${L.fmt1(st.crit)}%</b></div><div>ST chí mạng <b>${fmt(150 + (st.critdmg || 0))}%</b></div>
      <div>Tốc đánh <b>+${L.fmt1(st.aspd || 0)}%</b></div><div>Tốc chạy <b>+${L.fmt1(st.mspd || 0)}%</b></div>
      ${extra}
    </div>${withUnequip ? "" : ""}`;
}
function bindEquipPanel(rerender) {
  document.querySelectorAll("[data-eq]").forEach(b => b.onclick = () => { sel = { type: "eq", id: b.dataset.eq }; rerender(); });
}

// ----- Treo máy -----
function renderIdle() {
  $("idle-left").innerHTML = equipPanelHtml(false);
  bindEquipPanel(() => { const s = sel; setTab("bag"); sel = s; renderBag(); });
  renderIdleStatus();
  renderLog();
  const maps = X.maps.map(m => {
    const ok = L.mapUnlocked(P, m), on = P.mapId === m.id;
    return `<button class="map ${on ? "on" : ""}" data-map="${m.id}" ${ok ? "" : "disabled"} title="${esc(m.desc || "")}">
      ${m.img ? `<img src="${m.img}" alt="">` : `<span class="dot" style="background:${elemColor(m.element)}"></span>`}
      <span>${esc(m.name)}<small>Lv ${m.lvFrom}–${m.lvTo}${ok ? "" : " · khóa"}</small></span></button>`;
  }).join("");
  const bosses = X.maps.map(m => {
    const b = X.bossOf[m.id]; if (!b) return "";
    const why = L.bossCanFight(P, "map", b);
    return `<button class="boss" data-boss="${b.id}" ${why ? "disabled" : ""} style="--el:${elemColor(b.element)}" title="${esc(why || b.note || "")}">
      ${b.img ? `<img src="${b.img}" alt="">` : ""}<span>${esc(b.name)}<small>Lv${b.lv} · ${elemName(b.element)}${P.beaten[b.id] ? " · ✓ đã hạ" : ""}</small></span></button>`;
  }).join("");
  const golds = ["ha", "trung", "thuong"].map(tier => {
    const list = GD.goldBosses.filter(b => b.tier === tier);
    const tk = L.ticketFor(list[0] || { tier });
    return `<div class="gtier">Hoàng Kim · ${GOLD_TIER_NAMES[tier]} <small>${tk ? `vé: ${P.misc[tk.id] || 0}` : ""}</small></div>` + list.map(b => {
      const why = L.bossCanFight(P, "gold", b);
      return `<button class="boss gold" data-gboss="${b.id}" style="--el:${elemColor(b.element)}" title="${esc(why || b.note || "")}" ${why && why.startsWith("Mở") ? "disabled" : ""}>
        ${b.img ? `<img src="${b.img}" alt="">` : ""}<span>${esc(b.name)}<small>Lv${b.lv} · ${elemName(b.element)}${why ? " · " + esc(why) : ""}</small></span></button>`;
    }).join("");
  }).join("");
  $("idle-right").innerHTML = `<div class="panel-t">Bãi luyện</div>${maps}
    <div class="panel-t" style="margin-top:12px">Boss map (hạ boss mở map kế)</div>${bosses}
    <div class="panel-t" style="margin-top:12px">Boss Hoàng Kim</div>${golds}
    <button class="big-btn red" disabled>Party đánh boss<br><small>Giai đoạn sau</small></button>
    <button class="big-btn blue" disabled>Phòng PK<br><small>Giai đoạn sau</small></button>`;
  document.querySelectorAll("[data-map]").forEach(b => b.onclick = () => {
    P.mapId = b.dataset.map; idle.mon = null;
    addLog({ t: `Chuyển tới ${L.getMap(P.mapId).name}.`, c: "info" });
    markDirty(); renderIdle();
  });
  document.querySelectorAll("[data-boss]").forEach(b => b.onclick = () => bossIntro("map", X.boss[b.dataset.boss]));
  document.querySelectorAll("[data-gboss]").forEach(b => b.onclick = () => bossIntro("gold", X.goldBoss[b.dataset.gboss]));
}

function renderIdleStatus() {
  const el = $("idle-status"); if (!el) return;
  const st = L.calcStats(P), map = L.getMap(P.mapId);
  const hp = idle.hp == null ? st.hp : idle.hp, m = idle.mon;
  const resting = idle.restUntil && Date.now() < idle.restUntil;
  const sc = L.idleAttack(P, st);
  el.innerHTML = `<div class="st-row"><span>Đang treo: <b>${esc(map.name)}</b> <small class="muted">Lv ${map.lvFrom}–${map.lvTo} · chiêu: ${esc(sc.sk.name)}</small></span>
    <span class="muted">${resting ? "Đang nghỉ hồi phục..." : ""}</span></div>
    <div class="st-row"><span class="lbl">Bản thân</span><div class="bar"><i style="width:${(hp / st.hp * 100).toFixed(1)}%;background:#d94040"></i><em>${fmt(hp)} / ${fmt(st.hp)}</em></div></div>
    <div class="st-row"><span class="lbl" style="color:${m ? elemColor(m.element) : "#777"}">${m ? esc(m.name) + " Lv" + m.lv : "Tìm quái..."}</span>
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
    if (r.levelUp) idle.hp = null;
    if (r.changed) markDirty(r.levelUp ? 1500 : 8000);
    renderHeader();
    if (tab === "idle") { renderIdleStatus(); if (r.levelUp) $("idle-left").innerHTML = equipPanelHtml(false); }
    if (r.levelUp && tab === "skill") renderSkills();
    idleTimer = setTimeout(step, L.IDLE_TICK);
  };
  idleTimer = setTimeout(step, 600);
}
function stopIdle() { clearTimeout(idleTimer); idleTimer = null; }

function showOffline(o) {
  const h = Math.floor(o.seconds / 3600), m = Math.floor(o.seconds % 3600 / 60);
  const kept = o.kept.slice(0, 12).map(it => `<div class="rw" style="color:${rarityColor(it.r)}">${itemIcon(it, 26)} ${esc(it.name)} Lv${it.lv}</div>`).join("");
  modal(`<h3>Treo máy khi vắng mặt</h3>
    <p class="muted">Vắng ${h} giờ ${m} phút (tính tối đa ${S.offlineHours ?? 8} giờ)</p>
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
  bindEquipPanel(renderBag);
  const items = [...P.bag].sort((a, b) => b.r - a.r || X.slotOrder.indexOf(a.slot) - X.slotOrder.indexOf(b.slot) || b.lv - a.lv);
  const cells = [];
  for (let i = 0; i < (S.invSize || 40); i++) {
    const it = items[i];
    if (!it) { cells.push(`<div class="cell">${emptyBox(48)}</div>`); continue; }
    const better = L.itemScore(it) > L.itemScore(P.equip[it.slot]);
    const tooHigh = !L.canEquipLevel(P, it);
    cells.push(`<button class="cell ${sel && sel.type === "item" && sel.id === it.id ? "sel" : ""}" data-item="${it.id}" title="${esc(itemTitle(it))}">
      ${itemIcon(it, 48)}${better && !tooHigh ? `<span class="up">▲</span>` : ""}${tooHigh ? `<span class="lock">Lv${it.lv}</span>` : ""}</button>`);
  }
  $("bag-grid").innerHTML = cells.join("");
  $("bag-e-title").textContent = `Ngăn trang bị ${P.bag.length}/${S.invSize || 40}`;
  // vật phẩm + bí kíp
  const mcells = [];
  (GD.misc || []).forEach(m => {
    const q = P.misc[m.id] || 0; if (!q) return;
    const st = Math.max(1, m.stack || 1);
    for (let left = q; left > 0; left -= st) {
      const n = Math.min(st, left);
      const keys = Object.keys(P.hot).filter(k => P.hot[k] === m.id);
      mcells.push(`<button class="cell ${sel && sel.type === "misc" && sel.id === m.id ? "sel" : ""}" data-misc="${m.id}" title="${esc(m.name)}">
        ${iconBox(m.img, "misc", "#6a7090", 48, `<b class="qty">${n}</b>${keys.length ? `<i class="hk">${keys.join(",")}</i>` : ""}`)}</button>`);
    }
  });
  Object.keys(P.books).forEach(id => {
    const b = X.bikip[id], q = P.books[id]; if (!b || !q) return;
    const own = b.sect === P.sect;
    mcells.push(`<button class="cell ${sel && sel.type === "book" && sel.id === id ? "sel" : ""}" data-book="${id}" title="${esc(b.name)}">
      ${iconBox(b.img, "book", own ? "#f2c230" : "#777", 48, `<b class="qty">${q}</b>`)}</button>`);
  });
  const used = L.miscSlotsUsed(P), cap = S.invMiscSize || 30;
  for (let i = mcells.length; i < cap; i++) mcells.push(`<div class="cell">${emptyBox(48)}</div>`);
  $("misc-grid").innerHTML = mcells.join("");
  $("bag-m-title").textContent = `Ngăn vật phẩm ${used}/${cap}`;
  $("bag-auto").checked = !!P.autoSellCommon;
  document.querySelectorAll("[data-item]").forEach(b => b.onclick = () => { sel = { type: "item", id: b.dataset.item }; renderBag(); });
  document.querySelectorAll("[data-misc]").forEach(b => b.onclick = () => { sel = { type: "misc", id: b.dataset.misc }; renderBag(); });
  document.querySelectorAll("[data-book]").forEach(b => b.onclick = () => { sel = { type: "book", id: b.dataset.book }; renderBag(); });
  renderDetail();
}

function renderDetail() {
  const box = $("bag-detail");
  if (!sel) { box.innerHTML = `<div class="muted">Bấm vào một món để xem chi tiết. ▲ là đồ tốt hơn đồ đang mặc; số Lv đỏ là đồ chưa đủ cấp.</div>`; return; }
  if (sel.type === "eq") {
    const it = P.equip[sel.id];
    if (!it) { sel = null; return renderDetail(); }
    box.innerHTML = itemDetailHtml(it) + `<div class="m-act"><button class="btn ghost" id="d-uneq">Tháo ra</button></div>`;
    $("d-uneq").onclick = () => { const e = L.unequip(P, sel.id); if (e) return toast(e); sel = null; markDirty(2000); renderAll(); };
    return;
  }
  if (sel.type === "item") {
    const it = P.bag.find(x => x.id === sel.id);
    if (!it) { sel = null; return renderDetail(); }
    const cur = P.equip[it.slot], a = L.itemStats(it), b = L.itemStats(cur);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const diff = keys.map(k => {
      const d = (a[k] || 0) - (b[k] || 0); if (Math.abs(d) < 0.05) return "";
      return `<div class="${d > 0 ? "good" : "bad"}">${esc(statName(k))} ${d > 0 ? "+" : ""}${statVal(k, d)}</div>`;
    }).join("");
    const tooHigh = !L.canEquipLevel(P, it);
    const wt = L.itemWeaponType(it);
    let wnote = "";
    if (wt) {
      const s = X.sect[P.sect];
      wnote = (s.weapon1 === wt || s.weapon2 === wt) ? `<div class="good small">Hợp đường ${esc(s.weapon1 === wt ? s.path1 : s.path2)}</div>`
        : `<div class="bad small">Phái ${esc(s.name)} cầm ${WEAPON_NAMES[wt]} không dùng được chiêu chính (chỉ dùng buff).</div>`;
    }
    box.innerHTML = itemDetailHtml(it) + wnote + `<div class="det-sub">So với đồ đang mặc${cur ? "" : " (đang trống)"}</div>
      <div class="det-stats">${diff || '<div class="muted">Như nhau</div>'}</div>
      ${tooHigh ? `<div class="bad">Cần cấp ${it.lv - (S.maxOverLevel ?? 5)} để mặc.</div>` : ""}
      <div class="m-act"><button class="btn" id="d-equip" ${tooHigh ? "disabled" : ""}>Mặc</button>
      <button class="btn ghost" id="d-sell">Bán +${fmt(L.sellPrice(it))} vàng</button></div>`;
    $("d-equip").onclick = () => { const e = L.equipItem(P, it.id); if (e) return toast(e); sel = null; markDirty(2000); renderAll(); };
    $("d-sell").onclick = () => {
      const doSell = () => { const g = L.sellItem(P, it.id); toast(`Đã bán, +${fmt(g)} vàng`); sel = null; markDirty(); renderAll(); };
      if (it.r >= 3 || it.gold) {
        modal(`<h3>Bán ${esc(it.name)}?</h3><p>Đồ ${rarityOf(it.r).name} bán xong không lấy lại được.</p>
          <div class="m-act"><button class="btn danger" id="m-ok">Bán</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
        $("m-ok").onclick = () => { closeModal(); doSell(); };
      } else doSell();
    };
    return;
  }
  if (sel.type === "misc") {
    const m = X.misc[sel.id], q = P.misc[sel.id] || 0;
    if (!m || !q) { sel = null; return renderDetail(); }
    const canHot = ["hp", "mp", "cure"].includes(m.kind);
    const keys = Object.keys(P.hot).filter(k => P.hot[k] === m.id);
    box.innerHTML = `<div class="det-head">${iconBox(m.img, "misc", "#6a7090", 56)}<div><div style="font-weight:600;color:#fff">${esc(m.name)} ×${q}</div>
      <div class="muted small">Vật phẩm · xếp chồng ${m.stack || 1} · không bán được</div></div></div>
      <div class="det-stats">${esc(m.desc || "")}</div>
      ${m.cd ? `<div class="muted small">Chờ ${m.cd} giây giữa 2 lần dùng</div>` : ""}
      ${canHot ? `<div class="det-sub">Phím dùng trong trận${keys.length ? ": đang gán phím " + keys.join(", ") : ""}</div>
        <div class="m-act">${["1", "2", "3"].map(k => `<button class="btn ghost small-btn" data-hot="${k}">Gán phím ${k}</button>`).join("")}</div>` : ""}`;
    document.querySelectorAll("[data-hot]").forEach(b => b.onclick = () => { P.hot[b.dataset.hot] = m.id; markDirty(); toast(`Phím ${b.dataset.hot}: ${m.name}`); renderBag(); });
    return;
  }
  if (sel.type === "book") {
    const b = X.bikip[sel.id], q = P.books[sel.id] || 0;
    if (!b || !q) { sel = null; return renderDetail(); }
    const own = b.sect === P.sect, lv = P.bikip[b.id] || 0;
    box.innerHTML = `<div class="det-head">${iconBox(b.img, "book", own ? "#f2c230" : "#777", 56)}<div><div style="font-weight:600;color:#fff">${esc(b.name)} ×${q}</div>
      <div class="muted small">Bí kíp ${BIKIP_TIER_NAMES[b.tier]} · ${esc((X.sect[b.sect] || {}).name || "")}</div></div></div>
      <div class="det-stats">${esc(b.desc || "")}</div>
      ${own ? `<div class="small">Đang luyện cấp ${lv}/${b.maxLv || 3}</div>` : `<div class="muted small">Phái khác không đọc được, chỉ bán lấy vàng.</div>`}
      <div class="m-act">${own ? `<button class="btn" id="d-read" ${lv >= (b.maxLv || 3) ? "disabled" : ""}>Đọc</button>` : `<button class="btn ghost" id="d-bsell">Bán +${fmt(BIKIP_SELL[b.tier] || 1000)} vàng</button>`}</div>`;
    if (own) $("d-read").onclick = () => { const e = L.readBook(P, b.id); if (e) return toast(e); toast(`Đã luyện ${b.name} lên cấp ${P.bikip[b.id]}`); markDirty(1000); renderAll(); };
    else $("d-bsell").onclick = () => { const g = L.sellBook(P, b.id); toast(`Đã bán, +${fmt(g)} vàng`); markDirty(); renderAll(); };
  }
}
$("bag-sellall").onclick = () => {
  const r = L.sellAllCommon(P);
  toast(r.n ? `Đã bán ${r.n} món Thường, +${fmt(r.g)} vàng` : "Không có đồ Thường để bán.");
  markDirty(); renderAll();
};
$("bag-auto").onchange = e => { P.autoSellCommon = e.target.checked; markDirty(); };

// ----- Kỹ năng -----
function skillNumbers(sc) {
  if (!sc) return "";
  const s = sc.sk, out = [];
  if (s.slot === "p1" || s.slot === "p2") {
    const tg = X.skill[s.target];
    return (s.boosts || []).map(b => `${({ dmg: "Sát thương", aspd: "Tốc đánh", cd: "Hồi chiêu", size: "Vùng", dur: "Thời gian", count: "Số lượng", mp: "Nội lực", effectChance: "Tỉ lệ hiệu ứng", crit: "Chí mạng", critdmg: "ST chí mạng" })[b.attr] || b.attr} ${b.per >= 0 ? "+" : ""}${L.fmt1(b.per * sc.lv)}${b.attr === "count" ? "" : "%"}`).join(" · ") + (tg ? ` cho ${tg.name}` : "");
  }
  if (sc.dmg) out.push(`Sát thương ${fmt(sc.dmg)}% công${sc.flat ? ` + ${fmt(sc.flat)}` : ""}`);
  if (s.slot === "lmb" && sc.aspd) out.push(`${L.fmt1(sc.aspd)} đòn/giây`);
  if (sc.cd) out.push(`Hồi chiêu ${L.fmt1(sc.cd)} giây`);
  if (sc.mp) out.push(`Nội lực ${sc.mp}`);
  if (sc.dur) out.push(`Thời gian ${L.fmt1(sc.dur)} giây`);
  if (sc.size && s.mech !== "crescent") out.push(`Vùng ${fmt(sc.size)}`);
  if (sc.count > 1) out.push(`Số lượng ${sc.count}`);
  sc.stats.forEach(x => out.push(`${statName(x.stat)} +${statVal(x.stat, x.v)}`));
  return out.join(" · ");
}
function renderSkills() {
  const st = L.calcStats(P), bonus = L.skillBonusLevels(P), wt = L.equippedWeapon(P);
  const gem = miscByKind("skillup")[0], rs = miscByKind("reset")[0];
  const gems = L.countKind(P, "skillup"), resets = L.countKind(P, "reset");
  const col = path => {
    const set = (X.skillOf[P.sect] || {})[path] || {};
    const rows = ["lmb", "rmb", "p1", "p2", "q"].map(slot => {
      const s = set[slot]; if (!s) return "";
      const base = P.skills[s.id] || 0, eff = L.skillLevel(P, s.id, bonus);
      const sc = base ? L.skillCalc(P, s.id, st, bonus) : null;
      const next = base < s.maxLv ? (() => { const tmp = { ...P, skills: { ...P.skills, [s.id]: base + 1 } }; return L.skillCalc(tmp, s.id, st, bonus); })() : null;
      const cost = L.upgradeCost(P, s.id);
      const can = base < s.maxLv && P.skillPoints >= cost.points && gems >= cost.gems;
      const wtag = s.weapon ? `<span class="${s.weapon === wt ? "good" : "bad"}">cần ${WEAPON_NAMES[s.weapon]}</span>` : `<span class="muted">cầm gì cũng dùng được</span>`;
      return `<div class="sk-row">
        ${iconBox(s.img, "skill", base ? "#f2c230" : "#555", 40)}
        <div class="sk-main"><div class="sk-name">${esc(s.name)} <small class="muted">${SLOT_NAMES_KEYS[slot]}</small></div>
          <div class="small">${wtag}</div>
          <div class="sk-desc">${esc(s.desc || "")}</div>
          ${sc ? `<div class="sk-num">${esc(skillNumbers(sc))}</div>` : ""}
          ${next ? `<div class="sk-next muted">Cấp ${base + 1}: ${esc(skillNumbers(next))}</div>` : ""}</div>
        <div class="sk-lv">Cấp ${base}/${s.maxLv}${eff > base ? ` <span class="good">+${eff - base}</span>` : ""}</div>
        <button class="mini plus" data-sk="${s.id}" ${can ? "" : "disabled"} title="${base >= s.maxLv ? "Tối đa" : `Tốn ${cost.points} điểm${cost.gems ? `, ${cost.gems} ${gem ? gem.name : "ngọc"}` : ""}`}">
          +<small>${base >= s.maxLv ? "max" : `${cost.points}đ${cost.gems ? " · " + cost.gems + " ngọc" : ""}`}</small></button></div>`;
    }).join("");
    const on = L.activePath(P) === path;
    return `<div class="sk-col"><div class="sk-path ${on ? "on" : ""}">${esc(sectPathName(P.sect, path))} · ${WEAPON_NAMES[sectPathWeapon(P.sect, path)] || ""}${on ? " · đang dùng" : ""}</div>${rows}</div>`;
  };
  $("tab-skill").innerHTML = `<div class="panel wide">
    <div class="sk-head"><span class="panel-t">Kỹ năng · ${esc(X.sect[P.sect].name)}</span>
      <span class="pts">Điểm skill: <b>${P.skillPoints}</b> · ${esc(gem ? gem.name : "Ngọc")}: <b>${gems}</b>
      <button class="btn danger small-btn" id="sk-reset">Reset (${resets} ${esc(rs ? rs.name : "")})</button></span></div>
    <p class="muted small">Mỗi cấp nhân vật được 1 điểm. Học skill tốn 1 điểm; nâng lên cấp n tốn thêm ${(S.skillGemMul ?? 1) === 1 ? "" : (S.skillGemMul + " × ")}(n − 1) ${esc(gem ? gem.name : "ngọc")}. Skill cần vũ khí khác vẫn nâng được, đổi vũ khí là dùng ngay. Thanh chiến đấu dùng skill của đường đang cầm vũ khí.</p>
    <div class="sk-cols">${col(1)}${col(2)}</div></div>`;
  document.querySelectorAll("[data-sk]").forEach(b => b.onclick = () => {
    const e = L.upgradeSkill(P, b.dataset.sk);
    if (e) return toast(e);
    markDirty(2000); renderAll();
  });
  $("sk-reset").onclick = () => {
    modal(`<h3>Reset kỹ năng?</h3><p>Tốn 1 ${esc(rs ? rs.name : "ngọc reset")}. Trả lại toàn bộ điểm skill và ${S.resetRefund ?? 100}% ${esc(gem ? gem.name : "ngọc")} đã dùng (${fmt(Math.floor(P.gemsSpent * (S.resetRefund ?? 100) / 100))} viên).</p>
      <div class="m-act"><button class="btn danger" id="m-ok">Reset</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
    $("m-ok").onclick = () => { const e = L.resetSkills(P); closeModal(); if (e) return toast(e); markDirty(1000); renderAll(); toast("Đã reset kỹ năng."); };
  };
}

// ----- Cửa hàng -----
const KIND_ORDER = ["hp", "mp", "cure", "revive", "skillup", "reset", "ticket", "other"];
const KIND_NAMES = { hp: "Hồi máu", mp: "Hồi nội lực", cure: "Giải hiệu ứng", revive: "Hồi sinh", skillup: "Nâng skill", reset: "Reset skill", ticket: "Vé boss Hoàng Kim", other: "Khác" };
function renderShop() {
  const list = (GD.misc || []).filter(m => m.shop);
  const groups = KIND_ORDER.map(k => {
    const ms = list.filter(m => m.kind === k); if (!ms.length) return "";
    return `<div class="shop-g">${KIND_NAMES[k]}</div>` + ms.map(m => `<div class="shop-row">
      ${iconBox(m.img, "misc", "#6a7090", 40)}
      <div class="shop-main"><div class="sk-name">${esc(m.name)} <small class="muted">đang có ${fmt(P.misc[m.id] || 0)}</small></div><div class="small muted">${esc(m.desc || "")}</div></div>
      <span class="gold">${fmt(m.price || 0)}</span>
      <input type="number" min="1" value="1" class="qty-in" id="q-${m.id}">
      <button class="btn small-btn" data-buy="${m.id}">Mua</button></div>`).join("");
  }).join("");
  $("tab-shop").innerHTML = `<div class="panel wide"><div class="sk-head"><span class="panel-t">Cửa hàng</span>
    <span>Vàng: <b class="gold">${fmt(P.gold)}</b> · Ngăn vật phẩm ${L.miscSlotsUsed(P)}/${S.invMiscSize || 30}</span></div>
    <p class="muted small">Đồ mua xong vào ngăn vật phẩm. Thuốc dùng trong trận bằng phím 1, 2, 3 (gán phím trong Túi đồ).</p>${groups}</div>`;
  document.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => {
    const id = b.dataset.buy, q = Number($("q-" + id).value) || 1;
    const e = L.buy(P, id, q);
    if (e) return toast(e);
    toast(`Đã mua ${q} ${X.misc[id].name}`);
    L.defaultHotkeys(P);
    markDirty(1500); renderAll();
  });
}

// ----- Bí kíp -----
function renderBooks() {
  const own = GD.bikip.filter(b => b.sect === P.sect).sort((a, b) => ["ha", "trung", "cao"].indexOf(a.tier) - ["ha", "trung", "cao"].indexOf(b.tier));
  const rows = own.map(b => {
    const lv = P.bikip[b.id] || 0, have = P.books[b.id] || 0, max = b.maxLv || 3;
    const lines = b.stats.map(x => `<div>${esc(statName(x.stat))}: ${[1, 2, 3].map(i => `<span class="${lv === i ? "gold" : lv > i ? "" : "muted"}">${statVal(x.stat, x["v" + i])}</span>`).join(" / ")}</div>`).join("");
    return `<div class="bk-row">${iconBox(b.img, "book", lv ? "#f2c230" : "#555", 56)}
      <div class="sk-main"><div class="sk-name">${esc(b.name)} <small class="muted">${BIKIP_TIER_NAMES[b.tier]}</small></div>
      <div class="small">${esc(b.desc || "")}</div><div class="small" style="margin-top:4px">${lines}</div></div>
      <div class="sk-lv">Cấp ${lv}/${max}<br><small class="muted">có ${have} cuốn</small></div>
      <button class="btn small-btn" data-read="${b.id}" ${have && lv < max ? "" : "disabled"}>Đọc</button></div>`;
  }).join("");
  $("tab-book").innerHTML = `<div class="panel wide"><div class="panel-t">Bí kíp · ${esc(X.sect[P.sect].name)}</div>
    <p class="muted small">Bí kíp rơi từ boss (boss map dưới 1/260, boss Hoàng Kim ${GD.goldBosses[0] ? GD.goldBosses[0].bikipChance : 15}%). Đọc trùng để lên cấp, tối đa 3. Bí kíp phái khác bán lấy vàng trong Túi đồ. Tác dụng dùng chung cho cả 2 đường.</p>${rows}</div>`;
  document.querySelectorAll("[data-read]").forEach(b => b.onclick = () => {
    const e = L.readBook(P, b.dataset.read); if (e) return toast(e);
    toast(`Đã luyện lên cấp ${P.bikip[b.dataset.read]}`); markDirty(1000); renderAll();
  });
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
      return `<tr><td>${esc(p.name)}</td><td>${esc(p.username || p.uid)}</td><td>${X.sect[p.sect] ? esc(X.sect[p.sect].name) : "-"}</td>
        <td>${X.gender[p.gender] ? esc(X.gender[p.gender].name) : "-"}</td><td>${p.level}</td><td>${fmt(p.gold || 0)}</td>
        <td>${(p.bag || p.inventory || []).length}</td><td>${p.version === L.SAVE_VERSION ? "2.0" : "cũ"}</td><td>${online ? '<span class="good">Đang online</span>' : seen}</td></tr>`;
    }).join("");
    box.innerHTML = `<div class="panel wide"><div class="sk-head"><span class="panel-t">Danh sách người chơi (${list.length})</span>
      <button class="btn ghost" id="ad-ref">Tải lại</button></div>
      <table class="tbl"><thead><tr><th>Nhân vật</th><th>Tài khoản</th><th>Phái</th><th>Giới tính</th><th>Cấp</th><th>Vàng</th><th>Đồ</th><th>Bản</th><th>Lần cuối</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="muted">Chưa có ai</td></tr>'}</tbody></table>
      <p class="muted">Thêm người chơi: Firebase Console → Authentication → Users → Add user. Email nhập dạng <b>tendangnhap@vlyn.game</b>, mật khẩu từ 6 ký tự.</p></div>`;
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
function bossIntro(kind, b) {
  if (!b) return;
  const col = elemColor(b.element), pe = X.sect[P.sect].element;
  const note = elemBonus(pe, b.element) > 1 ? `<span class="good">${elemName(pe)} khắc ${elemName(b.element)}: bạn gây thêm ${S.counterBonus ?? 15}% sát thương.</span>`
    : elemBonus(b.element, pe) > 1 ? `<span class="bad">${elemName(b.element)} khắc ${elemName(pe)}: bạn nhận thêm ${S.counterBonus ?? 15}% sát thương.</span>` : "Không tương khắc.";
  const why = L.bossCanFight(P, kind, b);
  const tk = kind === "gold" ? L.ticketFor(b) : null;
  const pats = (b.patterns || []).map(p => (X.pattern[p] || {}).name || p).join(", ");
  const path = L.activePath(P), set = (X.skillOf[P.sect] || {})[path] || {};
  const keyLine = (k, slot) => { const s = set[slot]; return s ? `<div><b>${k}</b> ${esc(s.name)}${!P.skills[s.id] ? ' <span class="bad">(chưa học)</span>' : !L.weaponOk(P, s) ? ` <span class="bad">(cần ${WEAPON_NAMES[s.weapon]})</span>` : ""}</div>` : ""; };
  const hk = k => { const m = X.misc[P.hot[k]]; return m ? `<div><b>${k}</b> ${esc(m.name)} ×${P.misc[m.id] || 0}</div>` : ""; };
  const reward = kind === "gold"
    ? `Rơi ${b.drops} món · bí kíp ${b.bikipChance}% (tối đa ${BIKIP_TIER_NAMES[{ ha: "ha", trung: "trung", thuong: "cao" }[b.bikipMax] || "ha"]}) · đồ Hoàng Kim ${b.goldItemChance ?? 10}%`
    : `Rơi ${b.drops} món (+${b.dropExtra}% thêm 1 món) · bí kíp ${BIKIP_TIER_NAMES[b.bikipTier] || ""} ${b.bikipChance}%${!P.beaten[b.id] ? " · hạ lần đầu mở map kế" : ""}`;
  modal(`<div class="det-head">${b.img ? `<img src="${b.img}" class="boss-big" alt="">` : ""}<div><h3 style="color:${col};margin:0">${esc(b.name)} · Lv${b.lv} (${elemName(b.element)})</h3>
    <div class="muted small">${esc(b.note || "")}</div></div></div>
    <p class="small">Máu <b>${fmt(b.hp)}</b> · Công <b>${fmt(b.atk)}</b> · Phòng <b>${fmt(b.def)}</b>${b.effect ? ` · gây ${esc((X.effect[b.effect] || {}).name || b.effect)} ${b.effectChance}%` : ""}<br>Chiêu: ${esc(pats)}</p>
    <p class="small muted">${reward}</p>
    <div class="ctrl"><div><b>WASD</b> di chuyển</div><div><b>Space</b> lướt né</div>
      ${keyLine("Chuột trái", "lmb")}${keyLine("Chuột phải", "rmb")}${keyLine("Q", "q")}<div><b>Esc</b> tạm dừng / bỏ chạy</div>
      ${hk("1")}${hk("2")}${hk("3")}</div>
    <p>${note}</p>
    ${tk ? `<p class="small">Vào trận tốn 1 <b>${esc(tk.name)}</b> (đang có ${P.misc[tk.id] || 0}). Bỏ chạy không hoàn vé.</p>` : ""}
    ${why ? `<p class="bad">${esc(why)}</p>` : ""}
    <div class="m-act"><button class="btn" id="m-fight" ${why ? "disabled" : ""}>Vào trận</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
  $("m-fight").onclick = () => {
    if (L.bossCanFight(P, kind, b)) return;
    if (tk) L.useMisc(P, tk.id, 1);
    closeModal();
    startBattle(kind, b);
  };
}

function startBattle(kind, b) {
  stopIdle();
  show("scr-battle");
  const map = kind === "map" ? L.getMap(b.map) : (X.map[b.unlock] || L.getMap(P.mapId));
  battle = new Battle($("cv"), P, { kind, boss: b, map }, (result, used) => {
    battle = null;
    idle.hp = null; idle.mon = null;
    show("scr-main");
    const usedTxt = Object.keys(used || {}).map(id => `${X.misc[id] ? X.misc[id].name : id} ×${used[id]}`).join(", ");
    if (result === "win") {
      const r = L.bossRewards(P, kind, b);
      const items = r.items.map(x => `<div class="rw" style="color:${rarityColor(x.it.r)}">${itemIcon(x.it, 28)} [${rarityOf(x.it.r).name}] ${esc(x.it.name)} Lv${x.it.lv}
        ${x.kept ? "" : `<small class="muted">(túi đầy, tự bán +${fmt(x.gold)})</small>`}</div>`).join("");
      const golds = r.gold_items.map(x => `<div class="rw" style="color:#ffd23f">${itemIcon(x.it, 28)} [Hoàng Kim] ${esc(x.it.name)}${x.kept ? "" : " (túi đầy, tự bán)"}</div>`).join("");
      const books = r.books.map(x => `<div class="rw gold">${iconBox(x.book.img, "book", "#f2c230", 28)} Bí kíp ${esc(x.book.name)}${x.kept ? "" : " (túi vật phẩm đầy, mất)"}</div>`).join("");
      const misc = r.misc.map(x => `<div class="rw">${iconBox(x.misc.img, "misc", "#6a7090", 24)} ${esc(x.misc.name)} ×${x.qty}${x.kept ? "" : " (túi vật phẩm đầy)"}</div>`).join("");
      modal(`<h3 style="color:#f2c230">Đánh bại ${esc(b.name)}!</h3>
        <div class="rw">EXP <b>+${fmt(r.exp)}</b>${r.levels.length ? ` · <span class="lvup">Lên cấp ${r.levels[r.levels.length - 1]}!</span>` : ""}</div>
        <div class="rw">Vàng <b>+${fmt(r.gold)}</b></div>${golds}${books}${items}${misc}
        ${r.unlocked ? `<div class="rw lvup">Mở khóa map mới: ${esc(r.unlocked.name)}</div>` : ""}
        ${usedTxt ? `<div class="muted small">Đã dùng: ${esc(usedTxt)}</div>` : ""}
        <div class="m-act"><button class="btn" onclick="closeModal()">Nhận</button></div>`);
      addLog({ t: `Đánh bại ${b.name}! +${fmt(r.exp)} EXP, +${fmt(r.gold)} vàng`, c: "level" });
      r.gold_items.forEach(x => addLog({ t: `Boss rớt [Hoàng Kim] ${x.it.name}!`, c: "r4" }));
      r.books.forEach(x => addLog({ t: `Boss rớt bí kíp ${x.book.name}!`, c: "level" }));
      r.items.forEach(x => addLog({ t: `Boss rớt [${rarityOf(x.it.r).name}] ${x.it.name}`, c: "r" + x.it.r }));
      if (r.unlocked) addLog({ t: `Mở khóa ${r.unlocked.name}.`, c: "level" });
    } else if (result === "lose") {
      modal(`<h3 class="bad">Thất bại</h3><p>Bị ${esc(b.name)} đánh bại. Treo máy thêm, nâng đồ và kỹ năng rồi quay lại.</p>
        ${usedTxt ? `<div class="muted small">Đã dùng: ${esc(usedTxt)}</div>` : ""}
        <div class="m-act"><button class="btn" onclick="closeModal()">Về thành</button></div>`);
    } else toast("Đã bỏ chạy khỏi trận.");
    saveNow();
    renderAll();
    startIdle();
  });
  battle.start();
}

// móc nhỏ để thử nghiệm trên trình duyệt (không ảnh hưởng chơi)
window.VLYN = { get P() { return P; }, get battle() { return battle; }, L, X };
