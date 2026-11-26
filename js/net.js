// ===== CHƠI CHUNG — bản 2.2 =====
// Ai đang online + phòng thử tối đa 5 người (cùng đánh mộc nhân).
// Firebase Realtime Database khi js/config.js có databaseURL; chế độ thử dùng BroadcastChannel
// (mở nhiều tab trên cùng 1 máy, mỗi tab đăng nhập 1 tên).
// Tiết kiệm băng thông: đứng yên không gửi, ẩn tab không gửi, chỉ gửi phần thay đổi, tối đa 10 lần/giây.
import { FIREBASE_CONFIG } from "./config.js";
import * as store from "./store.js";

export const ROOM_MAX = 5;
const URL_OK = !!FIREBASE_CONFIG.databaseURL && !String(FIREBASE_CONFIG.databaseURL).startsWith("DIEN_");
export const mode = store.DEMO ? "demo" : (URL_OK ? "fb" : "off");   // off = chưa bật Realtime Database

export const stats = { bytes: 0, ping: 0 };      // dữ liệu nhận về (ước tính) và độ trễ
const count = (key, v) => { stats.bytes += String(key || "").length + (v == null ? 4 : JSON.stringify(v).length) + 40; };

let me = null;                 // { uid, n, l, s, st, r }
let online = {};               // uid -> { n, l, s, st, r }
let rooms = {};                // id -> { n, h, c, m: { uid: tên } }
let onChange = () => {};
export function setOnChange(fn) { onChange = fn || (() => {}); }
const changed = () => { try { onChange(); } catch (e) { console.error(e); } };

export function started() { return !!me; }
export function onlineList() { return Object.keys(online).map(uid => ({ uid, ...online[uid] })); }
export function isOnline(uid) { return !!online[uid]; }
export function roomList() {
  return Object.keys(rooms).map(id => {
    const r = rooms[id], m = r.m || {};
    return { id, n: r.n || "Phòng", h: r.h || "", c: r.c || 0, count: Object.keys(m).length, names: Object.values(m) };
  }).filter(r => r.count > 0).sort((a, b) => b.c - a.c);
}

// ================= Firebase =================
let D = null;
const R = p => D.m.ref(D.db, p);
async function fbStart() {
  const m = await import(`https://www.gstatic.com/firebasejs/${store.V}/firebase-database.js`);
  D = { m, db: m.getDatabase(store.fbApp(), FIREBASE_CONFIG.databaseURL) };
  m.onValue(R(".info/connected"), snap => {          // có mạng lại thì báo online lại
    if (snap.val() !== true || !me) return;
    const pr = R("pres/" + me.uid);
    m.onDisconnect(pr).remove().then(() => m.set(pr, { n: me.n, l: me.l, s: me.s, st: me.st, r: me.r || "" }));
  });
  const watch = (path, map) => {
    m.onChildAdded(R(path), s => { count(s.key, s.val()); map[s.key] = s.val(); changed(); });
    m.onChildChanged(R(path), s => { count(s.key, s.val()); map[s.key] = s.val(); changed(); });
    m.onChildRemoved(R(path), s => { count(s.key, null); delete map[s.key]; changed(); });
  };
  watch("pres", online);
  watch("rl", rooms);
  setInterval(cleanRooms, 30000);
}
// phòng không còn ai (người cuối tắt web đột ngột): dọn đi
function cleanRooms() {
  if (mode !== "fb" || !D) return;
  for (const id in rooms) {
    const r = rooms[id];
    if (Object.keys(r.m || {}).length || Date.now() - (r.c || 0) < 30000) continue;
    D.m.remove(R("rl/" + id)); D.m.remove(R("rm/" + id));
  }
}

// ================= Chế độ thử (nhiều tab, 1 máy) =================
let bc = null;
const seen = {};               // uid -> lần cuối thấy (ms)
const demoRooms = {};          // id -> Room đang mở trong tab này
function demoStart() {
  bc = new BroadcastChannel("vlyn_net");
  bc.onmessage = e => {
    const x = e.data; if (!x || !me || x.uid === me.uid) return;
    count(x.k, x);
    if (x.k === "pres") {          // nhịp tim 2 giây: chỉ báo thay đổi khi thật sự khác
      seen[x.uid] = Date.now();
      if (JSON.stringify(online[x.uid]) === JSON.stringify(x.v)) return;
      online[x.uid] = x.v; demoRebuildRooms(); changed();
    }
    else if (x.k === "bye") { delete online[x.uid]; delete seen[x.uid]; demoRebuildRooms(); changed(); }
    else if (x.r && demoRooms[x.r]) demoRooms[x.r]._msg(x);
  };
  const beat = () => { if (!me) return; bc.postMessage({ k: "pres", uid: me.uid, v: presVal() }); };
  setInterval(() => {
    beat();
    let gone = false;
    for (const uid in seen) if (Date.now() - seen[uid] > 6000) { delete seen[uid]; delete online[uid]; gone = true; }
    if (gone) { demoRebuildRooms(); changed(); }
  }, 2000);
  window.addEventListener("beforeunload", () => { if (me) bc.postMessage({ k: "bye", uid: me.uid }); });
  beat();
}
function presVal() { return { n: me.n, l: me.l, s: me.s, st: me.st, r: me.r || "", rn: me.rn || "", rc: me.rc || 0 }; }
function demoRebuildRooms() {        // chế độ thử: phòng suy ra từ ai đang ở phòng nào
  for (const k in rooms) delete rooms[k];
  const all = { ...online }; if (me) all[me.uid] = presVal();
  for (const uid in all) {
    const p = all[uid]; if (!p.r) continue;
    const r = rooms[p.r] || (rooms[p.r] = { n: p.rn, h: "", c: p.rc || 0, m: {} });
    r.m[uid] = p.n;
    if (!r.h || (p.rc && p.rc <= r.c)) r.h = p.n;
  }
}

// ================= Dùng chung =================
export async function start(user, info) {
  if (mode === "off" || me) return;
  me = { uid: user.uid, n: info.n, l: info.l, s: info.s, st: "idle", r: "" };
  online[me.uid] = presVal();
  if (mode === "fb") await fbStart(); else demoStart();
  changed();
}
// cập nhật trạng thái của mình: st = idle (treo máy) | boss | room; l = cấp
export function setMe(patch) {
  if (!me) return;
  let diff = false;
  for (const k in patch) if (me[k] !== patch[k]) { me[k] = patch[k]; diff = true; }
  if (!diff) return;
  online[me.uid] = presVal();
  if (mode === "fb" && D) D.m.update(R("pres/" + me.uid), { n: me.n, l: me.l, s: me.s, st: me.st, r: me.r || "" });
  if (mode === "demo" && bc) { bc.postMessage({ k: "pres", uid: me.uid, v: presVal() }); demoRebuildRooms(); }
  changed();
}

export async function createRoom(name) {
  if (!me) throw new Error("Chưa kết nối.");
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (mode === "fb") await D.m.set(R("rl/" + id), { n: name, h: me.n, c: D.m.serverTimestamp() });
  return { id, name };
}

// info = { n, l, s, g, w } (tên, cấp, phái, giới tính, vũ khí)
export async function joinRoom(id, name, info) {
  if (!me) throw new Error("Chưa kết nối.");
  const r = rooms[id];
  if (r && Object.keys(r.m || {}).length >= ROOM_MAX && !(r.m || {})[me.uid]) throw new Error(`Phòng đã đủ ${ROOM_MAX} người.`);
  const room = mode === "fb" ? new FbRoom(id, info) : new DemoRoom(id, info);
  await room.open();
  setMe({ st: "room", r: id, rn: name || (r && r.n) || "", rc: (r && r.c) || Date.now() });
  return room;
}

// ----- Phòng: phần chung -----
class RoomBase {
  constructor(id, info) {
    this.id = id; this.uid = me.uid; this.info = info;
    this.players = {};                 // uid -> trạng thái (gồm cả mình)
    this.dummy = null;                 // { hp, mx, g } do chủ phòng ghi
    this.onCast = null; this.onDummy = null;
    this.stats = stats; this.q = 0; this.closed = false;
  }
  // chủ phòng = người vào sớm nhất còn trong phòng (giữ máu mộc nhân)
  isHost() {
    let best = null;
    for (const uid in this.players) {
      const j = this.players[uid].j || 0;
      if (!best || j < best.j || (j === best.j && uid < best.uid)) best = { uid, j };
    }
    return !best || best.uid === this.uid;
  }
  count() { return Object.keys(this.players).length; }
  _cast(uid, ev) { if (uid !== this.uid && this.onCast) this.onCast(uid, ev); }
  _dummy(d) { this.dummy = d; if (this.onDummy) this.onDummy(d); }
}

class FbRoom extends RoomBase {
  async open() {
    const m = D.m, base = "rm/" + this.id, uid = this.uid;
    this.base = base; this.unsub = [];
    this.refMe = R(base + "/p/" + uid);
    await m.onDisconnect(this.refMe).remove();
    await m.onDisconnect(R(base + "/e/" + uid)).remove();
    await m.onDisconnect(R("rl/" + this.id + "/m/" + uid)).remove();
    await m.set(R("rl/" + this.id + "/m/" + uid), me.n);
    await m.set(this.refMe, { ...this.info, j: m.serverTimestamp() });
    const p0 = await m.get(R(base + "/p")); count("p", p0.val());
    Object.assign(this.players, p0.val() || {});
    const e0 = await m.get(R(base + "/e")); count("e", e0.val());
    const lastQ = {}; const ev0 = e0.val() || {}; for (const k in ev0) lastQ[k] = ev0[k].q || 0;
    const on = (fn, path, cb) => this.unsub.push(fn(R(path), cb));
    on(m.onChildAdded, base + "/p", s => { if (s.key !== uid) count(s.key, s.val()); this.players[s.key] = s.val(); });
    on(m.onChildChanged, base + "/p", s => { if (s.key !== uid) count(s.key, s.val()); this.players[s.key] = s.val(); });
    on(m.onChildRemoved, base + "/p", s => { delete this.players[s.key]; });
    const evCb = s => {
      const v = s.val(); if (!v || s.key === uid) return;
      count(s.key, v);
      if ((v.q || 0) <= (lastQ[s.key] || 0)) return;
      lastQ[s.key] = v.q; this._cast(s.key, v);
    };
    on(m.onChildAdded, base + "/e", evCb);
    on(m.onChildChanged, base + "/e", evCb);
    on(m.onValue, base + "/d", s => { const v = s.val(); count("d", v); if (v) this._dummy(v); });
    // đo độ trễ: ghi 1 số nhỏ, đợi máy chủ xác nhận (3 giây 1 lần)
    this.pingT = setInterval(async () => {
      if (document.hidden || this.closed) return;
      const t0 = performance.now();
      try { await m.update(this.refMe, { pg: stats.ping }); stats.ping = Math.round(performance.now() - t0); } catch (e) { /* mất mạng */ }
    }, 3000);
  }
  send(patch) { if (!this.closed) D.m.update(this.refMe, patch).catch(() => {}); }
  cast(ev) { if (!this.closed) D.m.set(R(this.base + "/e/" + this.uid), { ...ev, q: ++this.q }).catch(() => {}); }
  setDummy(d) { if (!this.closed) D.m.set(R(this.base + "/d"), d).catch(() => {}); }
  async leave() {
    if (this.closed) return; this.closed = true;
    clearInterval(this.pingT);
    this.unsub.forEach(f => f());
    const m = D.m, uid = this.uid, others = Object.keys(this.players).filter(u => u !== uid);
    await Promise.all([m.remove(this.refMe), m.remove(R(this.base + "/e/" + uid)), m.remove(R("rl/" + this.id + "/m/" + uid))]).catch(() => {});
    m.onDisconnect(this.refMe).cancel(); m.onDisconnect(R(this.base + "/e/" + uid)).cancel(); m.onDisconnect(R("rl/" + this.id + "/m/" + uid)).cancel();
    if (!others.length) { await m.remove(R("rl/" + this.id)).catch(() => {}); await m.remove(R(this.base)).catch(() => {}); }   // người cuối: xóa phòng
    setMe({ st: "idle", r: "", rn: "", rc: 0 });
  }
}

class DemoRoom extends RoomBase {
  async open() {
    demoRooms[this.id] = this;
    this.players[this.uid] = { ...this.info, j: Date.now() };
    this.full = { ...this.players[this.uid] };
    this._post({ k: "hello", v: this.full });
    this.pingT = setInterval(() => {                       // nhắc lại trạng thái + dọn người đã tắt tab
      if (this.closed) return;
      for (const uid in this.players) if (uid !== this.uid && !online[uid]) delete this.players[uid];
      if (this.isHost() && this.dummy) this._post({ k: "d", v: this.dummy });
      stats.ping = 0;
    }, 2000);
    await new Promise(r => setTimeout(r, 150));             // đợi các tab khác chào lại
  }
  _post(x) { bc.postMessage({ ...x, r: this.id, uid: this.uid }); }
  _msg(x) {
    if (this.closed) return;
    if (x.k === "hello") { this.players[x.uid] = { ...x.v }; this._post({ k: "p", v: this.full, full: 1 }); if (this.isHost() && this.dummy) this._post({ k: "d", v: this.dummy }); }
    else if (x.k === "p") this.players[x.uid] = { ...(this.players[x.uid] || {}), ...x.v };
    else if (x.k === "e") this._cast(x.uid, x.v);
    else if (x.k === "d") this._dummy(x.v);
    else if (x.k === "leave") delete this.players[x.uid];
  }
  send(patch) { if (this.closed) return; Object.assign(this.full, patch); Object.assign(this.players[this.uid], patch); this._post({ k: "p", v: patch }); }
  cast(ev) { if (!this.closed) this._post({ k: "e", v: { ...ev, q: ++this.q } }); }
  setDummy(d) { if (this.closed) return; this.dummy = d; this._post({ k: "d", v: d }); }
  async leave() {
    if (this.closed) return; this.closed = true;
    clearInterval(this.pingT);
    this._post({ k: "leave" }); delete demoRooms[this.id];
    setMe({ st: "idle", r: "", rn: "", rc: 0 });
  }
}
