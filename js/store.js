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

export async function login(username, password) {
  username = cleanUsername(username);
  if (!/^[a-z0-9_.]{2,30}$/.test(username)) throw new Error("Tên đăng nhập chỉ gồm chữ không dấu, số, dấu _ hoặc .");
  if (DEMO) { localStorage.setItem("vlyn_session", username); sessionStorage.setItem("vlyn_session", username); location.reload(); return; }
  try { await fb.authM.signInWithEmailAndPassword(fb.auth, `${username}@${LOGIN_DOMAIN}`, password); }
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
export async function addListing(user, sellerName, L) {
  const data = JSON.parse(JSON.stringify({ ...L, uid: user.uid, seller: sellerName, createdAt: Date.now() }));
  if (DEMO) {
    const arr = demoMarket(); const row = { ...data, id: mkId() };
    arr.push(row); demoSaveMarket(arr); return row;
  }
  const ref = await fb.fsM.addDoc(fb.fsM.collection(fb.db, "market"), data);
  return { ...data, id: ref.id };
}

// Người bán rút hàng về: trả về listing (hoặc null nếu đã có người mua)
export async function withdrawListing(user, id) {
  if (DEMO) {
    const arr = demoMarket(), i = arr.findIndex(x => x.id === id && x.uid === user.uid);
    if (i < 0) return null;
    const row = arr.splice(i, 1)[0]; demoSaveMarket(arr); return row;
  }
  const { fsM, db } = fb, ref = fsM.doc(db, "market", id);
  return fsM.runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (!s.exists() || s.data().uid !== user.uid) return null;
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
    list.push({ gold: row.price, name: row.name, qty: row.qty, buyer: buyerName, at: Date.now() });
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
      { gold: row.price, name: row.name, qty: row.qty || 1, buyer: buyerName, at: Date.now() });
    return row;
  });
}

// Người bán nhận vàng từ hàng đã bán (kể cả lúc offline). Trả về danh sách đã nhận
export async function claimPayouts(user) {
  if (DEMO) {
    const key = "vlyn_payout_" + user.uid, list = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.removeItem(key); return list;
  }
  const { fsM, db } = fb, col = fsM.collection(db, "payouts", user.uid, "list");
  const snap = await fsM.getDocs(col), out = [];
  for (const d of snap.docs) { out.push(d.data()); await fsM.deleteDoc(d.ref); }
  return out;
}
