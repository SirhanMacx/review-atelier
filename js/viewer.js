/* =========================================================
   viewer.js — the 3D specimen viewer.

   Imperative three.js, kept entirely out of the render/DOM
   layer. Loads a GLB per unit on demand, normalises it into a
   fixed box so hotspot coordinates are model agnostic, and
   draws only when something actually changed.
   ========================================================= */
import * as THREE from '../assets/vendor/three.module.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';
import { GLTFLoader } from '../assets/vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../assets/vendor/meshopt_decoder.module.js';

const FIT = 3.8;                       // every model is scaled into this box
const HOME_CAM = { x: 0, y: 0.9, z: 8.2 };
const HOME_TARGET = { x: 0, y: 0.02, z: 0 };
const FOV = 34;
const DOT_PX = 30;                     // on-screen hotspot size, constant
const SURFACE_LIFT = 0.02;
const VIEW_LIFT = 0.30;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();               // url -> parsed scene, small LRU

/* ---------- little canvas textures ---------- */
function dotTexture(hex) {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d'), r = s / 2;
  const halo = g.createRadialGradient(r, r, 0, r, r, r);
  halo.addColorStop(0, hex + 'cc'); halo.addColorStop(0.55, hex + '33'); halo.addColorStop(1, hex + '00');
  g.fillStyle = halo; g.beginPath(); g.arc(r, r, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,251,244,.95)'; g.beginPath(); g.arc(r, r, s * 0.20, 0, 7); g.fill();
  g.fillStyle = hex; g.beginPath(); g.arc(r, r, s * 0.135, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function contactShadowTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d'), r = s / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(84,62,44,.42)');
  grad.addColorStop(0.55, 'rgba(84,62,44,.16)');
  grad.addColorStop(1, 'rgba(84,62,44,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

/* A warm key, cool fill gradient baked once and used as the environment. */
function environment(renderer) {
  const w = 16, h = 32, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = 255 * (0.55 + 0.45 * (1 - t));
    const g = 246 * (0.52 + 0.44 * (1 - t));
    const b = 232 * (0.60 + 0.30 * t);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose(); tex.dispose();
  return env;
}

export function createViewer(mount, opts = {}) {
  const accent = opts.accent || '#eb7c6b';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = false;      // a baked contact shadow reads the same, for free
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = environment(renderer);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(HOME_CAM.x, HOME_CAM.y, HOME_CAM.z);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 4.8;
  controls.maxDistance = 12;
  controls.target.set(HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.65;

  /* lights */
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x33252d, 0.72));
  const key = new THREE.DirectionalLight(0xfff3e7, 3.2); key.position.set(4.8, 6.5, 6.8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6ecff, 1.1); fill.position.set(-5.5, 2.0, 3.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffb7a5, 1.5); rim.position.set(-2.5, 3.0, -6.0); scene.add(rim);
  const glow = new THREE.PointLight(new THREE.Color(accent), 6, 18); glow.position.set(0, 1.2, 3.4); scene.add(glow);

  /* plinth + contact shadow */
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.48, 0.34, 56),
    new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.92, metalness: 0 })
  );
  plinth.position.y = -2.5; scene.add(plinth);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.62,
                                  depthWrite: false, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.33; scene.add(shadow);

  /* the model lives under a pivot so hotspots inherit its motion */
  const pivot = new THREE.Group();
  pivot.rotation.set(0.05, -0.28, 0);
  scene.add(pivot);

  const dots = [];                 // { sprite, anchor, data, opacity }
  const dotTex = dotTexture(accent);

  const state = {
    dirty: true, busyUntil: 0, raf: 0, dead: false,
    autoWanted: true, interactionUntil: 0, selected: null,
    w: 1, h: 1, token: 0, current: null
  };

  const markDirty = () => { state.dirty = true; };
  const busy = s => { state.busyUntil = performance.now() + s * 1000; };
  controls.addEventListener('start', () => { state.interactionUntil = performance.now() + 3000; markDirty(); });
  controls.addEventListener('change', markDirty);

  /* ---------- sizing ---------- */
  function resize() {
    const r = mount.getBoundingClientRect();
    const w = Math.max(240, r.width), h = Math.max(240, r.height || r.width);
    if (w === state.w && h === state.h) return;
    state.w = w; state.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    markDirty();
  }
  const ro = new ResizeObserver(resize); ro.observe(mount);

  /* ---------- model loading ---------- */
  function normalise(scene3) {
    const box = new THREE.Box3().setFromObject(scene3);
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const scale = FIT / Math.max(size.x, size.y, size.z, 0.001);
    scene3.scale.setScalar(scale);
    scene3.position.copy(center.multiplyScalar(-scale));
    scene3.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const m = o.material;
      if (m && m.isMeshStandardMaterial) {
        m.roughness = Math.min(0.62, Math.max(0.42, m.roughness ?? 0.5));
        m.metalness = 0;
        m.envMapIntensity = 0.32;
        if (m.emissive) m.emissive.setScalar(0);
      }
    });
    return scene3;
  }

  async function load(url) {
    const token = ++state.token;
    if (cache.has(url)) return cache.get(url).clone(true);
    const gltf = await loader.loadAsync(url);
    if (token !== state.token) return null;         // a later click already won
    const s = normalise(gltf.scene);
    if (cache.size > 3) cache.delete(cache.keys().next().value);
    cache.set(url, s);
    return s.clone(true);
  }

  /* ---------- hotspots ---------- */
  const tmp = new THREE.Vector3(), lift = new THREE.Vector3(), camLocal = new THREE.Vector3();

  function snapToSurface(model, p) {
    /* Authored points sit near the surface; pull them onto the real shell so a
       dot never floats or sinks. Nearest vertex alone snaps through to the far
       side, so candidates are filtered by direction first. */
    const target = new THREE.Vector3(...p);
    const dir = target.clone().normalize();
    const cones = [0.94, 0.82, 0.6, -1.1];
    let best = null, bestD = Infinity, bestN = null;
    for (const cone of cones) {
      model.traverse(o => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        const pos = o.geometry.attributes.position;
        const nrm = o.geometry.attributes.normal;
        for (let i = 0; i < pos.count; i += 1) {
          tmp.fromBufferAttribute(pos, i);
          o.localToWorld(tmp);
          model.worldToLocal(tmp);
          if (tmp.clone().normalize().dot(dir) < cone) continue;
          const d = tmp.distanceToSquared(target);
          if (d < bestD) {
            bestD = d; best = tmp.clone();
            bestN = nrm ? new THREE.Vector3().fromBufferAttribute(nrm, i) : tmp.clone().normalize();
          }
        }
      });
      if (best) break;
    }
    if (!best) return target;
    return best.add(bestN.normalize().multiplyScalar(SURFACE_LIFT));
  }

  function setHotspots(list, model) {
    dots.forEach(d => { pivot.remove(d.sprite); d.sprite.material.dispose(); });
    dots.length = 0;
    (list || []).forEach(h => {
      const mat = new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: true,
                                             depthWrite: false, sizeAttenuation: false, toneMapped: false });
      const sprite = new THREE.Sprite(mat);
      const anchor = model && h.position ? snapToSurface(model, h.position)
                                         : new THREE.Vector3(...(h.position || [0, 0, 1.9]));
      sprite.position.copy(anchor);
      pivot.add(sprite);
      dots.push({ sprite, anchor, data: h, opacity: 1 });
    });
    markDirty();
  }

  function updateDots(delta) {
    if (!dots.length) return;
    const px = 2 * (DOT_PX / state.h) * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    camLocal.copy(camera.position); pivot.worldToLocal(camLocal);
    for (const d of dots) {
      lift.copy(camLocal).sub(d.anchor);
      const span = lift.length();
      if (span > 1e-4) lift.multiplyScalar(VIEW_LIFT / span);
      d.sprite.position.copy(d.anchor).add(lift);

      const facing = d.anchor.clone().normalize().dot(lift.clone().normalize());
      const want = THREE.MathUtils.smoothstep(facing, -0.05, 0.30);
      d.opacity += (want - d.opacity) * (1 - Math.exp(-delta * 12));
      const on = state.selected === d.data.id;
      d.sprite.material.opacity = d.opacity;
      const scale = px * (on ? 1.32 : 1) * (0.74 + 0.26 * d.opacity);
      d.sprite.scale.set(scale, scale, 1);
    }
  }

  /* screen-space picking beats a mesh raycast here: the dots are billboards */
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = null, bd = 24 * 24;
    for (const d of dots) {
      if (d.opacity < 0.35) continue;
      tmp.copy(d.sprite.position); pivot.localToWorld(tmp); tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * state.w, y = (-tmp.y * 0.5 + 0.5) * state.h;
      const dist = (x - mx) ** 2 + (y - my) ** 2;
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 5) return;                      // that was a drag, not a click
    const hit = pick(e);
    state.selected = hit ? hit.data.id : null;
    markDirty();
    opts.onSelect?.(hit ? hit.data : null);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
  });

  /* ---------- loop ---------- */
  let last = performance.now();
  function tick() {
    if (state.dead) return;
    state.raf = requestAnimationFrame(tick);
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1); last = now;

    controls.autoRotate = state.autoWanted && !state.selected && now >= state.interactionUntil;
    if (controls.update(delta)) state.dirty = true;
    updateDots(delta);

    if (!state.dirty && now >= state.busyUntil) return;   // nothing changed, skip the draw
    state.dirty = false;
    resize();
    renderer.render(scene, camera);
  }
  resize(); tick();

  /* pause when off screen or the tab is hidden */
  const io = new IntersectionObserver(es => { state.visible = es[0].isIntersecting; }, { rootMargin: '120px' });
  io.observe(mount);

  return {
    async show(url, hotspots) {
      opts.onLoading?.(true);
      try {
        const model = await load(url);
        if (!model) return;
        if (state.current) { pivot.remove(state.current); }
        state.current = model;
        model.scale.multiplyScalar(0.72);
        pivot.add(model);
        setHotspots(hotspots, model);
        /* small ease-in so the specimen arrives rather than pops */
        const from = 0.72, to = 1, t0 = performance.now();
        busy(0.7);
        (function grow() {
          const k = Math.min(1, (performance.now() - t0) / 620);
          const e = 1 - Math.pow(1 - k, 3);
          model.scale.setScalar(from + (to - from) * e);
          markDirty();
          if (k < 1) requestAnimationFrame(grow);
        })();
      } catch (err) {
        opts.onError?.(err);
      } finally {
        opts.onLoading?.(false);
      }
    },
    select(id) { state.selected = id; markDirty(); },
    setAuto(v) { state.autoWanted = v; markDirty(); },
    get auto() { return state.autoWanted; },
    zoom(dir) {
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + dir * 1.2, 4.8, 12);
      markDirty(); busy(0.4);
    },
    reset() {
      state.selected = null;
      camera.position.set(HOME_CAM.x, HOME_CAM.y, HOME_CAM.z);
      controls.target.set(HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z);
      pivot.rotation.set(0.05, -0.28, 0);
      state.autoWanted = true;
      markDirty(); busy(0.5);
    },
    destroy() {
      state.dead = true; cancelAnimationFrame(state.raf);
      ro.disconnect(); io.disconnect();
      controls.dispose(); renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
