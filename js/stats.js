// Live stats via Firebase Realtime Database.
// Each device writes one value at votes/<deviceId> = "INTJ", so retaking the quiz overwrites instead of double counting.
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
export const statsEnabled = Boolean(firebaseConfig.databaseURL);

let dbPromise = null;
function getDb() {
  if (!statsEnabled) return Promise.resolve(null);
  dbPromise ??= (async () => {
    const [{ initializeApp }, dbMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-database.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    return { db: dbMod.getDatabase(app), ...dbMod };
  })();
  return dbPromise;
}

function deviceId() {
  let id = localStorage.getItem("hm_device");
  if (!id) {
    id = (crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now()).replace(/-/g, "").slice(0, 20);
    localStorage.setItem("hm_device", id);
  }
  return id;
}

export async function vote(type) {
  try {
    const f = await getDb();
    if (!f) return;
    await f.set(f.ref(f.db, `votes/${deviceId()}`), type);
  } catch (e) {
    console.warn("vote failed", e);
  }
}

// cb receives { counts: {INTJ: n, ...}, total }
export async function subscribe(cb) {
  const f = await getDb();
  if (!f) return () => {};
  return f.onValue(f.ref(f.db, "votes"), (snap) => {
    const counts = {};
    let total = 0;
    snap.forEach((child) => {
      const v = child.val();
      if (typeof v === "string" && /^[EI][SN][TF][JP]$/.test(v)) {
        counts[v] = (counts[v] || 0) + 1;
        total++;
      }
    });
    cb({ counts, total });
  });
}
