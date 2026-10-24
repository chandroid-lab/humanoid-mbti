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
    o.waist_pitch_joint = 0.4 * lean;
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
  pickplace: { kind: "table", loop: 6 }, plan: { kind: "table", loop: 8 }, codefix: { kind: "table", loop: 8 },
  stop: { kind: "table", loop: 6, hazard: true }, grasp: { kind: "table" },
  walk: { kind: "floor", speed: 0.55 }, step: { kind: "floor", speed: 0.9 },
  scan: { kind: "shelves" }, lookagain: { kind: "shelves" },
};

// Vertical drop of the pelvis so the stance foot stays on the floor (thigh ≈ shank ≈ 0.3 m).
function pelvisDrop(q) {
  const leg = (s) => {
    const h = q[`${s}_hip_pitch_joint`] || 0, k = q[`${s}_knee_joint`] || 0;
    return 0.6 - (0.3 * Math.cos(h) + 0.3 * Math.cos(h + k));
  };
  return Math.min(leg("left"), leg("right"));
}

// Mount a viewer into `el`. parts: ["head", ...] to highlight; motion: a key of MOTIONS.
export async function mountRobot(el, parts, motion) {
  const [THREE, { GLTFLoader }, { OrbitControls }] = await loadLibs();
  if (!el.isConnected) return () => {};
  assetPromise ??= Promise.all([
    new Promise((res, rej) => new GLTFLoader().load(`${MODEL}.glb`, res, undefined, rej)),
    fetch(`${MODEL}.json`).then((r) => r.json()),
  ]);
  const [gltf, meta] = await assetPromise;
  if (!el.isConnected) return () => {};

  const w = el.clientWidth, h = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x0a1a2e, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x75aadb, 1.0); rim.position.set(-2, 1.5, -2.5); scene.add(rim);

  const root = gltf.scene.clone(true);
  const want = new Set(parts);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const on = want.has(meta.parts[o.name]);
    o.geometry = o.geometry.clone();
    o.geometry.computeVertexNormals();
    o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, color: on ? 0xffffff : 0x4a5866 });
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
  const tmp = new THREE.Quaternion();
  const fn = MOTIONS[motion] || MOTIONS.scan;
  function pose(t) {
    const q = fn(t);
    for (const j of J) {
      const v = Math.min(j.range[1], Math.max(j.range[0], q[j.name] || 0));
      j.node.quaternion.copy(j.rest).multiply(tmp.setFromAxisAngle(j.axis, v));
    }
    top.position.y = topY - pelvisDrop(q);
  }
  pose(0);

  // ----- environment -----
  const env = new THREE.Group();
  scene.add(env);
  const grid = new THREE.GridHelper(8, 32, 0x2b4a68, 0x152a40);
  env.add(grid);
  const sc = SCENES[motion] || {};
  const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const fA = root.getObjectByName("right_hand_index_1_link"), fB = root.getObjectByName("right_hand_thumb_2_link");
  const grabPoint = (out) => { const b = V(); fA.getWorldPosition(out); fB.getWorldPosition(b); return out.add(b).multiplyScalar(0.5); };
  let cube = null, held = false, offset = V(), pickPos = null, tableTop = 0, lastT = 0;
  const CUBE = 0.06;
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
    if (!pick) { pose(L * 0.3); root.updateMatrixWorld(true); pick = grabPoint(V()); } // reach target without grasping
    place ??= pick.clone();
    pose(0); root.updateMatrixWorld(true);
    tableTop = Math.min(pick.y, place.y) - CUBE / 2 - 0.005;
    const minX = Math.min(pick.x, place.x) - 0.22, maxX = Math.max(pick.x, place.x) + 0.22;
    const minZ = Math.min(pick.z, place.z) - 0.12, maxZ = Math.max(pick.z, place.z) + 0.25;
    const top = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.035, maxZ - minZ), mat(0x2c4258));
    top.position.set((minX + maxX) / 2, tableTop - 0.0175, (minZ + maxZ) / 2);
    env.add(top);
    for (const [x, z] of [[minX + 0.03, minZ + 0.03], [maxX - 0.03, minZ + 0.03], [minX + 0.03, maxZ - 0.03], [maxX - 0.03, maxZ - 0.03]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, tableTop - 0.035, 0.03), mat(0x1d3044));
      leg.position.set(x, (tableTop - 0.035) / 2, z);
      env.add(leg);
    }
    if (motion !== "grasp") {
      cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE, CUBE), mat(0x75aadb, 0.5));
      pickPos = V(pick.x, tableTop + CUBE / 2, pick.z);
      cube.position.copy(pickPos);
      env.add(cube);
    }
    if (sc.hazard) { // something the robot must not touch: it stops short of it
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 20), mat(0xe0745a, 0.6));
      cone.position.set(pick.x, tableTop + 0.06, pick.z + 0.09);
      env.add(cone);
      cube.position.set(pick.x + 0.12, tableTop + CUBE / 2, pick.z + 0.06);
      pickPos = cube.position.clone();
    }
  }
  if (sc.kind === "shelves") {
    for (let i = 0; i < 7; i++) { // behind and beside the robot, never between it and the camera
      const a = Math.PI * 0.62 + i * (Math.PI * 0.76 / 6), r = 1.1 + 0.25 * (i % 2);
      const hgt = 0.35 + 0.3 * ((i * 37) % 5) / 4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, hgt, 0.28), mat(i % 3 ? 0x2c4258 : 0x3d5873));
      b.position.set(Math.sin(a) * r, hgt / 2, Math.cos(a) * r);
      env.add(b);
    }
  }
  function envStep(t) {
    if (sc.kind === "floor") grid.position.z = -((t * sc.speed) % 0.25);
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
      cube.position.y = tableTop + CUBE / 2;
    }
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 50);
  const dist = (size.y / 2) / Math.tan((15 * Math.PI) / 180) * 1.02;
  camera.position.set(center.x + dist * 0.45, center.y + size.y * 0.08, center.z + dist);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.update();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); });
  io.observe(el);
  function loop() {
    if (!visible || !el.isConnected) { raf = 0; return; }
    if (!reduce) { const t = (performance.now() - t0) / 1000; pose(t); root.updateMatrixWorld(true); envStep(t); }
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  return () => { cancelAnimationFrame(raf); io.disconnect(); controls.dispose(); renderer.dispose(); };
}

export const MOTION_NAMES = Object.keys(MOTIONS);
