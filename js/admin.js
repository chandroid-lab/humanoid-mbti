// Admin page: sign in with the admin Firebase account, then reset all votes.
// The real protection is database.rules.json: only this account may delete votes.
import { firebaseConfig } from "./firebase-config.js";

export const ADMIN_EMAIL = "admin@humanoid-mbti.firebaseapp.com";
const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

const $ = (id) => document.getElementById(id);
const show = (id, on) => ($(id).hidden = !on);

const [{ initializeApp }, A, D] = await Promise.all([
  import(`${SDK}/firebase-app.js`),
  import(`${SDK}/firebase-auth.js`),
  import(`${SDK}/firebase-database.js`),
]);
const app = initializeApp(firebaseConfig);
const auth = A.getAuth(app);
const db = D.getDatabase(app);

let unsubscribe = null;

A.onAuthStateChanged(auth, (user) => {
  $("status").textContent = "";
  const isAdmin = user?.email === ADMIN_EMAIL;
  show("login", !isAdmin);
  show("panel", isAdmin);
  unsubscribe?.();
  unsubscribe = null;
  if (isAdmin) {
    unsubscribe = D.onValue(D.ref(db, "votes"), (snap) => {
      $("count").textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
    });
  } else if (user) {
    A.signOut(auth); // signed in as someone else: drop it
  } else {
    $("pw").focus();
  }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginMsg").textContent = "";
  $("loginBtn").disabled = true;
  try {
    await A.signInWithEmailAndPassword(auth, ADMIN_EMAIL, $("pw").value);
    $("pw").value = "";
  } catch (err) {
    const code = err.code || "";
    $("loginMsg").textContent =
      code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")
        ? "비밀번호가 맞지 않아요."
        : code.includes("too-many-requests")
        ? "시도가 너무 많아요. 잠시 뒤 다시 해 주세요."
        : code.includes("configuration-not-found") || code.includes("operation-not-allowed")
        ? "Firebase에서 이메일/비밀번호 로그인이 아직 꺼져 있어요."
        : `로그인 실패: ${code || err.message}`;
  } finally {
    $("loginBtn").disabled = false;
  }
});

$("resetBtn").addEventListener("click", async () => {
  const n = $("count").textContent;
  if (!confirm(`응답 ${n}개를 모두 지울까요? 되돌릴 수 없어요.`)) return;
  const msg = $("resetMsg");
  msg.className = "msg";
  msg.textContent = "지우는 중…";
  $("resetBtn").disabled = true;
  try {
    await D.remove(D.ref(db, "votes"));
    msg.className = "msg ok";
    msg.textContent = `초기화했어요 (${new Date().toLocaleTimeString("ko-KR")}).`;
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = `실패: ${err.message}`;
  } finally {
    $("resetBtn").disabled = false;
  }
});

$("logoutBtn").addEventListener("click", () => A.signOut(auth));
