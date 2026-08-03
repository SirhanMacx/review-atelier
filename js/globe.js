/* =========================================================
   globe.js — an actual rotating 3D globe on canvas.
   Orthographic projection of real coastline geometry, shaded
   like a lit sphere, with drag-to-rotate and auto-rotate.
   No libraries, no textures, no network.
   ========================================================= */
import { LAND_RINGS } from '../assets/land-geo.js';

const RAD = Math.PI / 180;

/* lon/lat -> unit sphere, with the globe yawed by `rot` and tilted by `tilt` */
function toSphere(lon, lat, rot, tilt) {
  const p = (lon + rot) * RAD, q = lat * RAD;
  const cq = Math.cos(q);
  let x = cq * Math.sin(p);
  let y = Math.sin(q);
  let z = cq * Math.cos(p);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const y2 = y * ct - z * st;
  const z2 = y * st + z * ct;
  return [x, y2, z2];              // z2 > 0 is the near hemisphere
}

export function createGlobe(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const state = {
    rot: opts.rot ?? 20,
    tilt: (opts.tilt ?? -14) * RAD,
    auto: opts.auto !== false,
    speed: opts.speed ?? 0.11,
    rot0: opts.rot ?? 20,
    tilt0: (opts.tilt ?? -14) * RAD,
    markers: opts.markers || [],
    hover: -1,
    dragging: false,
    lastX: 0, lastY: 0,
    raf: 0, dead: false
  };

  const css = v => getComputedStyle(canvas).getPropertyValue(v).trim();

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(200, r.width), h = Math.max(200, r.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, cx: w / 2, cy: h / 2, R: Math.min(w, h) * 0.42 };
  }

  function project(lon, lat, g) {
    const [x, y, z] = toSphere(lon, lat, state.rot, state.tilt);
    return { x: g.cx + x * g.R, y: g.cy - y * g.R, z, front: z > 0 };
  }

  function draw() {
    const g = size();
    const { w, h, cx, cy, R } = g;
    ctx.clearRect(0, 0, w, h);

    const ocean = css('--globe-ocean') || '#dfe7ea';
    const land  = css('--globe-land')  || '#8fa596';
    const line  = css('--globe-line')  || '#ffffff';
    const glow  = css('--globe-glow')  || 'rgba(120,150,190,.35)';

    // atmosphere
    const atmo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.16);
    atmo.addColorStop(0, glow);
    atmo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = atmo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, 7); ctx.fill();

    // ocean sphere, lit from the upper left
    const sea = ctx.createRadialGradient(cx - R * .34, cy - R * .38, R * .05, cx, cy, R);
    sea.addColorStop(0, shade(ocean, 1.08));
    sea.addColorStop(0.58, ocean);
    sea.addColorStop(1, shade(ocean, 0.66));
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    ctx.fillStyle = sea; ctx.fillRect(0, 0, w, h);

    // graticule
    ctx.strokeStyle = line; ctx.globalAlpha = .18; ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath(); let on = false;
      for (let lat = -90; lat <= 90; lat += 4) {
        const p = project(lon, lat, g);
        if (!p.front) { on = false; continue; }
        on ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), on = true);
      }
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); let on = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = project(lon, lat, g);
        if (!p.front) { on = false; continue; }
        on ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), on = true);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // land
    ctx.fillStyle = land;
    ctx.strokeStyle = shade(land, .78);
    ctx.lineWidth = .7;
    for (const ring of LAND_RINGS) {
      let run = [];
      const flush = () => {
        if (run.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(run[0].x, run[0].y);
          for (let k = 1; k < run.length; k++) ctx.lineTo(run[k].x, run[k].y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        run = [];
      };
      for (let i = 0; i < ring.length; i += 2) {
        const p = project(ring[i], ring[i + 1], g);
        if (!p.front) { flush(); continue; }
        run.push(p);
      }
      flush();
    }

    // terminator: darken the limb so it reads as a ball, not a disc
    const term = ctx.createRadialGradient(cx - R * .3, cy - R * .34, R * .1, cx, cy, R * 1.02);
    term.addColorStop(0, 'rgba(255,255,255,0.04)');
    term.addColorStop(0.5, 'rgba(0,0,0,0)');
    term.addColorStop(1, 'rgba(20,16,12,0.38)');
    ctx.fillStyle = term; ctx.fillRect(0, 0, w, h);

    // specular highlight
    const spec = ctx.createRadialGradient(cx - R * .46, cy - R * .5, 0, cx - R * .46, cy - R * .5, R * .40);
    spec.addColorStop(0, 'rgba(255,255,255,0.16)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec; ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // rim light
    ctx.strokeStyle = glow; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

    // markers, near hemisphere only
    const accent = css('--globe-accent') || '#a8433f';
    state.markers.forEach((m, i) => {
      const p = project(m.lon, m.lat, g);
      m._x = p.x; m._y = p.y; m._front = p.front;
      if (!p.front) return;
      const fade = Math.min(1, p.z * 3.2);          // fade in as it comes over the limb
      const active = i === state.hover || m.active;
      const r = active ? 7.5 : 5.5;
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, 7);
      ctx.fillStyle = hexA(accent, .18); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fillStyle = accent; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,251,244,.95)'; ctx.stroke();
      if (active) {
        ctx.font = '500 13px "Cormorant Garamond", Georgia, serif';
        const label = m.title || '';
        const tw = ctx.measureText(label).width;
        const bx = p.x - tw / 2 - 8, by = p.y - r - 30;
        ctx.fillStyle = 'rgba(255,251,244,.97)';
        roundRect(ctx, bx, by, tw + 16, 23, 7); ctx.fill();
        ctx.fillStyle = '#2f2a27';
        ctx.fillText(label, p.x - tw / 2, by + 15.5);
      }
      ctx.globalAlpha = 1;
    });
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function tick() {
    if (state.dead) return;
    if (state.auto && !state.dragging) state.rot += state.speed;
    draw();
    state.raf = requestAnimationFrame(tick);
  }

  /* ---- interaction ---- */
  function hit(ev) {
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = -1, bd = 18 * 18;
    state.markers.forEach((m, i) => {
      if (!m._front) return;
      const d = (m._x - mx) ** 2 + (m._y - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  const onDown = e => { state.dragging = true; state.lastX = e.clientX; state.lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = e => {
    if (state.dragging) {
      state.rot += (e.clientX - state.lastX) * 0.42;
      state.tilt = Math.max(-1.1, Math.min(1.1, state.tilt + (e.clientY - state.lastY) * 0.006));
      state.lastX = e.clientX; state.lastY = e.clientY;
      return;
    }
    const h = hit(e);
    if (h !== state.hover) { state.hover = h; canvas.style.cursor = h >= 0 ? 'pointer' : 'grab'; }
  };
  const onUp = e => {
    if (state.dragging && Math.abs(e.clientX - state.lastX) < 3) { /* treat as click */ }
    state.dragging = false;
  };
  const onClick = e => { const h = hit(e); if (h >= 0 && opts.onPick) opts.onPick(state.markers[h], h); };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('pointerleave', () => { state.hover = -1; });

  tick();

  return {
    setMarkers(m) { state.markers = m; },
    setAuto(v) { state.auto = v; },
    reset() { state.rot = state.rot0; state.tilt = state.tilt0; state.auto = true; },
    get auto() { return state.auto; },
    spinTo(lon, lat) {                       // ease the globe to face a place
      const target = -lon;
      const step = () => {
        let d = ((target - state.rot + 540) % 360) - 180;
        if (Math.abs(d) < 0.6) return;
        state.rot += d * 0.12;
        requestAnimationFrame(step);
      };
      step();
    },
    destroy() {
      state.dead = true; cancelAnimationFrame(state.raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      canvas.removeEventListener('click', onClick);
    }
  };
}

/* ---- tiny color helpers ---- */
function parse(c) {
  c = c.trim();
  if (c.startsWith('#')) {
    const s = c.length === 4
      ? c.slice(1).split('').map(x => parseInt(x + x, 16))
      : [c.slice(1, 3), c.slice(3, 5), c.slice(5, 7)].map(x => parseInt(x, 16));
    return s;
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [140, 150, 160];
}
function shade(c, k) {
  const [r, g, b] = parse(c);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function hexA(c, a) {
  const [r, g, b] = parse(c);
  return `rgba(${r},${g},${b},${a})`;
}
