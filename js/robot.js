// 3D humanoid viewer (three.js, loaded only when a result page needs it).
// The Unitree G1 keeps its original colors and plays a short looping motion for each field.
// The body parts a field works on stay bright with a thin gold outline; the rest is dimmed.
const MODEL = "assets/g1";

let libs = null;
function loadLibs() {
  libs ??= Promise.all([
    import("three"), // resolved by the import map in index.html
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/controls/OrbitControls.js"),
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
  ]);
  return libs;
}
let assetPromise = null;

/* ---------- motions: functions of time (s) -> joint angles (rad) ---------- */
const TAU = Math.PI * 2;
const WAVE_YAW = -1.4; // turns the forearm upward when the arm is raised sideways
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x))); // 0..1 smooth
const seg = (p, a, b) => ease((p - a) / (b - a)); // 0 before a, 1 after b
// G1 elbow: 0 = forearm bent 90° forward, larger = straighter (~1.5 straight).
const ARMS_REST = { left_shoulder_roll_joint: 0.18, right_shoulder_roll_joint: -0.18, left_elbow_joint: 1.1, right_elbow_joint: 1.1 };

function legs(o, side, hip, knee) {
  o[`${side}_hip_pitch_joint`] = hip;
  o[`${side}_knee_joint`] = knee;
  o[`${side}_ankle_pitch_joint`] = -(hip + knee); // keep the foot flat
}
function fingers(o, side, c) { // c: 0 open .. 1 closed
  const s = side === "left" ? -1 : 1;
  o[`${side}_hand_index_0_joint`] = s * 1.1 * c;
  o[`${side}_hand_index_1_joint`] = s * 1.3 * c;
  o[`${side}_hand_middle_0_joint`] = s * 1.1 * c;
  o[`${side}_hand_middle_1_joint`] = s * 1.3 * c;
  o[`${side}_hand_thumb_1_joint`] = -s * 0.4 * c;
  o[`${side}_hand_thumb_2_joint`] = -s * 1.1 * c;
}
// right arm reaching forward; r: 0 rest .. 1 extended, yaw: aim left/right
function reachR(o, r, yaw = 0) {
  o.right_shoulder_pitch_joint = -1.2 * r;
  o.right_elbow_joint = 1.1 + 0.35 * r;
  o.right_shoulder_yaw_joint = yaw * r;
  o.right_wrist_pitch_joint = 0.2 * r;
}

const MOTIONS = {
  walk(t) {
    const o = { ...ARMS_REST }, ph = TAU * 0.9 * t;
    for (const [side, off] of [["left", 0], ["right", Math.PI]]) {
      const sw = Math.max(0, Math.sin(ph + off));
      legs(o, side, -0.1 - 0.5 * sw, 0.25 + 0.8 * sw);
    }
    o.left_shoulder_pitch_joint = 0.35 * Math.sin(ph);
    o.right_shoulder_pitch_joint = -0.35 * Math.sin(ph);
    o.waist_yaw_joint = 0.08 * Math.sin(ph);
    return o;
  },
  step(t) {
    const o = MOTIONS.walk(t * 2);
    o.waist_pitch_joint = 0.1;
    return o;
  },
  balance(t) {
    const o = { ...ARMS_REST, left_shoulder_roll_joint: 0.45, right_shoulder_roll_joint: -0.45 };
    const w = Math.sin(TAU * 0.3 * t);
    o.left_hip_roll_joint = 0.12 * w; o.right_hip_roll_joint = 0.12 * w;
    o.left_ankle_roll_joint = -0.12 * w; o.right_ankle_roll_joint = -0.12 * w;
    o.waist_roll_joint = -0.12 * w;
    legs(o, "left", -0.1, 0.2); legs(o, "right", -0.1, 0.2);
    return o;
  },
  squat(t) {
    const o = { ...ARMS_REST }, s = ease(0.5 - 0.5 * Math.cos(TAU * 0.3 * t));
    legs(o, "left", -0.75 * s, 1.4 * s); legs(o, "right", -0.75 * s, 1.4 * s);
    o.left_shoulder_pitch_joint = o.right_shoulder_pitch_joint = -1.3 * s;
    o.left_elbow_joint = o.right_elbow_joint = 1.1 + 0.35 * s;
    o.waist_pitch_joint = 0.25 * s;
    return o;
  },
  hop(t) {
    const o = { ...ARMS_REST }, p = (t * 0.8) % 1;
    const s = p < 0.6 ? ease(p / 0.6) : 1 - ease((p - 0.6) / 0.15);
    legs(o, "left", -0.6 * s, 1.1 * s); legs(o, "right", -0.6 * s, 1.1 * s);
    o.left_shoulder_pitch_joint = o.right_shoulder_pitch_joint = 0.7 * s - 1.2 * (p > 0.6 && p < 0.8 ? 1 : 0);
    o.waist_pitch_joint = 0.3 * s;
    return o;
  },
  scan(t) {
    const o = { ...ARMS_REST };
    o.waist_yaw_joint = 0.7 * Math.sin(TAU * 0.18 * t);
    o.waist_pitch_joint = 0.06;
    return o;
  },
  lookagain(t) {
    const o = { ...ARMS_REST }, p = (t / 7) % 1;
    o.waist_yaw_joint = p < 0.35 ? 0.6 * Math.sin(TAU * p / 0.35) : 0;
    const lean = seg(p, 0.4, 0.55) * (1 - seg(p, 0.8, 0.95));
    o.waist_pitch_joint = 0.22 * lean;
    o._zoom = lean;
    reachR(o, 0.8 * lean, 0.1);
    fingers(o, "right", 0.6 * lean); // point
    o.right_hand_index_0_joint = 0; o.right_hand_index_1_joint = 0;
    return o;
  },
  grasp(t) {
    const o = { ...ARMS_REST };
    o.left_shoulder_pitch_joint = o.right_shoulder_pitch_joint = -0.5;
    o.left_elbow_joint = o.right_elbow_joint = 0.1;
    const c = 0.5 - 0.5 * Math.cos(TAU * 0.5 * t);
    fingers(o, "left", c); fingers(o, "right", c);
    o.left_wrist_roll_joint = 0.6; o.right_wrist_roll_joint = -0.6;
    return o;
  },
  pickplace(t) {
    const o = { ...ARMS_REST }, p = (t / 6) % 1;
    const r = seg(p, 0, 0.25) * (1 - seg(p, 0.75, 1));
    reachR(o, r, 0);
    o._grip = seg(p, 0.25, 0.35) * (1 - seg(p, 0.6, 0.7));
    fingers(o, "right", o._grip);
    o.waist_yaw_joint = -0.6 * seg(p, 0.35, 0.55) * (1 - seg(p, 0.75, 1));
    o.waist_pitch_joint = 0.2 * r;
    return o;
  },
  plan(t) {
    const p = (t / 8) % 1;
    if (p < 0.3) return { ...MOTIONS.scan(t), waist_yaw_joint: 0.6 * Math.sin(TAU * p / 0.3) };
    return MOTIONS.pickplace((p - 0.3) / 0.7 * 6);
  },
  codefix(t) {
    const o = { ...ARMS_REST }, p = (t / 8) % 1;
    // try 1: aim off, miss, pull back
    const r1 = seg(p, 0, 0.15) * (1 - seg(p, 0.25, 0.35));
    // "fix": small nod, then try 2: aim right, grasp
    const nod = seg(p, 0.35, 0.42) * (1 - seg(p, 0.42, 0.5));
    const r2 = seg(p, 0.5, 0.65) * (1 - seg(p, 0.85, 1));
    if (r1 > 0.001) reachR(o, r1, 0.6); else reachR(o, r2, 0);
    o._grip = seg(p, 0.65, 0.72) * (1 - seg(p, 0.85, 0.95));
    fingers(o, "right", o._grip);
    o.waist_pitch_joint = 0.25 * nod + 0.15 * r2;
    return o;
  },
  stop(t) {
    const o = { ...ARMS_REST }, p = (t / 6) % 1;
    const r = 0.7 * seg(p, 0, 0.25) * (1 - seg(p, 0.6, 0.85));
    reachR(o, r, 0);
    o.right_wrist_pitch_joint = -1.0 * seg(p, 0.25, 0.32) * (1 - seg(p, 0.6, 0.7)); // palm up: "stop"
    return o;
  },
  mimic(t) {
    const o = { ...ARMS_REST };
    o.right_shoulder_roll_joint = -1.3;
    o.right_shoulder_yaw_joint = WAVE_YAW + 0.35 * Math.sin(TAU * 1.1 * t);
    o.right_elbow_joint = 0.1;
    o.waist_yaw_joint = 0.12 * Math.sin(TAU * 0.25 * t);
    return o;
  },
  teleop(t) {
    const o = { ...ARMS_REST };
    o.left_shoulder_pitch_joint = -0.6 - 0.45 * Math.sin(TAU * 0.3 * t);
    o.right_shoulder_pitch_joint = -0.6 - 0.45 * Math.sin(TAU * 0.3 * t + 1.6);
    o.left_elbow_joint = 0.2 + 0.4 * Math.sin(TAU * 0.3 * t + 0.8);
    o.right_elbow_joint = 0.2 + 0.4 * Math.sin(TAU * 0.3 * t + 2.4);
    o.waist_yaw_joint = 0.25 * Math.sin(TAU * 0.15 * t);
    return o;
  },
  dance(t) {
    const o = { ...ARMS_REST }, ph = TAU * 0.9 * t;
    const bob = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(2 * ph));
    legs(o, "left", -bob / 2, bob); legs(o, "right", -bob / 2, bob);
    o.waist_yaw_joint = 0.35 * Math.sin(ph);
    o.left_shoulder_roll_joint = 0.5; o.right_shoulder_roll_joint = -0.5;
    o.left_shoulder_pitch_joint = -1.3 * Math.max(0, Math.sin(ph)) - 0.2;
    o.right_shoulder_pitch_joint = -1.3 * Math.max(0, -Math.sin(ph)) - 0.2;
    o.left_elbow_joint = o.right_elbow_joint = 0.4;
    return o;
  },
};

// Work environment per motion, and how long one loop of that motion is (s).
const SCENES = {
  pickplace: { kind: "table", loop: 6, item: "bagel", dest: "plate", status: (p) => p < 0.25 ? "detect bagel → reach" : p < 0.55 ? "grasp → carry" : p < 0.75 ? "place on plate" : "done ✓" },
  plan: { kind: "table", loop: 8, item: "pizza", dest: "plate", status: (p) => p < 0.3 ? "\"serve the slice\" → plan 3 steps" : p < 0.5 ? "step 1 · reach" : p < 0.7 ? "step 2 · grasp" : "step 3 · place ✓" },
  codefix: { kind: "table", loop: 8, item: "coffee", status: (p) => p < 0.25 ? "try 1 · reach(x=+0.12)" : p < 0.5 ? "miss ✗ → fix code: x=0.0" : p < 0.85 ? "try 2 · grasp ✓" : "" },
  stop: { kind: "table", loop: 6, item: "coffee", hazard: true, status: (p) => p < 0.22 ? "reach coffee" : p < 0.62 ? "hot kettle in path → STOP" : "retract · ask human" },
  grasp: { kind: "table" },
  mimic: { kind: "demo", status: () => "human video → pose → retarget" },
  walk: { kind: "floor", speed: 0.55, status: () => "sidewalk · curb 0.9 m left" },
  step: { kind: "floor", speed: 0.9, status: () => "control loop 500 Hz" },
  scan: { kind: "room", status: () => "mapping · 3D memory +1" },
  lookagain: { kind: "room", loop: 7, zoom: true, status: (p) => p < 0.45 ? "scan · unsure" : p < 0.85 ? "zoom ×2 · look again" : "confident ✓",
    conf: (p) => p < 0.45 ? 0.5 : p < 0.85 ? 0.95 : 0.9 },
};

// Vertical drop of the pelvis so the stance foot stays on the floor (thigh ≈ shank ≈ 0.3 m).
function pelvisDrop(q) {
  const leg = (s) => {
    const h = q[`${s}_hip_pitch_joint`] || 0, k = q[`${s}_knee_joint`] || 0;
    return 0.6 - (0.3 * Math.cos(h) + 0.3 * Math.cos(h + k));
  };
  return Math.min(leg("left"), leg("right"));
}

/* ---------- procedural textures (no image downloads) ---------- */
function canvasTex(THREE, w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  return tex;
}
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function noise(g, w, h, n, r, colorFn) {
  for (let i = 0; i < n; i++) { g.fillStyle = colorFn(r()); g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
const TEX = {
  marble: (g, w, h) => {
    const r = rand(21);
    g.fillStyle = "#e9e6df"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(110,115,125,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 1.6;
      let x = r() * w, y = 0; g.beginPath(); g.moveTo(x, y);
      while (y < h) { x += (r() - 0.5) * 30; y += 10 + r() * 20; g.lineTo(x, y); }
      g.stroke();
    }
  },
  skyline: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#050b16"); sky.addColorStop(0.7, "#0d2038"); sky.addColorStop(1, "#1a2f4a");
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const r = rand(42);
    const tower = (x, bw, bh, spire) => {
      g.fillStyle = "#08111d"; g.fillRect(x, h - bh, bw, bh);
      if (spire) { // stepped crown + spire, Empire State style
        g.fillRect(x + bw * 0.2, h - bh - h * 0.06, bw * 0.6, h * 0.06);
        g.fillRect(x + bw * 0.35, h - bh - h * 0.12, bw * 0.3, h * 0.06);
        g.fillRect(x + bw * 0.47, h - bh - h * 0.24, bw * 0.06, h * 0.12);
        g.fillStyle = "rgba(214,194,127,0.9)"; g.fillRect(x + bw * 0.35, h - bh - h * 0.12, bw * 0.3, h * 0.012);
      }
      for (let yy = h - bh + 6; yy < h - 4; yy += 7) for (let xx = x + 3; xx < x + bw - 3; xx += 6) {
        if (r() < 0.1) { g.fillStyle = `rgba(255,${200 + r() * 40},${130 + r() * 60},${0.2 + r() * 0.35})`; g.fillRect(xx, yy, 3, 4); }
      }
    };
    let x = 0;
    while (x < w) {
      const bw = 30 + r() * 70, bh = h * (0.18 + r() * 0.4);
      tower(x, bw, bh, false); x += bw + 2;
    }
    tower(w * 0.62, 70, h * 0.66, true); // the landmark
    tower(w * 0.3, 55, h * 0.55, false);
  },
  anthora: (g, w, h) => { // blue deli coffee cup with a white key-pattern band
    g.fillStyle = "#1f5fa8"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#f4f1e8"; g.lineWidth = 4;
    for (const y0 of [h * 0.18, h * 0.78]) {
      g.beginPath();
      for (let x = 0; x < w; x += 24) { g.moveTo(x, y0); g.lineTo(x, y0 - 12); g.lineTo(x + 16, y0 - 12); g.lineTo(x + 16, y0 - 4); g.lineTo(x + 8, y0 - 4); }
      g.stroke();
    }
    g.fillStyle = "#f4f1e8"; g.beginPath(); g.ellipse(w * 0.5, h * 0.48, w * 0.12, h * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1f5fa8"; g.beginPath(); g.ellipse(w * 0.5, h * 0.48, w * 0.08, h * 0.12, 0, 0, Math.PI * 2); g.fill();
  },
  asphalt: (g, w, h) => {
    const r = rand(9);
    g.fillStyle = "#23272d"; g.fillRect(0, 0, w, h);
    noise(g, w, h, 6000, r, (v) => `rgba(255,255,255,${v * 0.06})`);
    g.fillStyle = "#e0b43a"; g.fillRect(w * 0.47, 0, w * 0.06, h * 0.55); // dashed center line
  },
  concrete: (g, w, h) => {
    const r = rand(7);
    g.fillStyle = "#3b4550"; g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, r, (v) => `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${0.03 + v * 0.05})`);
    g.strokeStyle = "rgba(10,16,24,0.55)"; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h); // tile seams
  },
  wood: (g, w, h) => {
    const r = rand(3);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#80593a"); grad.addColorStop(1, "#6a4a30");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.strokeStyle = `rgba(40,24,12,${0.08 + 0.12 * Math.abs(Math.sin(y * 0.15 + Math.sin(y * 0.03) * 3))})`;
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 1.5); g.stroke();
    }
    noise(g, w, h, 1500, r, (v) => `rgba(30,18,8,${v * 0.15})`);
  },
  cardboard: (g, w, h) => {
    const r = rand(11);
    g.fillStyle = "#b48b58"; g.fillRect(0, 0, w, h);
    noise(g, w, h, 3000, r, (v) => `rgba(90,60,30,${v * 0.18})`);
    g.fillStyle = "rgba(225,210,170,0.75)"; g.fillRect(w * 0.4, 0, w * 0.2, h); // packing tape
    g.strokeStyle = "rgba(80,55,25,0.6)"; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  },
};

// Mount a viewer into `el`. parts: ["head", ...] to highlight; motion: a key of MOTIONS.
export async function mountRobot(el, parts, motion) {
  const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }, { RoundedBoxGeometry }] = await loadLibs();
  const RB = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
  if (!el.isConnected) return () => {};
  assetPromise ??= Promise.all([
    new Promise((res, rej) => new GLTFLoader().load(`${MODEL}.glb`, res, undefined, rej)),
    fetch(`${MODEL}.json`).then((r) => r.json()),
  ]);
  const [gltf, meta] = await assetPromise;
  if (!el.isConnected) return () => {};

  const w = el.clientWidth, h = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const BG = 0x0b1726;
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 3.2, 8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x1a2430, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(1.6, 3.2, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.2, bottom: -0.4, near: 0.5, far: 8 });
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x75aadb, 0.8); rim.position.set(-2, 1.5, -2.5); scene.add(rim);

  const root = gltf.scene.clone(true);
  const want = new Set(parts);
  let headMesh = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const part = meta.parts[o.name];
    if (part === "head") headMesh = o;
    const on = want.has(part);
    o.geometry = o.geometry.clone();
    o.geometry.computeVertexNormals();
    o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, envMapIntensity: 0.7, color: on ? 0xffffff : 0x56606c });
    o.castShadow = true;
    if (on) o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 60),
      new THREE.LineBasicMaterial({ color: 0xd6c27f, transparent: true, opacity: 0.85 })));
  });
  scene.add(root);

  // joints: remember each body's rest rotation, then rotate about the joint axis on top of it
  const top = root.getObjectByName("robot") || root.children[0];
  const topY = top.position.y;
  const J = [];
  for (const [name, j] of Object.entries(meta.joints)) {
    const node = root.getObjectByName(j.body);
    if (node) J.push({ name, node, rest: node.quaternion.clone(), axis: new THREE.Vector3(...j.axis).normalize(), range: j.range });
  }
  const tmpQ = new THREE.Quaternion();
  const fn = MOTIONS[motion] || MOTIONS.scan;
  function pose(t) {
    const q = fn(t);
    for (const j of J) {
      const v = Math.min(j.range[1], Math.max(j.range[0], q[j.name] || 0));
      j.node.quaternion.copy(j.rest).multiply(tmpQ.setFromAxisAngle(j.axis, v));
    }
    top.position.y = topY - pelvisDrop(q);
    return q;
  }
  pose(0);
  root.updateMatrixWorld(true);

  // ----- environment -----
  const sc = SCENES[motion] || {};
  const env = new THREE.Group();
  scene.add(env);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, ...o });
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const add = (geo, m, x, y, z, shadow = true) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    env.add(mesh);
    return mesh;
  };
  const floorTex = canvasTex(THREE, 256, 256, TEX.concrete, [16, 16]);
  const floor = add(new THREE.PlaneGeometry(8, 8), std({ map: floorTex, roughness: 0.9 }), 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  const metal = std({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.35 });
  // Manhattan skyline behind everything (unaffected by fog)
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3.2, 48, 1, true, Math.PI * 0.55, Math.PI * 0.9),
    new THREE.MeshBasicMaterial({ map: canvasTex(THREE, 2048, 512, TEX.skyline), side: THREE.BackSide, fog: false, color: 0x8796a8 }));
  sky.position.y = 1.5;
  scene.add(sky);

  const fA = root.getObjectByName("right_hand_index_1_link"), fB = root.getObjectByName("right_hand_thumb_2_link");
  const grabPoint = (out) => { const b = V(); fA.getWorldPosition(out); fB.getWorldPosition(b); return out.add(b).multiplyScalar(0.5); };
  // ----- everyday props (built from simple shapes, no downloads) -----
  const P = (() => {
    const grp = (...meshes) => { const g = new THREE.Group(); for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; g.add(m); } return g; };
    const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
    const ceramic = (c) => std({ color: c, roughness: 0.25, metalness: 0.0 });
    const lathe = (pts, mat, seg = 32) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat);
    return {
      mug(color = 0x75aadb) {
        const m = ceramic(color);
        const body = lathe([[0, 0], [0.032, 0], [0.034, 0.005], [0.034, 0.085], [0.03, 0.085], [0.03, 0.008], [0, 0.008]], m);
        body.material.side = THREE.DoubleSide;
        const handle = M(new THREE.TorusGeometry(0.022, 0.006, 10, 20, Math.PI), m, 0.034, 0.045, 0);
        handle.rotation.z = -Math.PI / 2;
        return { g: grp(body, handle), h: 0.085, label: "mug" };
      },
      apple() {
        const a = M(new THREE.SphereGeometry(0.036, 24, 18), std({ color: 0xc0262d, roughness: 0.35 }), 0, 0.034, 0);
        a.scale.set(1, 0.9, 1);
        const stem = M(new THREE.CylinderGeometry(0.0025, 0.002, 0.018, 6), std({ color: 0x4b3420 }), 0, 0.072, 0);
        const leaf = M(new THREE.SphereGeometry(0.01, 8, 6), std({ color: 0x3f8a3a }), 0.009, 0.074, 0); leaf.scale.set(1.4, 0.3, 0.7);
        return { g: grp(a, stem, leaf), h: 0.07, label: "apple" };
      },
      can() {
        const body = M(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 28), std({ color: 0xb3a369, metalness: 0.7, roughness: 0.3 }), 0, 0.06, 0);
        const band = M(new THREE.CylinderGeometry(0.0335, 0.0335, 0.05, 28), std({ color: 0x003057, roughness: 0.4 }), 0, 0.06, 0);
        return { g: grp(body, band), h: 0.12, label: "can" };
      },
      bowl() {
        const b = lathe([[0, 0], [0.04, 0], [0.075, 0.04], [0.08, 0.05], [0.074, 0.05], [0.07, 0.042], [0.036, 0.006], [0, 0.006]], ceramic(0xeae6dc));
        b.material.side = THREE.DoubleSide;
        return { g: grp(b), h: 0.05, label: "bowl" };
      },
      plate() {
        const p = lathe([[0, 0], [0.07, 0], [0.095, 0.012], [0.09, 0.014], [0.066, 0.004], [0, 0.004]], ceramic(0xf2f0ea));
        return { g: grp(p), h: 0.012, label: "plate" };
      },
      plant(s = 1) {
        const pot = lathe([[0, 0], [0.05 * s, 0], [0.065 * s, 0.11 * s], [0.06 * s, 0.11 * s], [0, 0.1 * s]], std({ color: 0xb5643c, roughness: 0.9 }));
        const leaves = [];
        const green = std({ color: 0x3e7d3a, roughness: 0.7 });
        for (let i = 0; i < 9; i++) {
          const l = M(new THREE.SphereGeometry(0.03 * s, 8, 6), green, Math.cos(i * 2.4) * 0.03 * s, (0.13 + 0.03 * (i % 3)) * s, Math.sin(i * 2.4) * 0.03 * s);
          l.scale.set(0.7, 2.2, 0.35); l.rotation.set(Math.sin(i) * 0.6, i * 0.7, Math.cos(i) * 0.6);
          leaves.push(l);
        }
        return { g: grp(pot, ...leaves), h: 0.22 * s, label: "plant" };
      },
      books(n = 4) {
        const cols = [0x003057, 0xb3a369, 0x7a2e2e, 0x75aadb, 0x2f4f3a, 0xd9d2c3];
        const meshes = [];
        let x = 0;
        for (let i = 0; i < n; i++) {
          const t = 0.018 + (i % 3) * 0.006, hh = 0.16 + (i % 2) * 0.03;
          meshes.push(M(RB(t, hh, 0.11, 0.004), std({ color: cols[i % cols.length], roughness: 0.7 }), x, hh / 2, 0));
          x += t + 0.002;
        }
        return { g: grp(...meshes), h: 0.19, label: "books" };
      },
      laptop() {
        const dark = std({ color: 0x2a2d33, metalness: 0.5, roughness: 0.4 });
        const base = M(RB(0.26, 0.012, 0.18, 0.005), dark, 0, 0.006, 0);
        const lid = M(RB(0.26, 0.17, 0.008, 0.004), dark, 0, 0.09, -0.095); lid.rotation.x = -0.25;
        const screen = M(new THREE.PlaneGeometry(0.235, 0.145), std({ color: 0x14365a, emissive: 0x0e2a48, roughness: 0.2 }), 0, 0.09, -0.09); screen.rotation.x = -0.25;
        return { g: grp(base, lid, screen), h: 0.18, label: "laptop" };
      },
      chair() {
        const wood = std({ color: 0x8b6a4a, roughness: 0.7 });
        const parts = [M(new THREE.BoxGeometry(0.42, 0.04, 0.42), wood, 0, 0.45, 0), M(new THREE.BoxGeometry(0.42, 0.4, 0.035), wood, 0, 0.67, -0.19)];
        for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) parts.push(M(new THREE.CylinderGeometry(0.016, 0.016, 0.45, 8), metal, x, 0.225, z));
        return { g: grp(...parts), h: 0.87, label: "chair" };
      },
      bin() {
        const b = lathe([[0, 0], [0.13, 0], [0.16, 0.5], [0.155, 0.5], [0.125, 0.01], [0, 0.01]], std({ color: 0x5d6b78, roughness: 0.6 }));
        b.material.side = THREE.DoubleSide;
        return { g: grp(b), h: 0.5, label: "bin" };
      },
      wetSign() {
        const y = std({ color: 0xf2c230, roughness: 0.5, side: THREE.DoubleSide });
        const a = M(new THREE.BoxGeometry(0.3, 0.55, 0.01), y, 0, 0.27, 0.09); a.rotation.x = -0.32;
        const b = M(new THREE.BoxGeometry(0.3, 0.55, 0.01), y, 0, 0.27, -0.09); b.rotation.x = 0.32;
        return { g: grp(a, b), h: 0.55, label: "wet floor" };
      },
      bagel() {
        const b = M(new THREE.TorusGeometry(0.03, 0.017, 14, 28), std({ color: 0xc58a4a, roughness: 0.6 }), 0, 0.017, 0);
        b.rotation.x = Math.PI / 2; b.scale.set(1, 1, 0.8);
        return { g: grp(b), h: 0.034, label: "bagel" };
      },
      coffee() {
        const cup = M(new THREE.CylinderGeometry(0.036, 0.027, 0.1, 28, 1, true), std({ map: canvasTex(THREE, 256, 96, TEX.anthora), roughness: 0.5, side: THREE.DoubleSide }), 0, 0.05, 0);
        const lid = M(new THREE.CylinderGeometry(0.038, 0.038, 0.01, 28), std({ color: 0xf2f2f2, roughness: 0.4 }), 0, 0.104, 0);
        const bottom = M(new THREE.CircleGeometry(0.027, 20), std({ color: 0x1f5fa8 }), 0, 0.001, 0); bottom.rotation.x = -Math.PI / 2;
        return { g: grp(cup, lid, bottom), h: 0.11, label: "coffee" };
      },
      pizza() {
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.12, -0.04); shape.lineTo(0.12, 0.04); shape.lineTo(0, 0);
        const slice = M(new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false }), std({ color: 0xe8b04a, roughness: 0.7 }), -0.06, 0.008, 0);
        slice.rotation.x = Math.PI / 2;
        const crust = M(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 8), std({ color: 0xc58a4a }), 0.06, 0.008, 0); crust.rotation.x = Math.PI / 2;
        const pep = [[-0.01, 0], [0.025, 0.012], [0.03, -0.014]].map(([x, z]) => { const m = M(new THREE.CylinderGeometry(0.008, 0.008, 0.003, 12), std({ color: 0xa8322a }), x, 0.0105, z); return m; });
        return { g: grp(slice, crust, ...pep), h: 0.02, label: "pizza" };
      },
      taxi(s = 1) { // a real-size sedan cab (length 4.6 m), built along +x
        const paint = new THREE.MeshPhysicalMaterial({ color: 0xf2b705, roughness: 0.28, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1621, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
        const black = std({ color: 0x121316, roughness: 0.6 });
        const chrome = std({ color: 0xd8dde3, metalness: 1, roughness: 0.18 });
        const W = 1.8;
        const shape = (pts) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const q of pts.slice(1)) Array.isArray(q[0]) ? sh.absarc(...q[0]) : sh.lineTo(...q); return sh; };
        // side silhouette with wheel arches
        const body = new THREE.Shape();
        body.moveTo(2.3, 0.3); body.lineTo(1.8, 0.3); body.absarc(1.4, 0.33, 0.4, 0, Math.PI, false);
        body.lineTo(-0.95, 0.3); body.absarc(-1.35, 0.33, 0.4, 0, Math.PI, false);
        body.lineTo(-2.3, 0.3); body.lineTo(-2.32, 0.62); body.quadraticCurveTo(-2.3, 0.8, -2.0, 0.82);
        body.lineTo(-1.0, 0.95); body.quadraticCurveTo(-0.55, 1.3, -0.3, 1.42); body.lineTo(0.7, 1.43);
        body.quadraticCurveTo(1.2, 1.3, 1.55, 1.0); body.lineTo(2.2, 0.97); body.quadraticCurveTo(2.33, 0.9, 2.32, 0.62); body.lineTo(2.3, 0.3);
        const ext = (sh, depth, bevel) => { const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24 }); g.translate(0, 0, -depth / 2); return g; };
        const shell = M(ext(body, W - 0.16, 0.08), paint);
        // greenhouse: tinted glass slightly wider than the body, under the roof line
        const gh = new THREE.Shape();
        gh.moveTo(-0.98, 0.97); gh.quadraticCurveTo(-0.55, 1.28, -0.3, 1.38); gh.lineTo(0.68, 1.39); gh.quadraticCurveTo(1.15, 1.27, 1.5, 1.0); gh.lineTo(-0.98, 0.97);
        const windows = M(ext(gh, W - 0.02, 0.01), glass);
        const pillarB = M(new THREE.BoxGeometry(0.09, 0.42, W + 0.02), paint, 0.22, 1.17, 0);
        const parts = [shell, windows, pillarB];
        // wheels
        for (const [x, z] of [[1.4, 1], [-1.35, 1], [1.4, -1], [-1.35, -1]]) {
          const tire = M(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 28), black, x, 0.33, z * (W / 2 - 0.12)); tire.rotation.x = Math.PI / 2;
          const rim = M(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 20), chrome, x, 0.33, z * (W / 2 - 0.12)); rim.rotation.x = Math.PI / 2;
          parts.push(tire, rim);
        }
        // lights, bumpers, mirrors
        for (const z of [-0.6, 0.6]) {
          parts.push(M(RB(0.06, 0.1, 0.32, 0.02), std({ color: 0xffffff, emissive: 0xfff1c8, emissiveIntensity: 1.2 }), -2.33, 0.72, z));
          parts.push(M(RB(0.06, 0.12, 0.3, 0.02), std({ color: 0x8a0f12, emissive: 0xc0141a, emissiveIntensity: 0.9 }), 2.34, 0.78, z));
          const mirror = M(RB(0.12, 0.08, 0.12, 0.02), paint, -0.85, 1.02, z * 1.6); parts.push(mirror);
        }
        parts.push(M(RB(0.12, 0.16, W - 0.05, 0.04), black, -2.36, 0.42, 0), M(RB(0.12, 0.16, W - 0.05, 0.04), black, 2.36, 0.42, 0));
        // checker band along both sides
        const checker = canvasTex(THREE, 256, 16, (g, w, h) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f0"; g.fillRect(i * 8, j * 8, 8, 8); } }, [1, 1]);
        for (const z of [1, -1]) {
          const band = M(new THREE.PlaneGeometry(2.2, 0.07), std({ map: checker, roughness: 0.4 }), 0.1, 0.78, z * (W / 2 + 0.005));
          if (z < 0) band.rotation.y = Math.PI;
          parts.push(band);
        }
        // roof light
        const sign = canvasTex(THREE, 128, 40, (g, w, h) => { g.fillStyle = "#fff6d8"; g.fillRect(0, 0, w, h); g.fillStyle = "#1b1b1b"; g.font = "bold 28px sans-serif"; g.textAlign = "center"; g.fillText("TAXI", w / 2, 30); });
        const roofSign = M(RB(0.5, 0.16, 0.22, 0.04), std({ map: sign, emissive: 0x6b5a20, emissiveIntensity: 0.6 }), 0.15, 1.53, 0);
        parts.push(roofSign);
        const g = grp(...parts);
        g.scale.setScalar(s);
        return { g, h: 1.6 * s, label: "taxi" };
      },
      hydrant() {
        const red = std({ color: 0xb3261e, roughness: 0.5, metalness: 0.2 });
        return { g: grp(M(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 16), red, 0, 0.25, 0), M(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.5, 0),
          M(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10), red, 0, 0.34, 0).rotateZ(Math.PI / 2), M(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16), red, 0, 0.02, 0)), h: 0.6, label: "hydrant" };
      },
      lamp() {
        const g = std({ color: 0x2f4a3a, metalness: 0.6, roughness: 0.4 });
        const pole = M(new THREE.CylinderGeometry(0.04, 0.06, 3.2, 12), g, 0, 1.6, 0);
        const arm = M(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 10), g, 0.3, 3.15, 0); arm.rotation.z = Math.PI / 2;
        const head = M(new THREE.CylinderGeometry(0.06, 0.16, 0.12, 16), std({ color: 0xfff2c8, emissive: 0xffd27a, emissiveIntensity: 0.8 }), 0.62, 3.08, 0);
        return { g: grp(pole, arm, head), h: 3.2, label: "lamp" };
      },
      newsbox() {
        const blue = std({ color: 0x1f5fa8, roughness: 0.5, metalness: 0.3 });
        return { g: grp(M(new THREE.BoxGeometry(0.45, 0.85, 0.4), blue, 0, 0.55, 0), M(new THREE.BoxGeometry(0.35, 0.2, 0.01), std({ color: 0xdfe7ee, roughness: 0.2 }), 0, 0.8, 0.205)), h: 1.0, label: "news box" };
      },
      trash() {
        const blk = std({ color: 0x15171a, roughness: 0.3, metalness: 0.1 });
        const bags = [[0, 0.2, 0, 0.24], [0.3, 0.17, 0.1, 0.2], [0.12, 0.42, 0.04, 0.18]].map(([x, y, z, r]) => { const m = M(new THREE.SphereGeometry(r, 14, 10), blk, x, y, z); m.scale.set(1, 0.85, 1); return m; });
        return { g: grp(...bags), h: 0.55, label: "trash" };
      },
      kettle() { // hot kettle with steam: the hazard in the safety scene
        const steel = std({ color: 0xc9ced4, metalness: 0.9, roughness: 0.25 });
        const body = lathe([[0, 0], [0.07, 0], [0.078, 0.02], [0.072, 0.08], [0.045, 0.11], [0.02, 0.12], [0, 0.12]], steel);
        const lidKnob = M(new THREE.SphereGeometry(0.012, 12, 8), std({ color: 0x1c1e22 }), 0, 0.125, 0);
        const handle = M(new THREE.TorusGeometry(0.05, 0.007, 8, 20, Math.PI), std({ color: 0x1c1e22, roughness: 0.5 }), 0, 0.115, 0);
        const spout = M(new THREE.CylinderGeometry(0.008, 0.014, 0.08, 10), steel, -0.08, 0.07, 0); spout.rotation.z = 0.9;
        const g = grp(body, lidKnob, handle, spout);
        const steam = [];
        for (let i = 0; i < 6; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 1, depthWrite: false }));
          puff.userData.phase = i / 6; g.add(puff); steam.push(puff);
        }
        g.userData.steam = steam;
        return { g, h: 0.13, label: "hot kettle" };
      },
      arm() { // a person's forearm and hand reaching in: the hazard
        const skin = std({ color: 0xd9a17e, roughness: 0.6 });
        const sleeve = std({ color: 0x3a4f6b, roughness: 0.8 });
        const fore = M(new THREE.CapsuleGeometry(0.024, 0.22, 6, 12), skin, 0.17, 0, 0); fore.rotation.z = Math.PI / 2;
        const hand = M(new THREE.BoxGeometry(0.085, 0.022, 0.06), skin, 0.02, 0, 0);
        const cuff = M(new THREE.CylinderGeometry(0.034, 0.034, 0.16, 16), sleeve, 0.36, 0, 0); cuff.rotation.z = Math.PI / 2;
        return { g: grp(fore, hand, cuff), h: 0.05, label: "human hand" };
      },
    };
  })();

  const targets = []; // things the robot camera "detects": { obj, label, color }
  let steamPuffs = null, demo = null;
  let item = null, itemH = 0, held = false, offset = V(), pickPos = null, tableTop = 0, lastT = 0, dropY = 0;
  if (sc.kind === "table" && fA && fB) {
    const it = sc.item ? P[sc.item]() : null;
    itemH = it ? it.h : 0.06;
    // find where the hand grabs and releases by sampling one loop of the motion
    const L = sc.loop || 6;
    let pick = null, place = null, prevG = 0;
    for (let t = 0; t < L; t += 0.05) {
      pose(t); root.updateMatrixWorld(true);
      const g = fn(t)._grip || 0;
      if (g > 0.5 && prevG <= 0.5 && !pick) pick = grabPoint(V());
      if (g <= 0.5 && prevG > 0.5) place = grabPoint(V());
      prevG = g;
    }
    if (!pick) { pose(L * 0.3); root.updateMatrixWorld(true); pick = grabPoint(V()); }
    place ??= pick.clone();
    pose(0); root.updateMatrixWorld(true);
    tableTop = Math.min(pick.y, place.y) - itemH * 0.5;
    const minX = Math.min(pick.x, place.x) - 0.32, maxX = Math.max(pick.x, place.x) + 0.42;
    const minZ = Math.min(pick.z, place.z) - 0.1, maxZ = Math.max(pick.z, place.z) + 0.3;
    // round marble bistro table on one cast-iron pedestal, big enough for both spots
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const rad = Math.max(maxX - minX, maxZ - minZ) / 2 + 0.02;
    const marble = std({ map: canvasTex(THREE, 512, 512, TEX.marble), roughness: 0.25, metalness: 0.0 });
    const iron = std({ color: 0x1c1e22, roughness: 0.45, metalness: 0.6 });
    add(new THREE.CylinderGeometry(rad, rad, 0.03, 64), marble, cx, tableTop - 0.015, cz);
    add(new THREE.TorusGeometry(rad, 0.008, 8, 64).rotateX(Math.PI / 2), iron, cx, tableTop - 0.03, cz);
    const ped = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0], [0.26, 0], [0.26, 0.02], [0.08, 0.06], [0.035, 0.12], [0.03, tableTop - 0.12], [0.05, tableTop - 0.06], [0.12, tableTop - 0.035], [0, tableTop - 0.035]].map(([x, y]) => new THREE.Vector2(x, y)), 40), iron);
    ped.position.set(cx, 0, cz); ped.castShadow = ped.receiveShadow = true; env.add(ped);
    const put = (o, x, z, ry = 0) => { o.g.position.set(x, tableTop, z); o.g.rotation.y = ry; env.add(o.g); return o; };
    // decoration at the far end, away from the arm
    put(P.plant(0.7), cx - rad * 0.62, cz - rad * 0.55); // back edge, out of the camera's way
    if (it) {
      item = put(it, pick.x, pick.z, -0.4).g;
      pickPos = item.position.clone();
      targets.push({ obj: item, label: it.label, color: "#d6c27f" });
    }
    dropY = tableTop;
    if (sc.dest) {
      const d = put(P[sc.dest](), place.x, place.z);
      dropY = tableTop + 0.012;
      targets.push({ obj: d.g, label: d.label, color: "#75aadb" });
    }
    if (sc.hazard) { // something hot is in the way; the robot must stop
      const a = P.kettle();
      a.g.position.set(pick.x + 0.02, tableTop, pick.z + 0.06);
      env.add(a.g);
      steamPuffs = a.g.userData.steam;
      item.position.set(pick.x - 0.05, tableTop, pick.z + 0.1);
      pickPos = item.position.clone();
      targets.push({ obj: a.g, label: a.label, color: "#e8642c" });
    }
  }
  if (sc.kind === "room") {
    // bookshelves behind, a low coffee table in front with things to look at
    const wood = std({ color: 0x6e5038, roughness: 0.7 });
    for (const [ang, rad] of [[Math.PI * 0.75, 1.35], [Math.PI * 1.25, 1.35]]) {
      const unit = new THREE.Group();
      const W = 0.9, D = 0.3, H = 1.6;
      for (const x of [-W / 2, W / 2]) { const sd = new THREE.Mesh(RB(0.035, H, D, 0.012), wood); sd.position.set(x, H / 2, 0); sd.castShadow = true; unit.add(sd); }
      for (const y of [0.02, 0.42, 0.82, 1.22, 1.6]) { const s = new THREE.Mesh(RB(W, 0.028, D, 0.01), wood); s.position.y = y; s.castShadow = s.receiveShadow = true; unit.add(s); }
      [[0.42, "books", -0.3], [0.42, "plant", 0.25], [0.82, "books", 0.05], [1.22, "books", -0.25], [1.22, "mug", 0.25], [0.02, "books", 0.1]].forEach(([y, k, x], i) => {
        const o = k === "books" ? P.books(5 + (i % 3)) : P[k](0.8); o.g.position.set(x, y + 0.012, 0); unit.add(o.g);
      });
      unit.position.set(Math.sin(ang) * rad, 0, Math.cos(ang) * rad);
      unit.lookAt(0, 0, 0);
      env.add(unit);
    }
    const tTop = 0.42, cz = 0.95;
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 64), wood, 0, tTop, cz);
    for (let i = 0; i < 3; i++) { // three tapered legs
      const a = i * (Math.PI * 2 / 3) + 0.4;
      const leg = add(new THREE.CylinderGeometry(0.018, 0.01, tTop, 10), wood, Math.cos(a) * 0.3, tTop / 2, cz + Math.sin(a) * 0.3);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    }
    const rug = add(new THREE.CircleGeometry(1.1, 64), std({ color: 0x3b4f6b, roughness: 1 }), 0, 0.004, 0.45, false);
    rug.rotation.x = -Math.PI / 2;
    const ring = add(new THREE.RingGeometry(1.0, 1.06, 64), std({ color: 0xb3a369, roughness: 1 }), 0, 0.005, 0.45, false);
    ring.rotation.x = -Math.PI / 2;
    // arc floor lamp
    const brass = std({ color: 0xb3a369, metalness: 0.8, roughness: 0.3 });
    const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(-1.1, 0.05, -0.2), V(-1.1, 2.1, -0.2), V(-0.35, 1.6, 0.3)), 40, 0.014, 8), brass);
    arc.castShadow = true; env.add(arc);
    add(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 32), std({ color: 0x1c1e22, metalness: 0.5, roughness: 0.4 }), -1.1, 0.02, -0.2);
    const shade = add(new THREE.SphereGeometry(0.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xf3ead2, emissive: 0xffd88a, emissiveIntensity: 0.5, side: THREE.DoubleSide }), -0.35, 1.5, 0.3);
    const onTable = [[P.bagel(), -0.06, 0.1], [P.coffee(), 0.15, 0.08], [P.plant(0.9), -0.24, -0.12], [P.laptop(), 0.1, -0.14]];
    onTable.forEach(([o, x, dz]) => { o.g.position.set(x, tTop + 0.018, cz + dz); env.add(o.g); if (o.label === "bagel" || o.label === "coffee") targets.push({ obj: o.g, label: o.label, color: "#d6c27f" }); });
  }
  if (sc.kind === "demo") {
    // a monitor playing a human video: an SMPL body (rendered offline) waving, with pose keypoints
    const tex = new THREE.TextureLoader().load("assets/smpl_wave.jpg");
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(1 / 6, 1 / 4);
    const monitor = new THREE.Group();
    const bezel = new THREE.Mesh(RB(0.78, 0.78, 0.04, 0.02), std({ color: 0x15181c, roughness: 0.4, metalness: 0.3 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.z = 0.021;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 12), metal); pole.position.set(0, -0.72, -0.03);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 32), std({ color: 0x15181c, metalness: 0.4, roughness: 0.4 })); foot.position.set(0, -1.08, -0.03);
    for (const m of [bezel, pole, foot]) { m.castShadow = true; monitor.add(m); }
    monitor.add(screen);
    monitor.position.set(-0.85, 1.1, 0.45);
    monitor.lookAt(0.6, 1.05, 1.6); // between the robot and the viewer
    env.add(monitor);
    demo = { tex };
    targets.push({ obj: screen, label: "person · SMPL pose", color: "#75aadb" });
    const credit = document.createElement("div");
    credit.className = "rv-credit";
    credit.textContent = "human video: SMPL render (Loper et al. 2015)";
    el.appendChild(credit);
  }
  const passing = []; // props that slide past while walking
  if (sc.kind === "floor") {
    floorTex.repeat.set(10, 10); // big sidewalk slabs
    const roadTex = canvasTex(THREE, 128, 256, TEX.asphalt, [1, 6]);
    const road = add(new THREE.PlaneGeometry(2.6, 8), std({ map: roadTex, roughness: 0.95 }), -2.25, 0.003, 0, false);
    road.rotation.x = -Math.PI / 2;
    add(new THREE.BoxGeometry(0.12, 0.12, 8), std({ color: 0x8b939c, roughness: 0.8 }), -0.95, 0.06, 0, false); // curb
    const items = [[-0.75, 1.0, "hydrant"]];
    for (const [x, z, kind] of items) {
      const o = P[kind]();
      o.g.position.set(x, 0, z);
      env.add(o.g);
      passing.push({ g: o.g, z0: z });
      targets.push({ obj: o.g, label: o.label, color: kind === "hydrant" ? "#e8642c" : "#75aadb" });
    }
    const cab = P.taxi(1);
    cab.g.position.set(-1.95, 0, 3);
    cab.g.rotation.y = Math.PI / 2;
    env.add(cab.g);
    passing.push({ g: cab.g, z0: 3, speed: 1.8, road: roadTex });
    targets.push({ obj: cab.g, label: "taxi", color: "#f2b705" });
  }

  // ----- the robot's own camera (head), shown as an inset -----
  const headCam = new THREE.PerspectiveCamera(62, 4 / 3, 0.05, 12);
  const torso = root.getObjectByName("torso_link");
  if (headMesh && torso) {
    const hb = new THREE.Box3().setFromObject(headMesh), hc = hb.getCenter(V());
    scene.add(headCam);
    headCam.position.set(hc.x, hc.y - 0.02, hb.max.z + 0.01);
    headCam.lookAt(hc.x + (sc.kind === "demo" ? -0.6 : 0), hc.y - (sc.kind === "demo" ? 0.05 : 0.55), hc.z + 1.0);
    torso.attach(headCam); // now it turns with the waist
  }
  const inset = document.createElement("div");
  inset.className = "robot-view";
  inset.innerHTML = `<div class="rv-h">ROBOT VIEW · HEAD CAM</div><div class="rv-boxes"></div><div class="rv-s"></div>`;
  el.appendChild(inset);
  const boxesEl = inset.querySelector(".rv-boxes"), statusEl = inset.querySelector(".rv-s");
  const iw = Math.round(Math.min(w * 0.42, 190)), ih = Math.round(iw * 0.75), M = 8;
  Object.assign(inset.style, { width: `${iw}px`, height: `${ih}px`, right: `${M}px`, top: `${M}px` });

  const pv = V(), bb = new THREE.Box3();
  function drawDetections(t) {
    const found = [];
    for (const d of targets) {
      bb.setFromObject(d.obj);
      let x0 = 1, y0 = 1, x1 = -1, y1 = -1, ok = true;
      for (let i = 0; i < 8; i++) {
        pv.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(headCam);
        if (pv.z > 1) { ok = false; break; }
        x0 = Math.min(x0, pv.x); x1 = Math.max(x1, pv.x); y0 = Math.min(y0, pv.y); y1 = Math.max(y1, pv.y);
      }
      if (!ok || x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) continue;
      const L = Math.max(0, (x0 + 1) / 2 * iw), R = Math.min(iw, (x1 + 1) / 2 * iw);
      const T = Math.max(0, (1 - y1) / 2 * ih), B = Math.min(ih, (1 - y0) / 2 * ih);
      const base = sc.conf ? sc.conf(((t % (sc.loop || 1e9)) / (sc.loop || 1e9))) : 0.9;
      const c = Math.min(0.99, base + 0.05 * Math.sin(t * 3 + L));
      const conf = d.obj === item && held ? "grasped" : `${c < 0.7 ? "? " : ""}${c.toFixed(2)}`;
      found.push({ L, T, R, B, d, text: `${d.label} ${conf}`, area: (R - L) * (B - T) });
    }
    // label the biggest of each kind only, so text never piles up in the small view
    const labelled = new Set();
    found.sort((a, b) => b.area - a.area);
    boxesEl.innerHTML = found.map((f) => {
      const show = !labelled.has(f.d.label); labelled.add(f.d.label);
      return `<div class="rv-b" style="left:${f.L}px;top:${f.T}px;width:${f.R - f.L}px;height:${f.B - f.T}px;border-color:${f.d.color}">${show ? `<span style="background:${f.d.color}">${f.text}</span>` : ""}</div>`;
    }).join("");
  }

  function envStep(t) {
    if (sc.kind === "floor") { // the world slides back: the robot walks forward
      floorTex.offset.y = -((t * sc.speed) / 0.5) % 1;
      for (const p of passing) p.g.position.z = ((((p.z0 - t * (p.speed || sc.speed)) + 3.5) % 7) + 7) % 7 - 3.5;
      if (passing.length && passing[passing.length - 1].road) passing[passing.length - 1].road.offset.y = -((t * sc.speed) / 1.33) % 1;
    }
    if (sc.zoom) headCam.fov = 62 - 22 * (fn(t)._zoom || 0), headCam.updateProjectionMatrix();
    if (steamPuffs) for (const p of steamPuffs) { const k = (t * 0.5 + p.userData.phase) % 1; p.position.set(-0.11 - k * 0.05, 0.12 + k * 0.22, Math.sin(k * 9 + p.userData.phase * 6) * 0.02); p.scale.setScalar(0.6 + k * 1.6); p.material.opacity = 0.4 * (1 - k); }
    if (demo) { // the video plays a beat ahead; the robot copies it (see MOTIONS.mimic)
      const f = Math.floor((((t + 0.25) * 1.1) % 1) * 24);
      demo.tex.offset.set((f % 6) / 6, 1 - (Math.floor(f / 6) + 1) / 4);
    }
    statusEl.textContent = sc.status ? sc.status(((t % (sc.loop || 1e9)) / (sc.loop || 1e9))) : "";
    if (!item) return;
    const L = sc.loop || 6;
    if (t % L < lastT % L) { item.position.copy(pickPos); held = false; } // new loop: reset
    lastT = t;
    const g = fn(t)._grip || 0;
    if (g > 0.5) {
      const gp = grabPoint(V());
      if (!held) { held = true; offset.copy(item.position).sub(gp); }
      item.position.copy(gp).add(offset);
    } else if (held) {
      held = false;
      item.position.y = dropY;
    }
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(V()), center = box.getCenter(V());
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 50);
  const wide = sc.kind === "demo"; // show the person and the robot together
  if (wide) { center.x -= 0.25; center.y += 0.12; }
  const dist = (size.y / 2) / Math.tan((15 * Math.PI) / 180) * (wide ? 1.45 : 1.05);
  camera.position.set(center.x + dist * (wide ? 0.25 : 0.5), center.y + size.y * 0.12, center.z + dist);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.6;
  controls.update();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); });
  io.observe(el);
  function loop() {
    if (!visible || !el.isConnected) { raf = 0; return; }
    const t = reduce ? 1.5 : (performance.now() - t0) / 1000;
    pose(t); root.updateMatrixWorld(true); envStep(t);
    controls.update();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, camera);
    if (headMesh) {
      headMesh.visible = false; // don't see the inside of its own head
      renderer.setScissorTest(true);
      renderer.setScissor(w - iw - M, h - ih - M, iw, ih);
      renderer.setViewport(w - iw - M, h - ih - M, iw, ih);
      renderer.render(scene, headCam);
      headMesh.visible = true;
      drawDetections(t);
    }
    raf = requestAnimationFrame(loop);
  }
  loop();

  return () => { cancelAnimationFrame(raf); io.disconnect(); controls.dispose(); renderer.dispose(); pmrem.dispose(); inset.remove(); el.querySelector('.rv-credit')?.remove(); };
}

export const MOTION_NAMES = Object.keys(MOTIONS);
