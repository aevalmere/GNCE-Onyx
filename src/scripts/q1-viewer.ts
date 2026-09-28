/**
 * Exploded-view viewer for the Qualifier 1 robot (src/pages/biobuzz/q1.astro).
 *
 * Imported dynamically, and only after the password has opened the model, so
 * nothing here (three, the loaders, the BVH) ever ships to any other page.
 *
 * The explode follows the assembly tree. Every node with two or more children
 * is a group, and each child moves away from its group's centre: the two top
 * assemblies first, then the parts and sub-assemblies inside them, then the
 * parts inside those (a wheel's rollers, a motor's can). Each level has its
 * own window on the slider, overlapping the next, so a sub-assembly travels
 * out as one piece before it comes apart. Offsets are measured in the model's
 * own size, so the units the file was exported in do not matter.
 *
 * Frames are drawn on demand: nothing renders while the camera and the parts
 * are still, and the shadow map is only redrawn when a part moves.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface ViewerUI {
  host: HTMLElement;
  slider: HTMLInputElement;
  toggle: HTMLButtonElement;
  reset: HTMLButtonElement;
  label: HTMLElement;
  labelName: HTMLElement;
  labelPath: HTMLElement;
}

type Unit = { obj: THREE.Object3D; base: THREE.Vector3; offset: THREE.Vector3; level: number };

// Palette: the site's indigo family plus one steel, so parts separate by
// value rather than by hue. Grape stays reserved for the hovered part.
const PALETTE = {
  structure: { color: 0x2a3d66, metalness: 0.15, roughness: 0.55 },
  detail: { color: 0x8d97ad, metalness: 0.1, roughness: 0.6 },
  hardware: { color: 0xb9bec8, metalness: 0.55, roughness: 0.35 },
  drive: { color: 0x2b2c33, metalness: 0.2, roughness: 0.5 },
  gear: { color: 0x5d6a8a, metalness: 0.35, roughness: 0.45 },
} as const;
type Tone = keyof typeof PALETTE;

const GRAPE = new THREE.Color(0x823a80);

const clean = (s: string) =>
  s
    .replace(/^occurrence of\s*/i, '')
    .replace(/\s*<\d+>\s*$/, '')
    .trim();
const nameOf = (o: THREE.Object3D) => clean((o.userData?.name as string) || o.name || '');

function toneFor(name: string, diag: number, rootDiag: number): Tone {
  const n = name.toLowerCase();
  if (/\bm\d|screw|bolt|nut\b|locknut|washer|shim|standoff|spacer|rivet|collar|\bpin\b/.test(n)) return 'hardware';
  if (/motor|servo|encoder|bearing|wheel|tire|tyre|roller|mecanum|omni|hub/.test(n)) return 'drive';
  if (/gear|helical|pinion|sprocket|pulley|belt|chain|\d+t\b/.test(n)) return 'gear';
  return diag > rootDiag * 0.12 ? 'structure' : 'detail';
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Even spread of fallback directions for parts that sit on their group's
// centre and so have no direction of their own.
function fibonacci(i: number, n: number, out: THREE.Vector3) {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5));
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
}

export async function mountViewer(ui: ViewerUI, glb: ArrayBuffer, dracoPath: string): Promise<() => void> {
  const { host } = ui;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dirty = true; // a frame is owed; the loop renders only when set
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---- Load --------------------------------------------------------
  const draco = new DRACOLoader().setDecoderPath(dracoPath);
  const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(glb, '');
  draco.dispose();
  const model = gltf.scene;

  // ---- Renderer ----------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.75 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft through shadow.radius
  renderer.shadowMap.autoUpdate = false;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTex = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.9;

  // ---- Centre the model on the origin, resting on nothing ------------
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);
  pivot.updateMatrixWorld(true);
  const restBox = new THREE.Box3().setFromObject(model);
  const restCenter = restBox.getCenter(new THREE.Vector3());
  model.position.sub(restCenter);
  pivot.updateMatrixWorld(true);
  restBox.setFromObject(model);
  const size = restBox.getSize(new THREE.Vector3());
  const rootDiag = size.length();

  // ---- Materials by part ---------------------------------------------
  const tones = new Map<Tone, THREE.MeshStandardMaterial>();
  for (const [k, v] of Object.entries(PALETTE)) tones.set(k as Tone, new THREE.MeshStandardMaterial(v));
  const hoverMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const hoverOf = (m: THREE.MeshStandardMaterial) => {
    let h = hoverMats.get(m);
    if (!h) {
      h = m.clone();
      h.color.lerp(GRAPE, 0.55);
      h.emissive.copy(GRAPE).multiplyScalar(0.35);
      hoverMats.set(m, h);
    }
    return h;
  };
  const ghost = new THREE.MeshStandardMaterial({
    color: 0x10254f,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    roughness: 1,
  });

  const meshes: THREE.Mesh[] = [];
  const baseMat = new Map<THREE.Mesh, THREE.MeshStandardMaterial>();
  const oldMats = new Set<THREE.Material>();
  const geoms = new Set<THREE.BufferGeometry>();
  const tmpBox = new THREE.Box3();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => oldMats.add(x));
    tmpBox.setFromObject(m);
    const part = m.parent && /^occurrence of/i.test((m.parent.userData?.name as string) || '') ? m.parent : m;
    const mat = tones.get(toneFor(nameOf(part), tmpBox.getSize(new THREE.Vector3()).length(), rootDiag))!;
    m.material = mat;
    m.castShadow = true;
    m.receiveShadow = true;
    meshes.push(m);
    baseMat.set(m, mat);
    geoms.add(m.geometry);
  });
  oldMats.forEach((x) => x.dispose());
  geoms.forEach((g) => (g as any).computeBoundsTree());

  // ---- Explode tree --------------------------------------------------
  const units: Unit[] = [];
  let maxLevel = 0;
  const descend = (n: THREE.Object3D) => {
    while (n.children.length === 1) n = n.children[0];
    return n;
  };
  const v = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const build = (group: THREE.Object3D, level: number) => {
    maxLevel = Math.max(maxLevel, level);
    const gBox = new THREE.Box3().setFromObject(group);
    const gCenter = gBox.getCenter(new THREE.Vector3());
    const gDiag = gBox.getSize(new THREE.Vector3()).length();
    // The top of the tree spreads by the whole robot's size; deeper groups
    // by their own, so a bearing opens by a bearing's width, not a robot's.
    const reach = level === 0 ? rootDiag : Math.max(gDiag, rootDiag * 0.08);
    const push = level === 0 ? 0.55 : 0.85; // share of each part's own distance from centre
    const lift = level === 0 ? 0.1 : 0.12; // flat distance, so near-centre parts clear too
    const n = group.children.length;
    group.children.forEach((child, i) => {
      const c = new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3());
      v.subVectors(c, gCenter);
      const dist = v.length();
      if (dist < gDiag * 0.02) fibonacci(i, n, v);
      else v.divideScalar(dist);
      const world = v.clone().multiplyScalar(dist * push + reach * lift);
      // Into the group's own frame, so the offset rides its rotation and scale.
      group.worldToLocal(p0.copy(gCenter));
      group.worldToLocal(p1.copy(gCenter).add(world));
      units.push({ obj: child, base: child.position.clone(), offset: p1.clone().sub(p0), level });
      const next = descend(child);
      if (next.children.length > 1) build(next, level + 1);
    });
  };
  const top = descend(model);
  if (top.children.length > 1) build(top, 0);
  const levels = maxLevel + 1;
  const WINDOW = levels === 1 ? 1 : 0.55;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color: 0x10254f, opacity: 0.16 }),
  );
  floor.receiveShadow = true;
  floor.scale.setScalar(rootDiag * 12);
  scene.add(floor);

  let t = 0;
  const liveBox = new THREE.Box3();
  const applyExplode = () => {
    for (const u of units) {
      const s = levels === 1 ? 0 : (u.level * (1 - WINDOW)) / (levels - 1);
      const k = smooth((t - s) / WINDOW);
      u.obj.position.copy(u.base).addScaledVector(u.offset, k);
    }
    pivot.updateMatrixWorld(true);
    liveBox.setFromObject(model);
    floor.position.y = liveBox.min.y - rootDiag * 0.01;
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  };

  // Fully exploded extent, for the light's shadow frustum and the zoom range.
  t = 1;
  applyExplode();
  const outBox = liveBox.clone().union(restBox);
  const outRadius = outBox.getBoundingSphere(new THREE.Sphere()).radius;
  t = 0;
  applyExplode();

  // ---- Lights --------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xeef1f8, 0x8d97ad, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.6, 1.4, 0.8).multiplyScalar(outRadius * 2);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = rootDiag * 0.002;
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -outRadius * 1.3;
  sc.right = sc.top = outRadius * 1.3;
  sc.near = outRadius * 0.2;
  sc.far = outRadius * 5;
  scene.add(key);
  scene.add(key.target);

  // ---- Camera ----------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(32, 1, rootDiag * 0.005, outRadius * 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = rootDiag * 0.2;
  controls.maxDistance = outRadius * 8;
  const viewDir = new THREE.Vector3(1, 0.75, 1.35).normalize();
  const home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  // A box's bounding sphere runs through its corners, which the robot never
  // fills, so both radii are taken at 0.9 of it.
  const restR = restBox.getBoundingSphere(new THREE.Sphere()).radius * 0.9;
  const outR = outRadius * 0.9;
  // Distance that fits a sphere of radius r in the narrower frustum angle.
  const fit = (r: number) => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return (r * 1.08) / Math.sin(Math.min(vFov, hFov) / 2);
  };
  const frame = () => {
    home.target.set(0, 0, 0);
    home.pos.copy(viewDir).multiplyScalar(fit(restR));
  };
  // Until the reader takes the camera, it backs off as the parts spread so
  // the exploded robot stays in frame, and comes back in as it closes.
  let follow = true;
  const followCam = () => {
    if (!follow || camera.position.equals(controls.target)) return;
    const d = fit(restR + (outR - restR) * smooth(t));
    camera.position.sub(controls.target).setLength(d).add(controls.target);
    dirty = true;
  };

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    followCam();
    dirty = true;
  };
  resize();
  frame();
  camera.position.copy(home.pos);
  controls.target.copy(home.target);
  controls.update();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ---- Explode controls --------------------------------------------------
  let tween: { from: number; to: number; start: number; dur: number } | null = null;
  const syncUI = () => {
    ui.slider.value = String(t);
    ui.slider.setAttribute('aria-valuetext', `${Math.round(t * 100)}%`);
    ui.toggle.textContent = t > 0.5 ? 'Assemble' : 'Explode';
  };
  const onSlider = () => {
    tween = null;
    t = parseFloat(ui.slider.value) || 0;
    applyExplode();
    followCam();
    syncUI();
  };
  const onToggle = () => {
    const to = (tween ? tween.to : t) > 0.5 ? 0 : 1;
    if (reduced) {
      t = to;
      applyExplode();
      followCam();
      syncUI();
      return;
    }
    tween = { from: t, to, start: performance.now(), dur: 1400 * Math.abs(to - t) + 200 };
    ui.toggle.textContent = to ? 'Assemble' : 'Explode';
  };
  ui.slider.addEventListener('input', onSlider);
  ui.toggle.addEventListener('click', onToggle);

  // ---- Hover, select --------------------------------------------------
  const ray = new THREE.Raycaster();
  (ray as any).firstHitOnly = true;
  const ndc = new THREE.Vector2();
  let hovered: THREE.Mesh | null = null;
  let selected: THREE.Mesh | null = null;
  let pendingPick: { x: number; y: number } | null = null;

  const pathOf = (m: THREE.Mesh) => {
    const names: string[] = [];
    let o = m.parent;
    if (o && /^occurrence of/i.test((o.userData?.name as string) || '')) o = o.parent;
    while (o && o !== top) {
      if (o.children.length > 1) {
        const n = nameOf(o);
        if (n) names.unshift(n);
      }
      o = o.parent;
    }
    return names.join(' / ');
  };
  const showLabel = (m: THREE.Mesh | null) => {
    if (!m) {
      ui.label.hidden = true;
      return;
    }
    const part = m.parent && /^occurrence of/i.test((m.parent.userData?.name as string) || '') ? m.parent : m;
    ui.labelName.textContent = nameOf(part) || 'Part';
    ui.labelPath.textContent = pathOf(m);
    ui.label.hidden = false;
  };
  const paint = () => {
    for (const m of meshes) {
      const base = baseMat.get(m)!;
      const dim = selected && m !== selected;
      m.material = m === hovered || (m === selected && !hovered) ? hoverOf(base) : dim ? ghost : base;
      m.castShadow = !dim;
    }
    renderer.shadowMap.needsUpdate = true;
    showLabel(hovered || selected);
    dirty = true;
  };
  const pick = (x: number, y: number): THREE.Mesh | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return (hit?.object as THREE.Mesh) || null;
  };

  const canvas = renderer.domElement;
  let down: { x: number; y: number; time: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    pendingPick = { x: e.clientX, y: e.clientY };
  };
  const onLeave = () => {
    pendingPick = null;
    if (hovered) {
      hovered = null;
      paint();
    }
  };
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, time: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.time < 500;
    down = null;
    if (moved > 6 || !quick) return; // a drag, not a click
    const m = pick(e.clientX, e.clientY);
    selected = m && m !== selected ? m : null;
    if (e.pointerType !== 'mouse') hovered = null;
    paint();
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const onReset = () => {
    tween = null;
    selected = null;
    hovered = null;
    paint();
    frame();
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    follow = true;
    followCam();
    controls.update();
    dirty = true;
  };
  ui.reset.addEventListener('click', onReset);
  const onChange = () => (dirty = true);
  const onStart = () => (follow = false);
  controls.addEventListener('change', onChange);
  controls.addEventListener('start', onStart);

  // ---- Loop ------------------------------------------------------------
  let raf = 0;
  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) dirty = true;
  });
  io.observe(host);

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (tween) {
      const k = Math.min(1, (now - tween.start) / tween.dur);
      // Symmetric in-out: the parts leave and settle with the same weight.
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      t = tween.from + (tween.to - tween.from) * e;
      applyExplode();
      followCam();
      syncUI();
      if (k >= 1) tween = null;
    }
    controls.update();
    if (pendingPick) {
      const m = pick(pendingPick.x, pendingPick.y);
      pendingPick = null;
      if (m !== hovered) {
        hovered = m;
        canvas.style.cursor = m ? 'pointer' : '';
        paint();
      }
    }
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  syncUI();

  // ---- Teardown ---------------------------------------------------------
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    ui.slider.removeEventListener('input', onSlider);
    ui.toggle.removeEventListener('click', onToggle);
    ui.reset.removeEventListener('click', onReset);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    controls.removeEventListener('change', onChange);
    controls.removeEventListener('start', onStart);
    controls.dispose();
    geoms.forEach((g) => {
      (g as any).disposeBoundsTree();
      g.dispose();
    });
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
    tones.forEach((m) => m.dispose());
    hoverMats.forEach((m) => m.dispose());
    ghost.dispose();
    envTex.dispose();
    pmrem.dispose();
    key.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
