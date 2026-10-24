// 3D humanoid viewer (three.js, loaded only when a result page needs it).
// The model keeps its original URDF colors. The parts a field works on stay bright with a thin gold
// outline; the other parts are dimmed (same hue), so nothing is painted over.
const MODEL_URL = "assets/g1.glb";

let libs = null;
function loadLibs() {
  libs ??= Promise.all([
    import("three"), // resolved by the import map in index.html
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/controls/OrbitControls.js"),
  ]);
  return libs;
}

let gltfPromise = null;

// Mount a viewer into `el`, highlighting `parts` (e.g. ["head", "hands"]). Returns a cleanup function.
export async function mountRobot(el, parts) {
  const [THREE, { GLTFLoader }, { OrbitControls }] = await loadLibs();
  if (!el.isConnected) return () => {};
  gltfPromise ??= new Promise((res, rej) => new GLTFLoader().load(MODEL_URL, res, undefined, rej));
  const gltf = await gltfPromise;
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
  const rim = new THREE.DirectionalLight(0x75aadb, 1.2); rim.position.set(-2, 1.5, -2.5); scene.add(rim);

  const root = gltf.scene.clone(true);
  const want = new Set(parts);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const part = o.name || o.parent?.name || "";
    const on = [...want].some((p) => part.startsWith(p));
    o.geometry = o.geometry.clone();
    o.geometry.computeVertexNormals();
    // Keep the original colors: focus parts at full brightness, the rest only dimmed (same hue).
    o.material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.6, metalness: 0.1,
      color: on ? 0xffffff : 0x4a5866,
    });
    if (on) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(o.geometry, 60),
        new THREE.LineBasicMaterial({ color: 0xd6c27f, transparent: true, opacity: 0.85 })
      );
      o.add(edges);
    }
  });
  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 50);
  const dist = (size.y / 2) / Math.tan((15 * Math.PI) / 180) * 1.12;
  camera.position.set(center.x + dist * 0.35, center.y + size.y * 0.06, center.z + dist);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 1.2;
  controls.update();

  // Only animate while visible.
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); });
  io.observe(el);
  function loop() {
    if (!visible || !el.isConnected) { raf = 0; return; }
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  return () => { cancelAnimationFrame(raf); io.disconnect(); controls.dispose(); renderer.dispose(); };
}
