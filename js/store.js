// ===== LƯU TRỮ: Firebase (thật) hoặc chế độ thử (localStorage) =====
import { FIREBASE_CONFIG, LOGIN_DOMAIN, ADMIN_USERNAMES } from "./config.js";

export const DEMO = String(FIREBASE_CONFIG.apiKey).startsWith("DIEN_");
const V = "10.12.2";
let fb = null;

const toUser = (uid, username) => ({
  uid, username, isAdmin: ADMIN_USERNAMES.map(s => s.toLowerCase()).includes(username)
});

export async function init(onUser) {
  if (DEMO) {
    const u = localStorage.getItem("vlyn_session");
    onUser(u ? toUser("demo_" + u, u) : null);
    return;
  }
  const appM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fsM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  fb = { auth: authM.getAuth(app), db: fsM.getFirestore(app), authM, fsM };
  authM.onAuthStateChanged(fb.auth, user => {
    if (!user) return onUser(null);
    const username = (user.email || "").split("@")[0].toLowerCase();
    onUser(toUser(user.uid, username));
  });
}

const ERR = {
  "auth/invalid-credential": "Sai tên đăng nhập hoặc mật khẩu.",
  "auth/wrong-password": "Sai mật khẩu.",
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
  if (DEMO) { localStorage.setItem("vlyn_session", username); location.reload(); return; }
  try { await fb.authM.signInWithEmailAndPassword(fb.auth, `${username}@${LOGIN_DOMAIN}`, password); }
  catch (e) { throw new Error(msg(e)); }
}

export async function logout() {
  if (DEMO) { localStorage.removeItem("vlyn_session"); location.reload(); return; }
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
  return snap.exists() ? snap.data() : null;
}

export async function savePlayer(uid, p) {
  const data = JSON.parse(JSON.stringify(p));
  if (DEMO) { localStorage.setItem("vlyn_player_" + uid, JSON.stringify(data)); return; }
  await fb.fsM.setDoc(fb.fsM.doc(fb.db, "players", uid), data);
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
