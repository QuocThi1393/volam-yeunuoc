// ===== LƯU TRỮ: Firebase (thật) hoặc chế độ thử (localStorage) =====
import { FIREBASE_CONFIG, LOGIN_DOMAIN, ADMIN_USERNAMES } from "./config.js";

export const DEMO = String(FIREBASE_CONFIG.apiKey).startsWith("DIEN_");
export const V = "10.12.2";
let fb = null;

const toUser = (uid, username) => ({
  uid, username, isAdmin: ADMIN_USERNAMES.map(s => s.toLowerCase()).includes(username)
});

export async function init(onUser) {
  if (DEMO) {
    const u = sessionStorage.getItem("vlyn_session") || localStorage.getItem("vlyn_session");   // mỗi tab nhớ tài khoản riêng (thử nhiều người trên 1 máy)
    onUser(u ? toUser("demo_" + u, u) : null);
    return;
  }
  const appM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fsM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  fb = { app, auth: authM.getAuth(app), db: fsM.getFirestore(app), authM, fsM };
  authM.onAuthStateChanged(fb.auth, user => {
    if (!user) return onUser(null);
    const username = (user.email || "").split("@")[0].toLowerCase();
    onUser(toUser(user.uid, username));
  });
}

const ERR = {
  "auth/invalid-credential": "Sai tên đăng nhập hoặc mật khẩu.",
  "auth/wrong-password": "Sai mật khẩu.",
  "auth/missing-password": "Chưa nhập mật khẩu. Nếu Chrome tự điền sẵn, hãy xóa ô mật khẩu rồi gõ lại.",
  "auth/user-not-found": "Tài khoản không tồn tại.",
  "auth/invalid-email": "Tên đăng nhập không hợp lệ.",
  "auth/too-many-requests": "Thử sai quá nhiều lần, đợi một lát rồi thử lại.",
  "auth/weak-password": "Mật khẩu mới phải từ 6 ký tự.",
  "auth/network-request-failed": "Lỗi mạng, kiểm tra kết nối.",
  "auth/requires-recent-login": "Hãy đăng xuất rồi đăng nhập lại trước khi đổi mật khẩu."
};
const msg = e => ERR[e && e.code] || ("Lỗi: " + (e && (e.code || e.message)));

export function cleanUsername(u) { return String(u || "").trim().toLowerCase(); }

// remember = false: tắt trình duyệt là phải đăng nhập lại (bản 2.3)
export async function login(username, password, remember = true) {
  username = cleanUsername(username);
  if (!/^[a-z0-9_.]{2,30}$/.test(username)) throw new Error("Tên đăng nhập chỉ gồm chữ không dấu, số, dấu _ hoặc .");
  if (DEMO) {
    sessionStorage.setItem("vlyn_session", username);
    if (remember) localStorage.setItem("vlyn_session", username); else localStorage.removeItem("vlyn_session");
    location.reload(); return;
  }
  try {
    await fb.authM.setPersistence(fb.auth, remember ? fb.authM.browserLocalPersistence : fb.authM.browserSessionPersistence);
    await fb.authM.signInWithEmailAndPassword(fb.auth, `${username}@${LOGIN_DOMAIN}`, password);
  }
  catch (e) { throw new Error(msg(e)); }
}

export async function logout() {
  if (DEMO) { localStorage.removeItem("vlyn_session"); sessionStorage.removeItem("vlyn_session"); location.reload(); return; }
  await fb.authM.signOut(fb.auth);
  location.reload();
}

export async function changePassword(current, next) {
  if (next.length < 6) throw new Error("Mật khẩu mới phải từ 6 ký tự.");
  if (DEMO) return;
  const { authM, auth } = fb;
  try {
    const cred = authM.EmailAuthProvider.credential(auth.currentUser.email, current);
    await authM.reauthenticateWithCredential(auth.currentUser, cred);
    await authM.updatePassword(auth.currentUser, next);
  } catch (e) { throw new Error(msg(e)); }
}

export async function loadPlayer(uid) {
  if (DEMO) {
    const s = localStorage.getItem("vlyn_player_" + uid);
    return s ? JSON.parse(s) : null;
  }
  const snap = await fb.fsM.getDoc(fb.fsM.doc(fb.db, "players", uid));
  const data = snap.exists() ? snap.data() : null;
  const bk = readBackup(uid);         // bản lưu tạm trong máy (lúc lưu lên Firebase bị lỗi) mới hơn thì dùng bản đó
  if (bk && (!data || (bk.lastSeen || 0) > (data.lastSeen || 0))) return bk;
  return data;
}

export async function savePlayer(uid, p) {
  const data = JSON.parse(JSON.stringify(p));
  if (DEMO) { localStorage.setItem("vlyn_player_" + uid, JSON.stringify(data)); return; }
  // ghi bản dự phòng trong máy trước; Firebase xác nhận xong mới xóa (mất mạng giữa chừng cũng không mất tiến độ)
  try { localStorage.setItem(BK + uid, JSON.stringify(data)); } catch (e2) { /* máy đầy bộ nhớ */ }
  try { await fb.fsM.setDoc(fb.fsM.doc(fb.db, "players", uid), data); }
  catch (e) { e.backup = true; throw e; }
  const cur = readBackup(uid);
  if (cur && cur.lastSeen === data.lastSeen) localStorage.removeItem(BK + uid);
}

// ===== Lưu dự phòng trong máy khi Firebase lỗi (hết hạn mức, mất mạng...) =====
const BK = "vlyn_backup_";
function readBackup(uid) { try { const s = localStorage.getItem(BK + uid); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

// Nhân vật chơi ở chế độ thử còn trên trình duyệt này (để chuyển lên Firebase lần đầu)
export function demoPlayers() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith("vlyn_player_")) continue;
    try { out.push({ key: k, ...JSON.parse(localStorage.getItem(k)) }); } catch (e) { /* bỏ qua */ }
  }
  return out;
}
export function fbApp() { return fb ? fb.app : null; }

// ===== NHÂN VẬT: mỗi tài khoản tối đa 3 ô (bản 2.3) =====
// Ô 1 dùng mã tài khoản như cũ (nhân vật đang có không phải chuyển), ô 2–3 thêm đuôi _2, _3
export const MAX_CHARS = 3;
export const charIds = uid => [uid, uid + "_2", uid + "_3"];
export async function listChars(user) {
  return Promise.all(charIds(user.uid).map(async cid => ({ cid, data: await loadPlayer(cid) })));
}
// Tên nhân vật không trùng trong toàn game: collection "names/{tên viết thường}"
export const nameKey = n => String(n || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const NM = "vlyn_names";
const demoNames = () => { try { return JSON.parse(localStorage.getItem(NM) || "{}"); } catch (e) { return {}; } };
// trả về true nếu giữ được tên (hoặc tên đã là của nhân vật này)
export async function claimName(user, cid, name) {
  const k = nameKey(name);
  if (DEMO) {
    const m = demoNames();
    if (m[k] && m[k] !== cid) return false;
    m[k] = cid; localStorage.setItem(NM, JSON.stringify(m)); return true;
  }
  const { fsM, db } = fb, ref = fsM.doc(db, "names", k);
  return fsM.runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (s.exists()) return s.data().cid === cid;
    tx.set(ref, { uid: user.uid, cid, name: String(name).trim(), at: Date.now() });
    return true;
  });
}
export async function releaseName(cid, name) {
  const k = nameKey(name);
  if (DEMO) { const m = demoNames(); if (m[k] === cid) { delete m[k]; localStorage.setItem(NM, JSON.stringify(m)); } return; }
  const { fsM, db } = fb, ref = fsM.doc(db, "names", k);
  const s = await fsM.getDoc(ref);
  if (s.exists() && s.data().cid === cid) await fsM.deleteDoc(ref);
}
// món ở Chợ là của nhân vật nào (hàng rao trước bản 2.3 chưa ghi nhân vật → tính cho ô 1)
export const listingOf = (x, user, cid) => x.cid ? x.cid === cid : (x.uid === user.uid && cid === user.uid);
async function payoutDocs(user, cid) {
  if (DEMO) return [];
  const snap = await fb.fsM.getDocs(fb.fsM.collection(fb.db, "payouts", user.uid, "list"));
  return snap.docs.filter(d => (d.data().cid || user.uid) === cid);
}
// những gì sẽ mất khi xóa nhân vật
export async function charMarketInfo(user, cid) {
  const listings = (await listMarket()).filter(x => listingOf(x, user, cid)).length;
  let gold = 0;
  if (DEMO) JSON.parse(localStorage.getItem("vlyn_payout_" + user.uid) || "[]").forEach(x => { if ((x.cid || user.uid) === cid) gold += x.gold || 0; });
  else (await payoutDocs(user, cid)).forEach(d => { gold += d.data().gold || 0; });
  return { listings, gold };
}
// Xóa nhân vật: chế độ thử gõ lại tên nhân vật, Firebase nhập mật khẩu tài khoản. Xóa cả hàng đang rao và vàng chờ nhận
export async function deleteChar(user, cid, name, confirm) {
  if (DEMO) { if (nameKey(confirm) !== nameKey(name)) throw new Error("Gõ đúng tên nhân vật để xác nhận."); }
  else {
    const { authM, auth } = fb;
    try { await authM.reauthenticateWithCredential(auth.currentUser, authM.EmailAuthProvider.credential(auth.currentUser.email, confirm)); }
    catch (e) { throw new Error(e && (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") ? "Sai mật khẩu." : msg(e)); }
  }
  const mine = (await listMarket()).filter(x => listingOf(x, user, cid));
  if (DEMO) {
    demoSaveMarket(demoMarket().filter(x => !listingOf(x, user, cid)));
    const key = "vlyn_payout_" + user.uid;
    localStorage.setItem(key, JSON.stringify(JSON.parse(localStorage.getItem(key) || "[]").filter(x => (x.cid || user.uid) !== cid)));
    localStorage.removeItem("vlyn_player_" + cid);
  } else {
    const { fsM, db } = fb;
    for (const x of mine) await fsM.deleteDoc(fsM.doc(db, "market", x.id));
    for (const d of await payoutDocs(user, cid)) await fsM.deleteDoc(d.ref);
    await fsM.deleteDoc(fsM.doc(db, "players", cid));
  }
  localStorage.removeItem(BK + cid);
  await releaseName(cid, name).catch(e => console.error(e));
  return { listings: mine.length };
}

export async function listPlayers() {
  if (DEMO) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith("vlyn_player_")) out.push({ uid: k.slice(12), ...JSON.parse(localStorage.getItem(k)) });
    }
    return out;
  }
  const snap = await fb.fsM.getDocs(fb.fsM.collection(fb.db, "players"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ===== CHỢ: rao bán giữa người chơi =====
// Chế độ thử: dùng chung localStorage nên chỉ thấy giữa các tài khoản trên cùng trình duyệt.
// Firebase: collection "market" (hàng đang rao) và "payouts/{uid}/list" (vàng chờ người bán nhận).
const MK = "vlyn_market";
const demoMarket = () => { try { return JSON.parse(localStorage.getItem(MK) || "[]"); } catch (e) { return []; } };
const demoSaveMarket = arr => localStorage.setItem(MK, JSON.stringify(arr));
const mkId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function listMarket() {
  if (DEMO) return demoMarket();
  const snap = await fb.fsM.getDocs(fb.fsM.collection(fb.db, "market"));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

// L = { kind, item | ref, qty, price, name } ; trả về listing đã lưu
export async function addListing(user, cid, sellerName, L) {
  const data = JSON.parse(JSON.stringify({ ...L, uid: user.uid, cid, seller: sellerName, createdAt: Date.now() }));
  if (DEMO) {
    const arr = demoMarket(); const row = { ...data, id: mkId() };
    arr.push(row); demoSaveMarket(arr); return row;
  }
  const ref = await fb.fsM.addDoc(fb.fsM.collection(fb.db, "market"), data);
  return { ...data, id: ref.id };
}

// Người bán rút hàng về: trả về listing (hoặc null nếu đã có người mua)
export async function withdrawListing(user, cid, id) {
  if (DEMO) {
    const arr = demoMarket(), i = arr.findIndex(x => x.id === id && listingOf(x, user, cid));
    if (i < 0) return null;
    const row = arr.splice(i, 1)[0]; demoSaveMarket(arr); return row;
  }
  const { fsM, db } = fb, ref = fsM.doc(db, "market", id);
  return fsM.runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (!s.exists() || !listingOf(s.data(), user, cid)) return null;
    tx.delete(ref);
    return { ...s.data(), id };
  });
}

// Người mua mua hàng: xóa hàng, ghi vàng chờ cho người bán. Trả về listing (null nếu đã bán)
export async function buyListing(user, buyerName, id) {
  if (DEMO) {
    const arr = demoMarket(), i = arr.findIndex(x => x.id === id);
    if (i < 0) return null;
    const row = arr.splice(i, 1)[0]; demoSaveMarket(arr);
    const key = "vlyn_payout_" + row.uid, list = JSON.parse(localStorage.getItem(key) || "[]");
    list.push({ gold: row.price, name: row.name, qty: row.qty, buyer: buyerName, at: Date.now(), cid: row.cid || row.uid });
    localStorage.setItem(key, JSON.stringify(list));
    return row;
  }
  const { fsM, db } = fb, ref = fsM.doc(db, "market", id);
  return fsM.runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (!s.exists()) return null;
    const row = { ...s.data(), id };
    tx.delete(ref);
    tx.set(fsM.doc(fsM.collection(db, "payouts", row.uid, "list")),
      { gold: row.price, name: row.name, qty: row.qty || 1, buyer: buyerName, at: Date.now(), cid: row.cid || row.uid });
    return row;
  });
}

// Người bán nhận vàng từ hàng đã bán (kể cả lúc offline). Trả về danh sách đã nhận
// chỉ nhận vàng của nhân vật đang chơi (cid); vàng của nhân vật khác chờ tới lúc vào nhân vật đó
export async function claimPayouts(user, cid) {
  if (DEMO) {
    const key = "vlyn_payout_" + user.uid, list = JSON.parse(localStorage.getItem(key) || "[]");
    const mine = list.filter(x => (x.cid || user.uid) === cid);
    localStorage.setItem(key, JSON.stringify(list.filter(x => (x.cid || user.uid) !== cid)));
    return mine;
  }
  const out = [];
  for (const d of await payoutDocs(user, cid)) { out.push(d.data()); await fb.fsM.deleteDoc(d.ref); }
  return out;
}
