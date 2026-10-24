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
  pickplace: { kind: "table", loop: 6, status: (p) => p < 0.25 ? "detect box → reach" : p < 0.55 ? "grasp → carry" : p < 0.75 ? "place in tray" : "done ✓" },
  plan: { kind: "table", loop: 8, status: (p) => p < 0.3 ? "scan → plan: [reach, grasp, place]" : p < 0.5 ? "step 1 · reach" : p < 0.7 ? "step 2 · grasp" : "step 3 · place ✓" },
  codefix: { kind: "table", loop: 8, status: (p) => p < 0.25 ? "try 1 · reach(x=+0.12)" : p < 0.5 ? "miss ✗ → fix code: x=0.0" : p < 0.85 ? "try 2 · grasp ✓" : "" },
  stop: { kind: "table", loop: 6, hazard: true, status: (p) => p < 0.22 ? "reach box" : p < 0.62 ? "hazard in path → STOP" : "retract · ask human" },
  grasp: { kind: "table" },
  walk: { kind: "floor", speed: 0.55, status: () => "terrain: flat · step ok" },
  step: { kind: "floor", speed: 0.9, status: () => "control loop 500 Hz" },
  scan: { kind: "shelves", status: () => "mapping · 3D memory +1" },
  lookagain: { kind: "shelves", loop: 7, zoom: true, status: (p) => p < 0.45 ? "scan · unsure" : p < 0.85 ? "zoom ×2 · look again" : "confident ✓",
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
  const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] = await loadLibs();
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
  const cardboard = std({ map: canvasTex(THREE, 128, 128, TEX.cardboard), roughness: 0.95 });
  const metal = std({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.35 });

  const fA = root.getObjectByName("right_hand_index_1_link"), fB = root.getObjectByName("right_hand_thumb_2_link");
  const grabPoint = (out) => { const b = V(); fA.getWorldPosition(out); fB.getWorldPosition(b); return out.add(b).multiplyScalar(0.5); };
  const targets = []; // things the robot camera "detects": { obj, label, color }
  let cube = null, held = false, offset = V(), pickPos = null, tableTop = 0, lastT = 0;
  const CUBE = 0.065;
  if (sc.kind === "table" && fA && fB) {
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
    tableTop = Math.min(pick.y, place.y) - CUBE / 2 - 0.005;
    const minX = Math.min(pick.x, place.x) - 0.3, maxX = Math.max(pick.x, place.x) + 0.3;
    const minZ = Math.min(pick.z, place.z) - 0.1, maxZ = Math.max(pick.z, place.z) + 0.28;
    const wood = std({ map: canvasTex(THREE, 512, 128, TEX.wood, [1, 1]), roughness: 0.55 });
    add(new THREE.BoxGeometry(maxX - minX, 0.035, maxZ - minZ), wood, (minX + maxX) / 2, tableTop - 0.0175, (minZ + maxZ) / 2);
    for (const [x, z] of [[minX + 0.04, minZ + 0.04], [maxX - 0.04, minZ + 0.04], [minX + 0.04, maxZ - 0.04], [maxX - 0.04, maxZ - 0.04]]) {
      add(new THREE.CylinderGeometry(0.014, 0.014, tableTop - 0.035, 12), metal, x, (tableTop - 0.035) / 2, z);
    }
    if (motion !== "grasp") {
      cube = add(new THREE.BoxGeometry(CUBE, CUBE * 0.85, CUBE), cardboard, pick.x, tableTop + CUBE * 0.425, pick.z);
      pickPos = cube.position.clone();
      targets.push({ obj: cube, label: "box", color: "#d6c27f" });
    }
    if (place.distanceTo(pick) > 0.1) { // a tray to put things in
      const tray = new THREE.Group();
      const blue = std({ color: 0x2f6aa3, roughness: 0.45 });
      const T = 0.16, H = 0.035, th = 0.006;
      for (const [gx, gy, gz, px, py, pz] of [[T, th, T, 0, 0, 0], [T, H, th, 0, H / 2, T / 2], [T, H, th, 0, H / 2, -T / 2], [th, H, T, T / 2, H / 2, 0], [th, H, T, -T / 2, H / 2, 0]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(gx, gy, gz), blue); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; tray.add(m);
      }
      tray.position.set(place.x, tableTop, place.z);
      env.add(tray);
      targets.push({ obj: tray, label: "tray", color: "#75aadb" });
    }
    if (sc.hazard) { // something the robot must not touch: it stops short of it
      const cone = new THREE.Group();
      const orange = std({ color: 0xe8642c, roughness: 0.5 });
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 24), orange); c1.position.y = 0.075;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.029, 0.022, 24), std({ color: 0xf2f2f2, roughness: 0.4 })); band.position.y = 0.08;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), std({ color: 0x1b1b1b })); base.position.y = 0.006;
      for (const m of [c1, band, base]) { m.castShadow = true; cone.add(m); }
      cone.position.set(pick.x, tableTop, pick.z + 0.07);
      env.add(cone);
      cube.position.set(pick.x + 0.14, tableTop + CUBE * 0.425, pick.z + 0.05);
      pickPos = cube.position.clone();
      targets.push({ obj: cone, label: "hazard", color: "#e8642c" });
    }
  }
  if (sc.kind === "shelves") {
    for (const [ang, rad] of [[Math.PI * 0.72, 1.25], [Math.PI, 1.35], [Math.PI * 1.28, 1.25]]) {
      const unit = new THREE.Group();
      const W = 0.8, D = 0.35, H = 1.4;
      for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.025, H, 0.025), metal); p.position.set(x, H / 2, z); p.castShadow = true; unit.add(p);
      }
      const r = rand(Math.round(ang * 100));
      for (const y of [0.12, 0.6, 1.08]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, D), metal); s.position.y = y; s.receiveShadow = s.castShadow = true; unit.add(s);
        for (let x = -W / 2 + 0.12; x < W / 2 - 0.1; x += 0.2 + r() * 0.08) {
          const bw = 0.12 + r() * 0.08, bh = 0.1 + r() * 0.14;
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.2), cardboard); b.position.set(x, y + 0.01 + bh / 2, 0); b.castShadow = true; unit.add(b);
        }
      }
      unit.position.set(Math.sin(ang) * rad, 0, Math.cos(ang) * rad);
      unit.lookAt(0, 0, 0);
      env.add(unit);
    }
    // a low cart in front: what the robot looks at (low enough not to hide the robot)
    const cartTop = 0.42, cz = 0.95;
    add(new THREE.BoxGeometry(0.7, 0.03, 0.42), metal, 0, cartTop, cz);
    add(new THREE.BoxGeometry(0.7, 0.02, 0.42), metal, 0, 0.1, cz);
    for (const [x, z] of [[-0.33, cz - 0.19], [0.33, cz - 0.19], [-0.33, cz + 0.19], [0.33, cz + 0.19]]) add(new THREE.CylinderGeometry(0.012, 0.012, cartTop, 10), metal, x, cartTop / 2, z);
    const r = rand(5);
    [-0.2, 0.02, 0.22].forEach((x, i) => {
      const bw = 0.12 + r() * 0.06, bh = 0.08 + r() * 0.1;
      const b = add(new THREE.BoxGeometry(bw, bh, 0.14), cardboard, x, cartTop + 0.015 + bh / 2, cz + (i - 1) * 0.04);
      targets.push({ obj: b, label: "box", color: "#d6c27f" });
    });
  }

  const passing = []; // props that slide past while walking
  if (sc.kind === "floor") {
    const pallet = std({ color: 0x8a6a45, roughness: 0.9 });
    const orange = std({ color: 0xe8642c, roughness: 0.5 });
    const items = [[-0.75, 2.6, "pallet"], [0.8, 1.2, "cone"], [-0.85, 0.0, "cone"], [0.75, -1.4, "pallet"], [-0.7, -2.6, "pallet"]];
    for (const [x, z, kind] of items) {
      const g = new THREE.Group();
      if (kind === "pallet") {
        for (const dx of [-0.25, 0, 0.25]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.8), pallet); m.position.set(dx, 0.05, 0); m.castShadow = true; g.add(m); }
        const topb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.025, 0.8), pallet); topb.position.y = 0.11; topb.castShadow = true; g.add(topb);
        const load = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.5), cardboard); load.position.y = 0.27; load.castShadow = true; g.add(load);
      } else {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 24), orange); c.position.y = 0.17; c.castShadow = true; g.add(c);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.24), std({ color: 0x1b1b1b })); b.position.y = 0.01; g.add(b);
      }
      g.position.set(x, 0, z);
      env.add(g);
      passing.push({ g, z0: z });
      targets.push({ obj: g, label: kind, color: kind === "cone" ? "#e8642c" : "#d6c27f" });
    }
  }

  // ----- the robot's own camera (head), shown as an inset -----
  const headCam = new THREE.PerspectiveCamera(62, 4 / 3, 0.05, 12);
  const torso = root.getObjectByName("torso_link");
  if (headMesh && torso) {
    const hb = new THREE.Box3().setFromObject(headMesh), hc = hb.getCenter(V());
    scene.add(headCam);
    headCam.position.set(hc.x, hc.y - 0.02, hb.max.z + 0.01);
    headCam.lookAt(hc.x, hc.y - 0.55, hc.z + 1.0);
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
      const conf = d.obj === cube && held ? "grasped" : `${c < 0.7 ? "? " : ""}${c.toFixed(2)}`;
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
      for (const p of passing) p.g.position.z = ((((p.z0 - t * sc.speed) + 3.5) % 7) + 7) % 7 - 3.5;
    }
    if (sc.zoom) headCam.fov = 62 - 22 * (fn(t)._zoom || 0), headCam.updateProjectionMatrix();
    statusEl.textContent = sc.status ? sc.status(((t % (sc.loop || 1e9)) / (sc.loop || 1e9))) : "";
    if (!cube) return;
    const L = sc.loop || 6;
    if (t % L < lastT % L) { cube.position.copy(pickPos); held = false; } // new loop: reset the box
    lastT = t;
    const g = fn(t)._grip || 0;
    if (g > 0.5) {
      const gp = grabPoint(V());
      if (!held) { held = true; offset.copy(cube.position).sub(gp); }
      cube.position.copy(gp).add(offset);
    } else if (held) {
      held = false;
      cube.position.y = tableTop + CUBE * 0.425;
    }
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(V()), center = box.getCenter(V());
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 50);
  const dist = (size.y / 2) / Math.tan((15 * Math.PI) / 180) * 1.05;
  camera.position.set(center.x + dist * 0.5, center.y + size.y * 0.12, center.z + dist);

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

  return () => { cancelAnimationFrame(raf); io.disconnect(); controls.dispose(); renderer.dispose(); pmrem.dispose(); inset.remove(); };
}

export const MOTION_NAMES = Object.keys(MOTIONS);
