// ===== GIAO DIỆN CHÍNH — bản 2.2 =====
import * as store from "./store.js";
import * as net from "./net.js";
import {
  GD, S, X, loadGameData, elemBonus, elemColor, elemName, statName, statPct, rarityOf, miscByKind,
  sectPathWeapon, sectPathName, WEAPON_NAMES, SLOT_NAMES_KEYS, BIKIP_TIER_NAMES, GOLD_TIER_NAMES, BIKIP_SELL
} from "./data.js";
import * as L from "./logic.js";
import { iconBox, rarityColor, emptyBox, rarityClass, LOCK_SVG } from "./icons.js";
import { Battle } from "./battle.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = L.fmt;

let user = null, P = null, CID = null;   // CID = mã nhân vật đang chơi (ô 1: mã tài khoản, ô 2–3: thêm _2, _3)
let charList = [];
let idle = { mon: null, hp: null, restUntil: 0 };
let idleTimer = null, saveTimer = null, battle = null;
let logs = [];
let tab = "idle", sel = null;     // sel = {type:"item"|"eq"|"misc"|"book", id}
let bagTab = "eq", skTab = null;  // tab con trong Túi đồ và Kỹ năng (Kỹ năng mở sẵn đường đang cầm vũ khí)

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

function itemIcon(it, size = 44, withLock = false) {
  const col = rarityColor(it.r);
  return iconBox(L.itemImg(it), it.slot, col, size, withLock && it.lock ? LOCK_SVG : "", rarityClass(it.r, X.goldRar));
}
const INV = () => S.invSize || 50;
// viền vật phẩm: Tuyết Liên theo loại (Hạ xanh, Trung tím, Thượng cam), lễ bao vàng (bản 2.3)
const miscColor = m => m.kind === "levelup" ? rarityColor({ ha: 1, trung: 2, thuong: 3 }[m.bossTier] ?? 1) : m.kind === "newbie" ? "#f2c230" : "#6a7090";
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
  if (!P || !user || !CID) return;
  clearTimeout(saveTimer); saveTimer = null;
  P.lastSeen = Date.now();
  try { await store.savePlayer(CID, P); }
  catch (e) { console.error(e); toast(e.backup ? "Lưu lên Firebase lỗi, đã lưu tạm trong máy. Lần sau lưu được sẽ tự đẩy lên." : "Lưu thất bại: " + (e.code || e.message)); }
}
function markDirty(delay = 5000) { if (!saveTimer) saveTimer = setTimeout(saveNow, delay); }
setInterval(() => { if (P) saveNow(); }, 300000);      // tự lưu 5 phút 1 lần (thao tác quan trọng vẫn lưu ngay)
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
    try { await showChars(); }
    catch (e) {
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
  const remember = $("login-remember").checked;
  localStorage.setItem("vlyn_remember", remember ? "1" : "0");
  try { await store.login($("login-user").value, $("login-pass").value, remember); }
  catch (err) { $("login-err").textContent = err.message; }
  btn.disabled = false; btn.textContent = "Đăng nhập";
});

$("login-remember").checked = localStorage.getItem("vlyn_remember") !== "0";

// ---------- Chọn nhân vật (bản 2.3: mỗi tài khoản 3 ô) ----------
const fmtDur = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h} giờ ${m} phút` : `${m} phút`; };
async function showChars() {
  show("scr-chars");
  $("chars-user").textContent = user.username;
  $("chars-list").innerHTML = `<div class="muted">Đang tải nhân vật...</div>`;
  charList = await store.listChars(user);
  const cap = (S.offlineHours ?? 24) * 3600;
  $("chars-list").innerHTML = charList.map((c, i) => {
    const d = c.data;
    if (!d) return `<div class="chslot empty"><div class="chav"><span>+</span></div><div class="muted small">Ô trống ${i + 1}/${store.MAX_CHARS}</div>
      <button class="btn ghost" data-cnew="${c.cid}">+ Tạo nhân vật</button></div>`;
    if (d.version !== L.SAVE_VERSION) return `<div class="chslot"><div class="chav"><span>?</span></div><b class="chname">${esc(d.name || "Nhân vật cũ")}</b>
      <span class="muted small">Nhân vật bản 1, không dùng tiếp được</span><button class="btn ghost" data-cnew="${c.cid}">Tạo nhân vật mới</button></div>`;
    const sc = X.sect[d.sect] || {}, away = Math.max(0, (Date.now() - (d.lastSeen || Date.now())) / 1000);
    return `<div class="chslot"><div class="chav" style="border-color:${elemColor(sc.element)}">${sc.img ? `<img src="${sc.img}" alt="">` : ""}</div>
      <b class="chname">${esc(d.name)}</b><span class="muted small">Lv${d.level} · ${esc(sc.name || "")} · ${esc((X.gender[d.gender] || {}).name || "")}</span>
      <span class="small good">${away > 120 ? `Treo máy: +${fmtDur(Math.min(away, cap))}${away >= cap ? " (tối đa)" : ""}` : "Vừa chơi"}</span>
      <button class="btn" data-cin="${c.cid}">Vào game</button><button type="button" class="linkbtn" data-cdel="${c.cid}">Xóa nhân vật</button></div>`;
  }).join("");
  document.querySelectorAll("[data-cin]").forEach(b => b.onclick = () => enterChar(b.dataset.cin));
  document.querySelectorAll("[data-cnew]").forEach(b => b.onclick = () => showCreate((charList.find(c => c.cid === b.dataset.cnew) || {}).data, b.dataset.cnew));
  document.querySelectorAll("[data-cdel]").forEach(b => b.onclick = () => deleteModal(b.dataset.cdel));
}
async function enterChar(cid) {
  const c = charList.find(x => x.cid === cid);
  if (!c || !c.data) return;
  P = L.normalizePlayer(c.data); CID = cid;
  logs = []; renderLog._init = false; idle = { mon: null, hp: null, restUntil: 0 }; sel = null; tab = "idle";
  store.claimName(user, cid, P.name).catch(e => console.error("name", e));   // nhân vật tạo trước bản 2.3: giữ tên
  const away = (Date.now() - (P.lastSeen || Date.now())) / 1000;
  const off = away > 120 ? L.offlineGains(P, away) : null;
  startMain();
  if (off && off.kills > 0) showOffline(off);
  await saveNow();
  claimMarket();
}
// Tùy chỉnh → Chọn nhân vật: lưu rồi ra màn chọn (nhân vật vẫn tính treo máy khi vắng mặt)
async function toCharSelect() {
  if (battle) return toast("Đang trong trận.");
  await saveNow();
  stopIdle(); closeModal();
  P = null; CID = null;
  net.setMe({ st: "idle" });
  await showChars();
}
async function deleteModal(cid) {
  const c = charList.find(x => x.cid === cid), d = c && c.data;
  if (!d) return;
  modal(`<h3>Xóa nhân vật ${esc(d.name)}</h3><p class="muted">Đang kiểm tra Chợ...</p>`);
  let info = { listings: 0, gold: 0 };
  try { info = await store.charMarketInfo(user, cid); } catch (e) { console.error(e); }
  modal(`<h3 class="bad">Xóa vĩnh viễn nhân vật ${esc(d.name)}?</h3>
    <p>Sẽ mất toàn bộ:</p>
    <div class="rw">· Túi đồ, đồ đang mặc, ${fmt(d.gold || 0)} vàng, kỹ năng (Lv${d.level || 1})</div>
    <div class="rw">· <b>${info.listings} món đang rao trên Chợ</b></div>
    <div class="rw">· ${fmt(info.gold)} vàng bán hàng chưa nhận</div>
    <form id="del-form" class="form" style="margin-top:10px">
      <label>${store.DEMO ? "Gõ lại đúng tên nhân vật để xác nhận" : "Nhập mật khẩu tài khoản để xác nhận"}
        <input id="del-pw" type="${store.DEMO ? "text" : "password"}" autocomplete="${store.DEMO ? "off" : "current-password"}"></label>
      <div class="bad" id="del-err"></div>
      <div class="m-act"><button class="btn ghost" type="button" onclick="closeModal()">Hủy</button><button class="btn danger" type="submit">Xóa vĩnh viễn</button></div>
    </form>`);
  $("del-pw").focus();
  $("del-form").onsubmit = async e => {
    e.preventDefault();
    const btn = $("del-form").querySelector("button[type=submit]"); btn.disabled = true;
    try {
      await store.deleteChar(user, cid, d.name, $("del-pw").value);
      closeModal(); toast(`Đã xóa nhân vật ${d.name}.`);
      await showChars();
    } catch (err) { $("del-err").textContent = err.message; btn.disabled = false; }
  };
}
$("chars-logout").onclick = () => store.logout();

// ---------- Tạo nhân vật ----------
let cGender = "nam", cSect = null, cSlot = null;
function showCreate(old, cid) {
  cSlot = cid || cSlot;
  $("create-user").textContent = user ? user.username : "";
  show("scr-create");
  cSect = cSect || (GD.sects.find(s => s.enabled) || GD.sects[0]).id;
  $("create-old").textContent = old ? `Bản 2.0 đổi toàn bộ dữ liệu, nhân vật bản cũ (${old.name || ""} Lv${old.level || 1}) không dùng tiếp được. Tạo nhân vật mới để chơi.` : "";
  if (!old && !store.DEMO) migrateOffer();
  renderCreate();
}
// Lần đầu đăng nhập Firebase: chuyển nhân vật chơi ở chế độ thử (còn trên trình duyệt này) lên
function migrateOffer() {
  const list = store.demoPlayers().filter(d => d.version === L.SAVE_VERSION && d.name);
  if (!list.length) return;
  $("create-old").innerHTML = `<div class="small" style="color:#ddd">Trình duyệt này còn nhân vật chơi ở chế độ thử. Chuyển lên tài khoản này?</div>`
    + list.map((d, i) => `<button type="button" class="btn ghost small-btn" data-mig="${i}" style="margin:6px 6px 0 0">${esc(d.name)} · Lv${d.level} ${esc((X.sect[d.sect] || {}).name || "")}</button>`).join("");
  document.querySelectorAll("[data-mig]").forEach(b => b.onclick = async () => {
    const d = { ...list[+b.dataset.mig] }, key = d.key; delete d.key;
    let ok = false;
    try { ok = await store.claimName(user, cSlot, d.name); } catch (e) { $("create-err").textContent = "Không kiểm tra được tên: " + (e.code || e.message); return; }
    if (!ok) { $("create-err").textContent = `Tên ${d.name} đã có người dùng, không chuyển được.`; return; }
    P = L.normalizePlayer(d); P.username = user.username; CID = cSlot;
    logs = []; renderLog._init = false; idle = { mon: null, hp: null, restUntil: 0 }; tab = "idle";
    await saveNow();
    localStorage.removeItem(key);          // xóa bản chơi thử để khỏi chuyển trùng sang tài khoản khác
    startMain();
    toast(`Đã chuyển ${P.name} lên tài khoản ${user.username}.`);
  });
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
  if (!cSlot) { $("create-err").textContent = "Chưa chọn ô nhân vật."; return; }
  let ok = false;
  try { ok = await store.claimName(user, cSlot, name); }
  catch (err) { $("create-err").textContent = "Không kiểm tra được tên: " + (err.code || err.message) + (store.DEMO ? "" : " (đã dán firestore.rules mới chưa?)"); return; }
  if (!ok) { $("create-err").textContent = `Tên "${name}" đã có người dùng, chọn tên khác.`; return; }
  P = L.newPlayer(name, cGender, cSect);
  P.username = user.username; CID = cSlot;
  logs = []; renderLog._init = false; idle = { mon: null, hp: null, restUntil: 0 }; sel = null; tab = "idle";
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
  net.setOnChange(() => { if (tab === "party" && !battle) renderParty(); });
  if (net.started()) net.setMe({ n: P.name, l: P.level, s: P.sect, st: "idle" });
  else net.start(user, { n: P.name, l: P.level, s: P.sect }).catch(e => console.error("net", e));
}
function setTab(t) {
  tab = t; sel = null;
  document.querySelectorAll(".tabs button[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  document.querySelectorAll(".tab").forEach(d => d.classList.toggle("hidden", d.id !== "tab-" + t));
  renderAll();
}
document.querySelectorAll(".tabs button[data-tab]").forEach(b => b.onclick = () => setTab(b.dataset.tab));
$("create-logout").onclick = () => store.logout();        // màn tạo nhân vật: đổi tài khoản khi chưa tạo nhân vật
$("create-back").onclick = () => showChars();

function renderAll() {
  renderHeader();
  if (tab === "idle") renderIdle();
  if (tab === "bag") renderBag();
  if (tab === "skill") renderSkills();
  if (tab === "shop") renderShop();
  if (tab === "market") renderMarket();
  if (tab === "party") renderParty();
  if (tab === "opt") renderOptions();
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
  $("tab-btn-bag").textContent = `Túi đồ (${P.bag.length}/${INV()})`;
  const readable = Object.keys(P.books).some(id => X.bikip[id] && X.bikip[id].sect === P.sect && (P.bikip[id] || 0) < (X.bikip[id].maxLv || 3));
  $("tab-btn-skill").innerHTML = "Kỹ năng" + (P.skillPoints > 0 ? ` <span class="badge">${P.skillPoints}</span>` : readable ? ` <span class="badge">!</span>` : "");
  net.setMe({ l: P.level });
}

// ----- Bảng nhân vật (trang bị quanh hình) -----
function equipPanelHtml(withUnequip) {
  const st = L.calcStats(P), wt = L.equippedWeapon(P);
  const slot = s => {
    const it = P.equip[s], name = (X.slot[s] || {}).name || s;
    if (!it) return `<div class="eqs" title="${esc(name)}">${emptyBox(46, name)}</div>`;
    return `<button class="eqs ${sel && sel.type === "eq" && sel.id === s ? "sel" : ""}" data-eq="${s}" title="${esc(itemTitle(it))}">${itemIcon(it, 46, true)}</button>`;
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
  const hints = [];
  if (!L.hasMainSkill(P)) hints.push(`Chưa học chiêu chính. <button class="btn small-btn" data-goto="skill">Vào Kỹ năng chọn đường</button>`);
  if (!P.equip.weapon) hints.push(`Chưa cầm vũ khí. <button class="btn ghost small-btn" data-goto="bag">Mặc vũ khí trong Túi đồ</button>`);
  el.innerHTML = `${hints.length ? `<div class="hint">${hints.join("<br>")}</div>` : ""}<div class="st-row"><span>Đang treo: <b>${esc(map.name)}</b> <small class="muted">Lv ${map.lvFrom}–${map.lvTo} · chiêu: ${esc(sc.sk.name)}</small></span>
    <span class="muted">${resting ? "Đang nghỉ hồi phục..." : ""}</span></div>
    <div class="st-row"><span class="lbl">Bản thân</span><div class="bar"><i style="width:${(hp / st.hp * 100).toFixed(1)}%;background:#d94040"></i><em>${fmt(hp)} / ${fmt(st.hp)}</em></div></div>
    <div class="st-row"><span class="lbl" style="color:${m ? elemColor(m.element) : "#777"}">${m ? esc(m.name) + " Lv" + m.lv : "Tìm quái..."}</span>
    <div class="bar"><i style="width:${m ? Math.max(0, m.hp / m.maxHp * 100).toFixed(1) : 0}%;background:#8a5ad0"></i>${m ? `<em>${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}</em>` : ""}</div></div>`;
  el.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => setTab(b.dataset.goto));
}

function addLog(l) {
  const d = new Date();
  l.time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  logs.push(l);
  if (logs.length > 150) logs.splice(0, logs.length - 150);
  if (tab !== "idle") return;
  // chỉ thêm 1 dòng, không vẽ lại cả log
  const el = $("idle-log"); if (!el || !renderLog._init) return renderLog();
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const row = document.createElement("div");
  row.className = "lg " + (l.c || "");
  row.innerHTML = `<span class="tm">[${l.time}]</span> ${esc(l.t)}`;
  el.appendChild(row);
  while (el.childElementCount > 150) el.firstElementChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}
function renderLog() {
  const el = $("idle-log"); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = logs.map(l => `<div class="lg ${l.c || ""}"><span class="tm">[${l.time}]</span> ${esc(l.t)}</div>`).join("");
  if (atBottom || !renderLog._init) { el.scrollTop = el.scrollHeight; renderLog._init = true; }
}

// Treo máy theo thời gian thật: tab bị ẩn thì trình duyệt cho chạy chậm, quay lại sẽ bù đủ
let idleLast = 0;
function idleStep() {
  clearTimeout(idleTimer); idleTimer = null;
  if (battle || !P) return;
  const now = Date.now();
  if (!idleLast) idleLast = now - L.IDLE_TICK;
  const behind = now - idleLast, ticks = Math.floor(behind / L.IDLE_TICK);
  let levelUp = false, changed = false;
  if (ticks > 25) {                       // chậm nhiều: tính gộp như treo vắng mặt (không giới hạn giờ)
    const lvBefore = P.level;
    const o = L.offlineGains(P, (behind - L.IDLE_TICK) / 1000, true);
    idleLast = now - L.IDLE_TICK;
    if (o.kills > 0) {
      addLog({ t: `Bù treo máy lúc tab bị ẩn ${Math.round(o.seconds / 60)} phút: ${fmt(o.kills)} quái, +${fmt(o.exp)} EXP, +${fmt(o.gold + o.soldGold)} vàng${o.kept.length ? `, nhặt ${o.kept.length} món` : ""}.`, c: "level" });
      changed = true; levelUp = P.level > lvBefore;
    }
  }
  const n = Math.max(1, Math.min(25, Math.floor((now - idleLast) / L.IDLE_TICK)));
  for (let i = 0; i < n; i++) {
    idleLast += L.IDLE_TICK;
    const r = L.idleRound(P, idle, idleLast);
    r.logs.forEach(addLog);
    if (r.levelUp) { idle.hp = null; levelUp = true; }
    if (r.changed) changed = true;
  }
  if (changed) markDirty(levelUp ? 1500 : 8000);
  renderHeader();
  if (tab === "idle") { renderIdleStatus(); if (levelUp) $("idle-left").innerHTML = equipPanelHtml(false); }
  if (levelUp && tab === "skill") renderSkills();
  idleTimer = setTimeout(idleStep, Math.max(50, idleLast + L.IDLE_TICK - Date.now()));
}
function startIdle() {
  stopIdle();
  idleLast = Date.now() - L.IDLE_TICK + 600;
  idleTimer = setTimeout(idleStep, 600);
}
function stopIdle() { clearTimeout(idleTimer); idleTimer = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && idleTimer && !battle) idleStep(); });

function showOffline(o) {
  const h = Math.floor(o.seconds / 3600), m = Math.floor(o.seconds % 3600 / 60);
  const kept = o.kept.slice(0, 12).map(it => `<div class="rw" style="color:${rarityColor(it.r)}">${itemIcon(it, 26)} ${esc(it.name)} Lv${it.lv}</div>`).join("");
  modal(`<h3>Treo máy khi vắng mặt</h3>
    <p class="muted">Vắng ${h} giờ ${m} phút (tính tối đa ${S.offlineHours ?? 24} giờ)</p>
    <div class="rw">Tiêu diệt: <b>${fmt(o.kills)}</b> quái</div>
    <div class="rw">EXP: <b>+${fmt(o.exp)}</b>${o.levels.length ? ` · <span class="lvup">Lên cấp ${o.levels[o.levels.length - 1]}!</span>` : ""}</div>
    <div class="rw">Vàng: <b>+${fmt(o.gold + o.soldGold)}</b> (gồm ${o.sold} món đồ tự bán)</div>
    ${o.deaths ? `<div class="rw muted">Trọng thương ${fmt(o.deaths)} lần (mỗi lần nghỉ 8 giây)</div>` : ""}
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
  for (let i = 0; i < INV(); i++) {
    const it = items[i];
    if (!it) { cells.push(`<div class="cell">${emptyBox(48)}</div>`); continue; }
    const better = L.itemScore(it) > L.itemScore(P.equip[it.slot]);
    const tooHigh = !L.canEquipLevel(P, it);
    cells.push(`<button class="cell ${sel && sel.type === "item" && sel.id === it.id ? "sel" : ""}" data-item="${it.id}" title="${esc(itemTitle(it))}">
      ${itemIcon(it, 48, true)}${better && !tooHigh ? `<span class="up">▲</span>` : ""}${tooHigh ? `<span class="lock">Lv${it.lv}</span>` : ""}</button>`);
  }
  $("bag-grid").innerHTML = cells.join("");
  $("bag-e-title").textContent = `Trang bị ${P.bag.length}/${INV()}`;
  // vật phẩm + bí kíp
  const mcells = [];
  (GD.misc || []).forEach(m => {
    const q = P.misc[m.id] || 0; if (!q) return;
    const st = Math.max(1, m.stack || 1);
    for (let left = q; left > 0; left -= st) {
      const n = Math.min(st, left);
      const keys = Object.keys(P.hot).filter(k => P.hot[k] === m.id);
      mcells.push(`<button class="cell ${sel && sel.type === "misc" && sel.id === m.id ? "sel" : ""}" data-misc="${m.id}" title="${esc(m.name)}">
        ${iconBox(m.img, "misc", miscColor(m), 48, `<b class="qty">${n}</b>${keys.length ? `<i class="hk">${keys.join(",")}</i>` : ""}`)}</button>`);
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
  $("bag-m-title").textContent = `Vật phẩm ${used}/${cap}`;
  $("bag-auto").checked = !!P.autoSellCommon;
  // tab Trang bị | Vật phẩm
  const eqTab = bagTab === "eq";
  $("bag-e-title").classList.toggle("on", eqTab); $("bag-m-title").classList.toggle("on", !eqTab);
  $("bag-grid").classList.toggle("hidden", !eqTab); $("bag-eq-tools").classList.toggle("hidden", !eqTab);
  $("misc-grid").classList.toggle("hidden", eqTab); $("bag-misc-tools").classList.toggle("hidden", eqTab);
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
    box.innerHTML = itemDetailHtml(it) + `<div class="m-act"><button class="btn ghost" id="d-uneq">Tháo ra</button>${lockBtn(it)}</div>`;
    $("d-uneq").onclick = () => { const e = L.unequip(P, sel.id); if (e) return toast(e); sel = null; markDirty(2000); renderAll(); };
    bindLock(it);
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
      ${tooHigh ? `<div class="bad">Cần cấp ${it.lv - (S.maxOverLevel ?? 0)} để mặc.</div>` : ""}
      <div class="m-act"><button class="btn" id="d-equip" ${tooHigh ? "disabled" : ""}>Mặc</button>
      <button class="btn ghost" id="d-sell" ${it.lock ? "disabled" : ""}>${it.lock ? "Đang khóa" : `Bán +${fmt(L.sellPrice(it))} vàng`}</button>
      ${lockBtn(it)}<button class="btn ghost" id="d-mk" ${it.lock ? "disabled" : ""}>Rao bán ở Chợ</button></div>`;
    $("d-equip").onclick = () => { const e = L.equipItem(P, it.id); if (e) return toast(e); sel = null; markDirty(2000); renderAll(); };
    bindLock(it);
    $("d-mk").onclick = () => listModal("item", it.id, it.name, 1);
    $("d-sell").onclick = () => {
      if (it.lock) return;
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
    box.innerHTML = `<div class="det-head">${iconBox(m.img, "misc", miscColor(m), 56)}<div><div style="font-weight:600;color:#fff">${esc(m.name)} ×${q}</div>
      <div class="muted small">Vật phẩm · xếp chồng ${m.stack || 1} · không bán được</div></div></div>
      <div class="det-stats">${esc(m.desc || "")}</div>
      ${m.kind === "levelup" ? `<div class="small">Dùng được khi dưới cấp ${m.useBelow || 100} · <b>Đã dùng ${(P.lotus || {})[m.id] || 0}/${m.useLimit || 3}</b></div>
        <div class="m-act"><button class="btn" id="d-use" ${L.lotusCheck(P, m) ? "disabled" : ""}>Dùng</button></div>
        ${L.lotusCheck(P, m) ? `<div class="bad small">${esc(L.lotusCheck(P, m))}</div>` : ""}` : ""}
      ${m.kind === "newbie" ? `<div class="m-act"><button class="btn" id="d-open">Mở lễ bao</button></div>` : ""}
      ${m.cd ? `<div class="muted small">Chờ ${m.cd} giây giữa 2 lần dùng</div>` : ""}
      ${canHot ? `<div class="det-sub">Phím dùng trong trận${keys.length ? ": đang gán phím " + keys.join(", ") : ""}</div>
        <div class="m-act">${["1", "2", "3"].map(k => `<button class="btn ghost small-btn" data-hot="${k}">Gán phím ${k}</button>`).join("")}</div>` : ""}
      ${m.quest ? "" : `<div class="m-act"><button class="btn ghost" id="d-mk">Rao bán ở Chợ</button></div>`}`;
    document.querySelectorAll("[data-hot]").forEach(b => b.onclick = () => { P.hot[b.dataset.hot] = m.id; markDirty(); toast(`Phím ${b.dataset.hot}: ${m.name}`); renderBag(); });
    if ($("d-mk")) $("d-mk").onclick = () => listModal("misc", m.id, m.name, q);
    if ($("d-use")) $("d-use").onclick = () => {
      const r = L.useLotus(P, m.id);
      if (r.err) return toast(r.err);
      addLog({ t: `Dùng ${m.name}: lên cấp ${r.level}! +1 điểm skill`, c: "level" });
      toast(`Lên cấp ${r.level}!`); saveNow(); renderAll();
    };
    if ($("d-open")) $("d-open").onclick = () => newbieModal();
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
      <div class="m-act">${own ? `<button class="btn" id="d-read" ${lv >= (b.maxLv || 3) ? "disabled" : ""}>Đọc</button>` : `<button class="btn ghost" id="d-bsell">Bán +${fmt(BIKIP_SELL[b.tier] || 1000)} vàng</button>`}
      <button class="btn ghost" id="d-mk">Rao bán ở Chợ</button></div>`;
    $("d-mk").onclick = () => listModal("book", b.id, b.name, q);
    if (own) $("d-read").onclick = () => { const e = L.readBook(P, b.id); if (e) return toast(e); toast(`Đã luyện ${b.name} lên cấp ${P.bikip[b.id]}`); markDirty(1000); renderAll(); };
    else $("d-bsell").onclick = () => { const g = L.sellBook(P, b.id); toast(`Đã bán, +${fmt(g)} vàng`); markDirty(); renderAll(); };
  }
}
// Lễ bao tân thủ: chọn 1 trong 2 vũ khí của phái (Huyền thoại cấp 10, dòng phụ ngẫu nhiên)
function newbieModal() {
  const lv = S.newbieWeaponLv ?? 10, rar = rarityOf(S.newbieWeaponRar ?? 3);
  const cards = [1, 2].map(path => {
    const wt = sectPathWeapon(P.sect, path), lmb = ((X.skillOf[P.sect] || {})[path] || {}).lmb, src = sprite(P.gender, wt);
    return `<button type="button" class="card pcard" data-nwt="${wt}">${src ? `<img class="spr" src="${src}" alt="">` : ""}<div>
      <div class="card-t" style="color:${rarityColor(S.newbieWeaponRar ?? 3)}">${WEAPON_NAMES[wt] || wt} ${esc(rar.name)} Lv${lv}</div>
      <div class="card-s">${esc(sectPathName(P.sect, path))} · chiêu chính ${esc(lmb ? lmb.name : "—")}</div></div></button>`;
  }).join("");
  modal(`<h3>Lễ bao tân thủ</h3>
    <p>Nhận ${S.newbieGems ?? 10} Ngộ Đạo Ngọc, ${S.newbieHp ?? 10} thuốc máu, ${S.newbieMp ?? 10} thuốc nội lực và chọn 1 vũ khí ${esc(rar.name)} cấp ${lv} (dòng phụ ngẫu nhiên):</p>
    <div class="cards">${cards}</div>
    <div class="m-act"><button class="btn ghost" onclick="closeModal()">Để sau</button></div>`);
  document.querySelectorAll("[data-nwt]").forEach(b => b.onclick = () => {
    const r = L.openNewbieBox(P, b.dataset.nwt);
    if (r.err) return toast(r.err);
    closeModal();
    addLog({ t: `Mở Lễ bao tân thủ: ${r.got.join(", ")}, ${r.item.name} [${rarityOf(r.item.r).name}].`, c: "level" });
    toast(`Nhận ${r.item.name} [${rarityOf(r.item.r).name}]`);
    sel = { type: "item", id: r.item.id }; bagTab = "eq";
    saveNow(); renderAll();
  });
}
$("bag-sellall").onclick = () => {
  const r = L.sellAllCommon(P);
  toast(r.n ? `Đã bán ${r.n} món Thường, +${fmt(r.g)} vàng` : "Không có đồ Thường để bán.");
  markDirty(); renderAll();
};
// Bán nhanh đồ xanh (Hiếm) / tím (Quý): hỏi xác nhận, bỏ qua đồ đã khóa
function quickSell(r) {
  const pv = L.previewSellRarity(P, r), rn = rarityOf(r).name;
  const locked = P.bag.filter(it => it.r === r && it.lock).length;
  if (!pv.n) return toast(`Không có đồ ${rn} để bán${locked ? ` (${locked} món đang khóa)` : ""}.`);
  modal(`<h3>Bán hết đồ ${esc(rn)}?</h3><p>Bán <b>${pv.n}</b> món, nhận <b class="gold">+${fmt(pv.g)} vàng</b>.${locked ? ` Giữ lại ${locked} món đã khóa.` : ""}</p>
    <p class="muted small">Bán xong không lấy lại được. Muốn giữ món nào thì khóa món đó trước.</p>
    <div class="m-act"><button class="btn danger" id="m-ok">Bán ${pv.n} món</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
  $("m-ok").onclick = () => { const res = L.sellAllRarity(P, r); closeModal(); toast(`Đã bán ${res.n} món ${rn}, +${fmt(res.g)} vàng`); sel = null; markDirty(); renderAll(); };
}
$("bag-sell1").onclick = () => quickSell(1);
$("bag-sell2").onclick = () => quickSell(2);
function lockBtn(it) { return `<button class="btn ghost" id="d-lock">${it.lock ? "Mở khóa" : "Khóa"}</button>`; }
function bindLock(it) {
  $("d-lock").onclick = () => { const on = L.toggleLock(P, it.id); toast(on ? `Đã khóa ${it.name}: không bán được, bán nhanh sẽ bỏ qua.` : `Đã mở khóa ${it.name}.`); markDirty(); renderBag(); };
}
$("bag-auto").onchange = e => { P.autoSellCommon = e.target.checked; markDirty(); };
document.querySelectorAll("[data-bt]").forEach(b => b.onclick = () => {
  if (bagTab === b.dataset.bt) return;
  bagTab = b.dataset.bt;
  if (sel && sel.type !== "eq") sel = null;
  renderBag();
});

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
function skillTabName(path) {
  const sc = X.sect[P.sect] || {};
  return sc["tabName" + path] || `${sc.name || ""} ${WEAPON_NAMES[sectPathWeapon(P.sect, path)] || sectPathName(P.sect, path)}`;
}
function renderSkills() {
  const st = L.calcStats(P), bonus = L.skillBonusLevels(P), wt = L.equippedWeapon(P);
  const gem = miscByKind("skillup")[0], rs = miscByKind("reset")[0];
  const gems = L.countKind(P, "skillup"), resets = L.countKind(P, "reset");
  const tiers = S.skillExtraTiers ?? 3;
  if (!skTab) skTab = "p" + L.activePath(P);
  const col = path => {
    const set = (X.skillOf[P.sect] || {})[path] || {};
    const rows = ["lmb", "rmb", "p1", "p2", "q"].map(slot => {
      const s = set[slot]; if (!s) return "";
      const base = P.skills[s.id] || 0, eff = L.skillLevel(P, s.id, bonus), max = L.skillMaxLv(s), baseMax = s.maxLv || 10;
      const sc = base ? L.skillCalc(P, s.id, st, bonus) : null;
      const next = base < max ? (() => { const tmp = { ...P, skills: { ...P.skills, [s.id]: base + 1 } }; return L.skillCalc(tmp, s.id, st, bonus); })() : null;
      const cost = L.upgradeCost(P, s.id);
      const can = base < max && P.skillPoints >= cost.points && gems >= cost.gems;
      const wtag = s.weapon ? `<span class="${s.weapon === wt ? "good" : "bad"}">cần ${WEAPON_NAMES[s.weapon]}</span>` : `<span class="muted">cầm gì cũng dùng được</span>`;
      const tier = base - baseMax;
      const pips = base >= baseMax && tiers > 0 ? `<div class="pips">${Array.from({ length: tiers }, (_, i) => `<i class="${i < tier ? "on" : ""}"></i>`).join("")}</div>` : "";
      return `<div class="sk-row">
        ${iconBox(s.img, "skill", base ? "#f2c230" : "#555", 40)}
        <div class="sk-main"><div class="sk-name">${esc(s.name)} <small class="muted">${SLOT_NAMES_KEYS[slot]}</small></div>
          <div class="small">${wtag}</div>
          <div class="sk-desc">${esc(s.desc || "")}</div>
          ${sc ? `<div class="sk-num">${esc(skillNumbers(sc))}</div>` : ""}
          ${next ? `<div class="sk-next muted">${base >= baseMax ? `Tầng ${tier + 1}` : `Cấp ${base + 1}`}: ${esc(skillNumbers(next))}</div>` : ""}</div>
        <div class="sk-lv ${tier > 0 ? "tier" : ""}">Cấp ${base}/${max}${eff > base ? ` <span class="good">+${eff - base}</span>` : ""}${tier > 0 ? `<div class="small">tầng ${tier}/${tiers}</div>` : ""}${pips}</div>
        <button class="mini plus" data-sk="${s.id}" ${can ? "" : "disabled"} title="${base >= max ? "Tối đa" : `Tốn ${cost.points} điểm${cost.gems ? `, ${cost.gems} ${gem ? gem.name : "ngọc"}` : ""}`}">
          +<small>${base >= max ? "max" : `${cost.points}đ${cost.gems ? " · " + cost.gems + " ngọc" : ""}`}</small></button></div>`;
    }).join("");
    const on = L.activePath(P) === path;
    return `<div class="sk-path ${on ? "on" : ""}">${esc(sectPathName(P.sect, path))} · ${WEAPON_NAMES[sectPathWeapon(P.sect, path)] || ""}${on ? " · đang dùng" : " · cầm " + (WEAPON_NAMES[sectPathWeapon(P.sect, path)] || "") + " để dùng"}</div>${rows}`;
  };
  const tabs = [["p1", skillTabName(1)], ["p2", skillTabName(2)], ["bk", "Bí kíp"], ["gh", "Bí kíp giang hồ"]];
  const xp = S.skillExtraPoints ?? 2, xg = S.skillExtraGemMul ?? 2;
  const help = `<p class="muted small">Mỗi cấp nhân vật được 1 điểm. Học skill tốn 1 điểm; nâng lên cấp n tốn thêm ${(S.skillGemMul ?? 1) === 1 ? "" : (S.skillGemMul + " × ")}(n − 1) ${esc(gem ? gem.name : "ngọc")}.
    ${tiers ? `Sau cấp tối đa còn ${tiers} tầng: mỗi tầng tốn ${xp} điểm và gấp ${xg} lần ngọc.` : ""} Skill cần vũ khí khác vẫn nâng được, đổi vũ khí là dùng ngay. Thanh chiến đấu dùng skill của đường đang cầm vũ khí.</p>`;
  const body = skTab === "p1" ? help + col(1) : skTab === "p2" ? help + col(2) : booksHtml(skTab);
  $("tab-skill").innerHTML = `<div class="panel wide">
    <div class="subtabs">${tabs.map(([k, t]) => `<button data-skt="${k}" class="${skTab === k ? "on" : ""}">${esc(t)}</button>`).join("")}
      <span class="st-fill"></span>
      <span class="pts">Điểm skill: <b>${P.skillPoints}</b> · ${esc(gem ? gem.name : "Ngọc")}: <b>${gems}</b>
      <button class="btn danger small-btn" id="sk-reset">Reset (${resets} ${esc(rs ? rs.name : "")})</button></span></div>
    ${body}</div>`;
  document.querySelectorAll("[data-skt]").forEach(b => b.onclick = () => { skTab = b.dataset.skt; renderSkills(); });
  bindBooks();
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
  const ord = k => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
  const groups = `<div class="shop-grid">` + [...list].sort((a, b) => ord(a.kind) - ord(b.kind)).map(m => `<div class="shop-card">
      <div class="sc-kind">${KIND_NAMES[m.kind] || KIND_NAMES.other}</div>
      ${iconBox(m.img, "misc", "#6a7090", 52)}
      <div class="sc-name">${esc(m.name)}</div>
      <div class="sc-desc">${esc(m.desc || "")}</div>
      <div class="sc-have">Đang có ${fmt(P.misc[m.id] || 0)}</div>
      <div class="sc-price">${fmt(m.price || 0)} vàng</div>
      <div class="sc-buy"><input type="number" min="1" value="1" class="qty-in" id="q-${m.id}" aria-label="Số lượng">
      <button class="btn small-btn" data-buy="${m.id}">Mua</button></div></div>`).join("") + `</div>`;
  $("tab-shop").innerHTML = `<div class="panel wide xl"><div class="sk-head"><span class="panel-t">Cửa hàng</span>
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

// ----- Bí kíp (tab Bí kíp và Bí kíp giang hồ trong Kỹ năng) -----
function booksHtml(which) {
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
  if (which === "gh") return `<div class="panel-t">Bí kíp giang hồ</div>
    <p class="muted small">Bí kíp ngoài môn phái, ví dụ Đạn Chỉ Thần Công, Thiên Ngoại Phi Tiên: cầm đúng vũ khí là phái nào cũng luyện được.</p>
    <div class="soon">Sắp có ở bản sau</div>`;
  return `<div class="panel-t">Bí kíp môn phái · ${esc(X.sect[P.sect].name)}</div>
    <p class="muted small">Bí kíp rơi từ boss (boss map dưới 1/260, boss Hoàng Kim ${GD.goldBosses[0] ? GD.goldBosses[0].bikipChance : 15}%). Đọc trùng để lên cấp, tối đa 3. Bí kíp phái khác bán lấy vàng hoặc rao ở Chợ. Tác dụng dùng chung cho cả 2 đường.</p>${rows}`;
}
function bindBooks() {
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
      const acct = String(p.uid).replace(/_[23]$/, ""), slot = /_([23])$/.exec(p.uid);
      const online = net.started() ? net.onlineList().some(o => o.uid === acct && o.n === p.name) : Date.now() - (p.lastSeen || 0) < 360000;
      const seen = p.lastSeen ? new Date(p.lastSeen).toLocaleString("vi-VN") : "-";
      return `<tr><td>${esc(p.name)}</td><td>${esc(p.username || acct)}${slot ? ` <span class="muted">(ô ${slot[1]})</span>` : ""}</td><td>${X.sect[p.sect] ? esc(X.sect[p.sect].name) : "-"}</td>
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
    <p class="small">Máu <b>${fmt(b.hp)}</b> · Công <b>${fmt(b.atk * (S.bossDmgMul ?? 2))}</b> · Phòng <b>${fmt(b.def)}</b>${b.effect ? ` · gây ${esc((X.effect[b.effect] || {}).name || b.effect)} ${b.effectChance}%` : ""}<br>Chiêu: ${esc(pats)}<br><span class="bad">Dưới ${S.rageHpPct ?? 50}% máu boss nổi giận: ra chiêu dồn dập hơn và thêm ${S.rageExtraPatterns ?? 2} chiêu.</span></p>
    <p class="small muted">${reward}</p>
    <div class="ctrl">${P.ctrl === "B"
      ? `<div><b>Chuột trái</b> bấm để đi, giữ để đi theo chuột</div><div><b>Space</b> khinh công về phía chuột (tốn 20 thể lực)</div>
      ${keyLine("Giữ Q", "lmb")}${keyLine("W", "rmb")}${keyLine("E", "q")}<div><b>R</b> để dành cho chiêu sau này</div>`
      : `<div><b>WASD</b> di chuyển</div><div><b>Space</b> khinh công (tốn 20 thể lực)</div>
      ${keyLine("Chuột trái", "lmb")}${keyLine("Chuột phải", "rmb")}${keyLine("Q", "q")}`}<div><b>Esc</b> tạm dừng / bỏ chạy / đổi điều khiển</div>
      ${hk("1")}${hk("2")}${hk("3")}</div>
    <p class="small muted">Kiểu điều khiển: ${P.ctrl === "B" ? "B (chuột để đi)" : "A (WASD)"} · đổi ở tab Tùy chỉnh hoặc trong màn tạm dừng.</p>
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
  net.setMe({ st: "boss" });
  const map = kind === "map" ? L.getMap(b.map) : (X.map[b.unlock] || L.getMap(P.mapId));
  battle = new Battle($("cv"), P, { kind, boss: b, map, players: 1 }, (result, used) => {
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
      const misc = r.misc.map(x => `<div class="rw">${iconBox(x.misc.img, "misc", miscColor(x.misc), 24)} ${esc(x.misc.name)} ×${x.qty}${x.kept ? "" : " (túi vật phẩm đầy)"}</div>`).join("");
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
    net.setMe({ st: "idle" });
    saveNow();
    renderAll();
    startIdle();
  });
  battle.start();
}

// ----- Tổ đội: ai đang online, phòng thử nhiều người (bản 2.2) -----
const ST_NAMES = { idle: "treo máy", room: "trong phòng", boss: "đánh boss" };
function renderParty() {
  const box = $("tab-party");
  if (net.mode === "off") {
    box._html = "";
    box.innerHTML = `<div class="panel wide"><div class="panel-t">Tổ đội</div>
      <p>Chưa bật phần chơi chung. Cần tạo <b>Realtime Database</b> trong Firebase rồi dán địa chỉ vào <code>databaseURL</code> trong file <code>js/config.js</code>.</p>
      <p class="muted small">Xem mục "Bật chơi chung" trong HUONG_DAN.md. Treo máy, lưu nhân vật và Chợ vẫn chạy bình thường.</p></div>`;
    return;
  }
  const on = net.onlineList().sort((a, b) => (b.uid === user.uid) - (a.uid === user.uid) || (b.l || 0) - (a.l || 0));
  const rows = on.map(o => `<div class="pt-row ${o.uid === user.uid ? "me" : ""}"><span class="dot ${o.st === "boss" ? "boss" : o.st === "room" ? "room" : ""}"></span>
    <span class="grow">${esc(o.n)} · Lv${o.l || 1} ${esc((X.sect[o.s] || {}).name || "")}${o.uid === user.uid ? ' <small class="muted">(bạn)</small>' : ""}</span>
    <span class="muted small">${ST_NAMES[o.st] || "online"}</span></div>`).join("") || `<div class="muted">Đang kết nối...</div>`;
  const rl = net.roomList();
  const rooms = rl.map(r => `<div class="pt-row"><span class="grow"><b>${esc(r.n)}</b><br><span class="muted small">${r.count}/${net.ROOM_MAX} người · mộc nhân · ${esc(r.names.join(", "))}</span></span>
    <button class="btn small-btn" data-room="${r.id}" data-rn="${esc(r.n)}" ${r.count >= net.ROOM_MAX ? "disabled" : ""}>${r.count >= net.ROOM_MAX ? "Đủ người" : "Vào"}</button></div>`).join("")
    || `<div class="muted small" style="margin-bottom:8px">Chưa có phòng nào. Tạo phòng rồi rủ bạn vào.</div>`;
  const html = `<div class="pt-cols">
    <div class="panel"><div class="panel-t">Đang online · ${on.length}</div>${rows}</div>
    <div class="panel"><div class="panel-t">Phòng thử</div>
      <p class="muted small">Tối đa ${net.ROOM_MAX} người: thấy nhau đi lại, ra chiêu và cùng đánh 1 mộc nhân (máu chung). Chiêu của người khác chỉ để nhìn, không trúng mình. Esc → F để rời phòng.</p>
      ${rooms}<button class="btn ghost" id="pt-new" ${battle ? "disabled" : ""}>+ Tạo phòng</button>
      ${net.mode === "demo" ? `<p class="muted small" style="margin-top:10px">Chế độ thử: mở thêm tab khác trên máy này, đăng nhập tên khác để thử 2–5 người.</p>` : ""}
      <div class="pt-note" id="pt-stat"></div></div></div>`;
  const stat = `${net.stats.ping ? net.stats.ping + " ms · " : ""}đã nhận ~${(net.stats.bytes / 1048576).toFixed(2)} MB`;
  if (box._html === html) { $("pt-stat").textContent = stat; return; }     // không đổi gì thì không vẽ lại (nút khỏi nhảy)
  box.innerHTML = box._html = html;
  $("pt-stat").textContent = stat;
  document.querySelectorAll("[data-room]").forEach(b => b.onclick = () => enterRoom(b.dataset.room, b.dataset.rn));
  $("pt-new").onclick = async () => {
    try { const r = await net.createRoom(`Phòng của ${P.name}`); enterRoom(r.id, r.name); }
    catch (e) { toast("Không tạo được phòng: " + (e.code || e.message)); }
  };
}
let joining = false;
async function enterRoom(id, name) {
  if (battle || joining) return;
  joining = true;
  let room;
  try { room = await net.joinRoom(id, name, { n: P.name, l: P.level, s: P.sect, g: P.gender, w: L.equippedWeapon(P) || "" }); }
  catch (e) { joining = false; return toast(e.message || "Không vào được phòng."); }
  joining = false;
  stopIdle();
  show("scr-battle");
  const dummy = { name: "Mộc nhân", lv: P.level, element: "", hp: S.roomDummyHp || 2000000, atk: 0, def: 0, patterns: ["ring"], img: "" };
  battle = new Battle($("cv"), P, { kind: "room", boss: dummy, map: L.getMap(P.mapId), players: 1, net: room }, (result, used) => {
    battle = null;
    room.leave().catch(e => console.error(e));
    idle.hp = null; idle.mon = null;
    show("scr-main");
    toast("Đã rời phòng.");
    if (Object.keys(used || {}).length) markDirty(1000);
    renderAll();
    startIdle();
  });
  battle.start();
}
// ẩn tab quá 1 phút khi đang ở phòng: tự rời phòng cho đỡ tốn dữ liệu
let hideT = null;
document.addEventListener("visibilitychange", () => {
  clearTimeout(hideT);
  if (document.hidden && battle && battle.room) hideT = setTimeout(() => { if (battle && battle.room) battle._finish("flee"); }, 60000);
});

// ----- Tùy chỉnh (bản 2.3): chọn nhân vật, điều khiển & đồ họa, tài khoản -----
function renderOptions() {
  const opt = (name, val, cur, title, desc) => `<label class="opt ${cur === val ? "on" : ""}"><input type="radio" name="${name}" value="${val}" ${cur === val ? "checked" : ""}>
    <span><b>${title}</b><br><small class="muted">${desc}</small></span></label>`;
  $("tab-opt").innerHTML = `<div class="opt-cols">
    <div class="panel"><div class="panel-t">Nhân vật</div>
      <p class="small">Đang chơi: <b>${esc(P.name)}</b> Lv${P.level} · ${esc((X.sect[P.sect] || {}).name || "")}</p>
      <button class="btn" id="o-chars">Chọn nhân vật</button>
      <p class="muted small">Thoát ra màn chọn 1 trong ${store.MAX_CHARS} nhân vật của tài khoản. Nhân vật này vẫn được tính treo máy khi vắng mặt (tối đa ${S.offlineHours ?? 24} giờ).</p></div>
    <div class="panel"><div class="panel-t">Điều khiển & đồ họa</div>
      <div class="muted small" style="margin-bottom:6px">Kiểu điều khiển khi đánh boss, PK</div>
      ${opt("ctrl", "A", P.ctrl, "Kiểu A · WASD", "WASD di chuyển · giữ chuột trái đánh · chuột phải chiêu phụ · Q buff · Space khinh công")}
      ${opt("ctrl", "B", P.ctrl, "Kiểu B · chuột để đi", "Chuột trái bấm để đi, giữ để đi theo chuột · giữ Q đánh · W chiêu phụ · E buff · R để dành · Space khinh công về phía chuột")}
      <div class="muted small" style="margin:10px 0 6px">Đồ họa</div>
      ${opt("gfx", "cao", P.gfx, "Cao", "Hình nền map, tia lửa, chữ có viền")}
      ${opt("gfx", "thap", P.gfx, "Thấp (máy yếu)", "Bỏ hình nền và hiệu ứng phụ cho mượt hơn")}
      <label class="chk" style="display:block;margin-top:10px"><input type="checkbox" id="o-fps" ${P.showFps ? "checked" : ""}> Hiện FPS khi đánh boss</label>
      <p class="muted small">Trong trận bấm Esc rồi C (điều khiển), G (đồ họa), P (FPS).</p></div>
    <div class="panel"><div class="panel-t">Tài khoản ${esc(user.username)}</div>
      <div class="m-act" style="flex-direction:column;align-items:stretch">
        <button class="btn ghost" id="o-pass" ${store.DEMO ? "disabled" : ""}>Đổi mật khẩu</button>
        <button class="btn ghost" id="o-logout">Đăng xuất</button></div>
      ${store.DEMO ? '<p class="muted small">Chế độ thử không có mật khẩu.</p>' : ""}</div></div>`;
  document.querySelectorAll("#tab-opt .opt input").forEach(r => r.onchange = () => {
    document.querySelectorAll(`#tab-opt .opt input[name=${r.name}]`).forEach(x => x.closest(".opt").classList.toggle("on", x.checked));
    P[r.name] = r.value; markDirty(1000);
    toast(r.name === "ctrl" ? `Điều khiển kiểu ${P.ctrl}` : `Đồ họa ${P.gfx === "cao" ? "Cao" : "Thấp"}`);
  });
  $("o-fps").onchange = e => { P.showFps = e.target.checked; markDirty(1000); };
  $("o-chars").onclick = () => toCharSelect();
  $("o-pass").onclick = () => passwordModal();
  $("o-logout").onclick = async () => { await saveNow(); store.logout(); };
}

// ----- Chợ -----
let mkFilter = "all", mkSort = "new", mkCache = [], mkSlot = "";
// Chợ hiện chỉ số (bản 2.3): dòng chính, dòng phụ, so với đồ đang mặc cùng ô
function cmpEquip(it) {
  const a = L.itemStats(it), b = L.itemStats(P.equip[it.slot]);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => ({ k, d: (a[k] || 0) - (b[k] || 0) })).filter(x => Math.abs(x.d) >= 0.05);
}
const cmpHtml = (c, sep) => c.map(x => `<span class="${x.d > 0 ? "good" : "bad"}">${x.d > 0 ? "▲" : "▼"} ${esc(statName(x.k))} ${x.d > 0 ? "+" : ""}${statVal(x.k, x.d)}</span>`).join(sep);
function mkItemLines(it) {
  const main = it.gold ? ((X.goldItem[it.gold] || {}).stats || []).map(s => [s.stat, s.v]) : Object.keys(it.main).map(k => [k, it.main[k]]);
  const line = arr => arr.map(([k, v]) => `${esc(statName(k))} +${statVal(k, v)}`).join(" · ");
  const aff = (it.aff || []).map(a => [a.s, a.v]), cmp = cmpEquip(it);
  const need = L.canEquipLevel(P, it) ? "" : `<span class="bad">Cần cấp ${it.lv - (S.maxOverLevel ?? 0)} để mặc</span> <span class="muted">(bạn đang cấp ${P.level})</span>`;
  return `<div class="small">${line(main)}</div>${aff.length ? `<div class="muted small">${line(aff)}</div>` : ""}
    <div class="small">${need || (cmp.length ? `So với ${P.equip[it.slot] ? "đồ đang mặc" : "ô đang trống"}: ${cmpHtml(cmp.slice(0, 6), " · ")}` : '<span class="muted">Giống đồ đang mặc</span>')}</div>`;
}
async function claimMarket() {
  if (!P || !user) return;
  try {
    const list = await store.claimPayouts(user, CID);
    if (!list.length) return;
    const g = list.reduce((a, x) => a + (x.gold || 0), 0);
    P.gold += g;
    list.forEach(x => addLog({ t: `Chợ: ${x.buyer || "Có người"} mua ${x.name}${x.qty > 1 ? " ×" + x.qty : ""}, +${fmt(x.gold)} vàng.`, c: "level" }));
    toast(`Chợ: bán được ${list.length} món, +${fmt(g)} vàng`);
    await saveNow(); renderHeader();
  } catch (e) { console.error(e); }
}
function listingIcon(x, size = 48) {
  if (x.kind === "item") return itemIcon(x.item, size);
  if (x.kind === "misc") { const m = X.misc[x.ref] || {}; return iconBox(m.img, "misc", miscColor(m), size, x.qty > 1 ? `<b class="qty">${x.qty}</b>` : ""); }
  const b = X.bikip[x.ref] || {}; return iconBox(b.img, "book", "#f2c230", size, x.qty > 1 ? `<b class="qty">${x.qty}</b>` : "");
}
function listingSub(x) {
  if (x.kind === "item") return `${rarityOf(x.item.r).name} · ${esc(slotLabel(x.item))} · Lv${x.item.lv}`;
  if (x.kind === "misc") return `Vật phẩm ×${x.qty}`;
  const b = X.bikip[x.ref] || {}; return `Bí kíp ${BIKIP_TIER_NAMES[b.tier] || ""} · ${esc((X.sect[b.sect] || {}).name || "")} ×${x.qty}`;
}
async function renderMarket() {
  const box = $("tab-market");
  if (!box.innerHTML) box.innerHTML = `<div class="panel wide"><div class="muted">Đang tải chợ...</div></div>`;
  try { mkCache = (await store.listMarket()).filter(L.marketValid); }
  catch (e) { box.innerHTML = `<div class="panel wide"><div class="bad">Không tải được chợ: ${esc(e.code || e.message)}</div></div>`; return; }
  if (tab !== "market") return;
  claimMarket();
  const mine = mkCache.filter(x => store.listingOf(x, user, CID));
  let list = mkCache.filter(x => (mkFilter === "all" || x.kind === mkFilter) && (!mkSlot || (x.kind === "item" && x.item.slot === mkSlot)));
  list.sort(mkSort === "cheap" ? (a, b) => a.price - b.price : mkSort === "dear" ? (a, b) => b.price - a.price : (a, b) => b.createdAt - a.createdAt);
  const row = x => {
    const own = store.listingOf(x, user, CID), col = x.kind === "item" ? rarityColor(x.item.r) : "#fff";
    return `<div class="mk-row">${listingIcon(x)}
      <div class="mk-main"><div style="color:${col};font-weight:600">${esc(x.name)} <span class="muted small" style="font-weight:400">${listingSub(x)}</span></div>
      ${x.kind === "item" ? mkItemLines(x.item) : ""}
      <div class="small">Người bán: ${esc(x.seller || "?")}${own ? ' <span class="good">(của bạn)</span>' : ""}</div></div>
      <div class="mk-price">${fmt(x.price)}<small> vàng</small></div>
      ${own ? `<button class="btn ghost small-btn" data-wd="${x.id}">Rút về</button>` : `<button class="btn small-btn" data-mkv="${x.id}">Xem · Mua</button>`}</div>`;
  };
  const chip = (v, t) => `<button class="chip ${mkFilter === v ? "on" : ""}" data-mkf="${v}">${t}</button>`;
  const slotChip = (v, t) => `<button class="chip ${mkSlot === v ? "on" : ""}" data-mks2="${v}">${t}</button>`;
  const sch = (v, t) => `<button class="chip ${mkSort === v ? "on" : ""}" data-mks="${v}">${t}</button>`;
  box.innerHTML = `<div class="panel wide"><div class="sk-head"><span class="panel-t">Chợ · ${mkCache.length} món đang rao</span>
      <span>Vàng: <b class="gold">${fmt(P.gold)}</b> · Hàng của bạn: <b>${mine.length}/${L.MARKET_MAX}</b> <button class="btn ghost small-btn" id="mk-ref">Tải lại</button></span></div>
    <p class="muted small">Rao bán: vào Túi đồ, bấm món muốn bán, chọn "Rao bán ở Chợ" rồi đặt giá. Không thu thuế, không giới hạn thời gian. Món đang rao rời khỏi túi; rút về được khi túi còn chỗ. Người bán đang offline vẫn nhận vàng ở lần vào game sau.${store.DEMO ? ' <span class="bad">Chế độ thử: chỉ thấy hàng của các tài khoản trên cùng trình duyệt này.</span>' : ""}</p>
    <div class="chips">${chip("all", "Tất cả")}${chip("item", "Trang bị")}${chip("misc", "Vật phẩm")}${chip("book", "Bí kíp")}
      <span class="muted small" style="margin:0 4px 0 12px">Xếp:</span>${sch("new", "Mới nhất")}${sch("cheap", "Rẻ trước")}${sch("dear", "Đắt trước")}</div>
    <div class="chips"><span class="muted small" style="margin-right:4px">Ô:</span>${slotChip("", "Mọi ô")}${X.slotOrder.map(k => slotChip(k, esc((X.slot[k] || {}).name || k))).join("")}</div>
    <div class="mk-list">${list.map(row).join("") || '<div class="muted" style="padding:12px 0">Chưa có món nào.</div>'}</div></div>`;
  $("mk-ref").onclick = renderMarket;
  box.querySelectorAll("[data-mkf]").forEach(b => b.onclick = () => { mkFilter = b.dataset.mkf; renderMarket(); });
  box.querySelectorAll("[data-mks]").forEach(b => b.onclick = () => { mkSort = b.dataset.mks; renderMarket(); });
  box.querySelectorAll("[data-mks2]").forEach(b => b.onclick = () => { mkSlot = b.dataset.mks2; if (mkSlot && mkFilter !== "all" && mkFilter !== "item") mkFilter = "all"; renderMarket(); });
  box.querySelectorAll("[data-wd]").forEach(b => b.onclick = () => withdraw(b.dataset.wd));
  box.querySelectorAll("[data-mkv]").forEach(b => b.onclick = () => buyModal(mkCache.find(x => x.id === b.dataset.mkv)));
}
function buyModal(x) {
  if (!x) return;
  const body = x.kind === "item" ? itemDetailHtml(x.item) + (() => {
      const c = cmpEquip(x.item);
      return `<div class="det-sub">So với đồ đang mặc${P.equip[x.item.slot] ? "" : " (đang trống)"}</div>${c.length ? `<div class="det-stats">${cmpHtml(c, "<br>")}</div>` : '<div class="muted small">Giống đồ đang mặc</div>'}
        ${L.canEquipLevel(P, x.item) ? "" : `<div class="bad small">Cần cấp ${x.item.lv - (S.maxOverLevel ?? 0)} để mặc.</div>`}`;
    })()
    : `<div class="det-head">${listingIcon(x, 56)}<div><div style="font-weight:600;color:#fff">${esc(x.name)} ×${x.qty}</div><div class="muted small">${listingSub(x)}</div></div></div>
       <div class="det-stats">${esc((x.kind === "misc" ? X.misc[x.ref] : X.bikip[x.ref] || {}).desc || "")}</div>`;
  const space = L.marketSpaceFor(P, x), poor = P.gold < x.price;
  modal(`${body}<p>Giá: <b class="gold">${fmt(x.price)} vàng</b> · người bán ${esc(x.seller || "?")}</p>
    ${poor ? `<p class="bad">Không đủ vàng (đang có ${fmt(P.gold)}).</p>` : ""}${space ? `<p class="bad">${esc(space)}</p>` : ""}
    <div class="m-act"><button class="btn" id="m-ok" ${poor || space ? "disabled" : ""}>Mua</button><button class="btn ghost" onclick="closeModal()">Hủy</button></div>`);
  $("m-ok").onclick = async () => {
    $("m-ok").disabled = true;
    if (P.gold < x.price || L.marketSpaceFor(P, x)) return;
    try {
      const got = await store.buyListing(user, P.name, x.id);
      closeModal();
      if (!got) { toast("Món này vừa có người mua hoặc đã rút về."); return renderMarket(); }
      P.gold -= got.price; L.giveFromMarket(P, got);
      await saveNow();
      toast(`Đã mua ${got.name}${got.qty > 1 ? " ×" + got.qty : ""}`);
      addLog({ t: `Chợ: mua ${got.name} của ${got.seller || "?"}, -${fmt(got.price)} vàng.`, c: "info" });
      renderHeader(); renderMarket();
    } catch (e) { closeModal(); toast("Mua thất bại: " + (e.code || e.message)); }
  };
}
async function withdraw(id) {
  const x = mkCache.find(v => v.id === id); if (!x) return;
  const space = L.marketSpaceFor(P, x);
  if (space) return toast(space + " Dọn túi rồi rút về.");
  try {
    const got = await store.withdrawListing(user, CID, id);
    if (!got) { toast("Món này đã có người mua."); claimMarket(); return renderMarket(); }
    L.giveFromMarket(P, got); await saveNow();
    toast(`Đã rút ${got.name} về túi.`); renderHeader(); renderMarket();
  } catch (e) { toast("Rút về thất bại: " + (e.code || e.message)); }
}
function listModal(kind, id, name, maxQty) {
  modal(`<h3>Rao bán ${esc(name)}</h3>
    <form id="mk-form" class="form">
      ${maxQty > 1 ? `<label>Số lượng (tối đa ${maxQty})<input type="number" id="mk-qty" min="1" max="${maxQty}" value="${maxQty}"></label>` : ""}
      <label>Giá bán (vàng)<input type="number" id="mk-price" min="1" step="1" required></label>
      <div class="muted small">Không thu thuế. Món rời khỏi túi tới khi có người mua hoặc bạn rút về. Mỗi nhân vật rao tối đa ${L.MARKET_MAX} món.</div>
      <div class="bad" id="mk-err"></div>
      <div class="m-act"><button class="btn" type="submit">Rao bán</button><button class="btn ghost" type="button" onclick="closeModal()">Hủy</button></div>
    </form>`);
  $("mk-price").focus();
  $("mk-form").onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter || $("mk-form").querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const all = await store.listMarket();
      if (all.filter(x => store.listingOf(x, user, CID)).length >= L.MARKET_MAX) { $("mk-err").textContent = `Bạn đang rao đủ ${L.MARKET_MAX} món. Rút bớt rồi rao tiếp.`; btn.disabled = false; return; }
      const qty = Math.min(maxQty, Number(($("mk-qty") || {}).value) || 1);
      const t = L.takeForMarket(P, kind, id, qty, $("mk-price").value);
      if (t.err) { $("mk-err").textContent = t.err; btn.disabled = false; return; }
      try { await store.addListing(user, CID, P.name, t.listing); }
      catch (err) { L.giveFromMarket(P, t.listing); throw err; }
      await saveNow();
      closeModal(); sel = null;
      toast(`Đã rao ${t.listing.name} giá ${fmt(t.listing.price)} vàng`);
      mkCache = []; renderAll();
    } catch (err) { $("mk-err").textContent = "Rao bán thất bại: " + (err.code || err.message); btn.disabled = false; }
  };
}

// móc nhỏ để thử nghiệm trên trình duyệt (không ảnh hưởng chơi)
window.VLYN = { get P() { return P; }, get battle() { return battle; }, L, X };
