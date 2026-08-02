/* =========================================================
   art.js — all specimen artwork, generated as inline SVG.
   No external images, no network, themes via currentColor.
   ========================================================= */

/* deterministic hash -> pseudo-random stream, so a unit always draws the same */
export function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h |= 0;
    return (h >>> 0) / 4294967296;
  };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------------------------------------------------
   1. CONSTELLATION — the universal specimen.
   Topics become nodes on an organic orbit; size = term count.
   Returns { svg, nodes:[{id,x,y,r}] } with coords in % of box.
   --------------------------------------------------------- */
export function constellation(unit, opts = {}) {
  const W = 620, H = 440;
  const topics = unit.topics || [];
  const n = Math.max(topics.length, 1);
  const rand = rng(unit.id + '|' + (unit.title || ''));

  const cx = W / 2, cy = H / 2 + 4;
  const maxTerms = Math.max(1, ...topics.map(t => (t.vocab || []).length));

  const nodes = topics.map((t, i) => {
    // spiral-ish placement with jitter: readable, never overlapping badly
    const frac = n === 1 ? 0 : i / n;
    const ang = frac * Math.PI * 2 - Math.PI / 2 + (rand() - 0.5) * 0.34;
    const wob = 0.82 + rand() * 0.36;
    const rx = 178 * wob, ry = 132 * wob;
    const terms = (t.vocab || []).length;
    return {
      id: t.code, title: t.title, terms,
      x: n === 1 ? cx : cx + Math.cos(ang) * rx,
      y: n === 1 ? cy : cy + Math.sin(ang) * ry,
      r: 15 + (terms / maxTerms) * 15
    };
  });

  // connective tissue: sequence links + a few chords
  let links = '';
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const mx = (a.x + b.x) / 2 + (rand() - 0.5) * 44;
    const my = (a.y + b.y) / 2 + (rand() - 0.5) * 44;
    links += `<path d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"/>`;
  }
  if (nodes.length > 2) {
    const a = nodes[nodes.length - 1], b = nodes[0];
    links += `<path d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx} ${cy} ${b.x.toFixed(1)} ${b.y.toFixed(1)}" stroke-dasharray="4 6"/>`;
  }

  // faint background motes
  let motes = '';
  for (let i = 0; i < 46; i++) {
    motes += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(rand() * 1.5 + .4).toFixed(1)}"/>`;
  }

  const circles = nodes.map((nd, i) => `
    <g class="cnode" data-topic="${esc(nd.id)}" transform="translate(${nd.x.toFixed(1)},${nd.y.toFixed(1)})">
      <circle class="halo" r="${(nd.r + 9).toFixed(1)}"/>
      <circle class="disc" r="${nd.r.toFixed(1)}"/>
      <text class="num" y="4.5">${i + 1}</text>
    </g>`).join('');

  const svg = `
<svg viewBox="0 0 ${W} ${H}" class="constellation" role="img" aria-label="Topic map for ${esc(unit.title)}">
  <g class="motes">${motes}</g>
  <g class="links">${links}</g>
  ${circles}
</svg>`;

  return { svg, nodes: nodes.map(nd => ({ ...nd, xPct: nd.x / W * 100, yPct: nd.y / H * 100 })), W, H };
}

/* ---------------------------------------------------------
   2. BRAIN — lateral view, lobes are individually hittable.
   Used for AP Psych Unit 1 (Biological Bases).
   --------------------------------------------------------- */
export const BRAIN_PARTS = [
  { id: 'frontal', name: 'Frontal lobe',
    note: 'Planning, judgment, personality, speech production (Broca). The Phineas Gage lobe.',
    d: 'M260 90 C204 96 150 122 116 162 C90 194 88 214 100 224 C114 236 136 234 160 228 L236 182 C248 172 254 150 258 122 Z', tone: .16, cx: 175, cy: 165 },
  { id: 'parietal', name: 'Parietal lobe',
    note: 'Touch, temperature, pain, and body position. Home of the somatosensory cortex.',
    d: 'M260 90 C318 84 372 96 414 124 L356 198 C348 208 334 210 316 208 C292 206 262 196 236 182 Z', tone: .34, cx: 325, cy: 140 },
  { id: 'occipital', name: 'Occipital lobe',
    note: 'Vision. Damage here can blind you even with perfectly healthy eyes.',
    d: 'M414 124 C444 152 460 182 460 212 C460 240 446 262 420 272 C396 280 372 268 358 246 C348 230 350 214 356 198 Z', tone: .52, cx: 412, cy: 205 },
  { id: 'temporal', name: 'Temporal lobe',
    note: 'Hearing and language comprehension (Wernicke). Wraps the hippocampus.',
    d: 'M152 236 C176 214 212 202 250 202 C296 202 334 216 348 240 C360 262 350 288 322 302 C288 318 236 316 200 300 C166 286 142 258 152 236 Z', tone: .42, cx: 248, cy: 258 },
  { id: 'cerebellum', name: 'Cerebellum',
    note: 'Balance, coordination, and procedural (muscle-memory) learning.',
    d: 'M366 244 C412 250 446 276 452 308 C458 342 432 366 394 370 C358 374 332 358 326 330 C320 300 334 262 366 244 Z', tone: .62, cx: 392, cy: 306 },
  { id: 'brainstem', name: 'Brainstem',
    note: 'Breathing, heartbeat, arousal. The parts you never have to think about.',
    d: 'M296 236 C320 248 334 274 336 306 C338 342 330 374 318 398 C312 410 298 411 291 401 C283 388 284 348 286 310 C288 278 288 252 296 236 Z', tone: .78, cx: 312, cy: 340 }
];

const SULCI = [
  'M146 154 C176 138 208 134 232 142', 'M128 186 C160 168 194 162 220 168',
  'M282 106 C312 106 344 116 366 132', 'M270 140 C302 142 334 152 356 168',
  'M396 152 C418 172 428 196 426 218', 'M186 246 C216 236 254 236 284 246',
  'M192 272 C224 262 262 262 292 272', 'M370 268 C396 274 416 290 422 310',
  'M356 292 C382 298 402 314 408 334'
];

export function brain() {
  const W = 560, H = 440;
  // paint back-to-front so the cerebrum overlaps the stem
  const order = ['brainstem', 'cerebellum', 'occipital', 'parietal', 'frontal', 'temporal'];
  const parts = order.map(id => BRAIN_PARTS.find(p => p.id === id));
  const shapes = parts.map(p =>
    `<path class="lobe" data-part="${p.id}" style="--tone:${p.tone}" d="${p.d}"><title>${esc(p.name)}</title></path>`
  ).join('');
  const sulci = SULCI.map(d => `<path d="${d}"/>`).join('');
  const svg = `
<svg viewBox="0 0 ${W} ${H}" class="brain" role="img" aria-label="Lateral view of the human brain">
  <g class="lobes">${shapes}</g>
  <g class="sulci">${sulci}</g>
</svg>`;
  return {
    svg, W, H,
    nodes: BRAIN_PARTS.map(p => ({ id: p.id, title: p.name, note: p.note, xPct: p.cx / W * 100, yPct: p.cy / H * 100 }))
  };
}

/* ---------------------------------------------------------
   3. WORLD MAP — Natural Earth 110m land (public domain),
   equirectangular, viewBox 0 0 1000 500. Path injected at build.
   --------------------------------------------------------- */
import { LAND_PATH } from '../assets/land.js';

export const project = (lon, lat) => [(lon + 180) / 360 * 1000, (90 - lat) / 180 * 500];

export function worldMap(pins = [], opts = {}) {
  const W = 1000, H = 500;
  // graticule
  let grat = '';
  for (let lon = -150; lon <= 150; lon += 30) { const [x] = project(lon, 0); grat += `<path d="M${x} 0V${H}"/>`; }
  for (let lat = -60; lat <= 60; lat += 30) { const [, y] = project(0, lat); grat += `<path d="M0 ${y}H${W}"/>`; }
  const [, eq] = project(0, 0);

  const marks = pins.map((p, i) => {
    const [x, y] = project(p.lon, p.lat);
    return `<g class="pin" data-topic="${esc(p.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <circle class="halo" r="17"/><circle class="disc" r="9"/>
      <text class="num" y="3.5">${i + 1}</text></g>`;
  }).join('');

  const svg = `
<svg viewBox="0 0 ${W} ${H}" class="worldmap" role="img" aria-label="${esc(opts.label || 'World map')}">
  <rect class="ocean" width="${W}" height="${H}" rx="10"/>
  <g class="graticule">${grat}</g>
  <path class="equator" d="M0 ${eq}H${W}"/>
  <path class="land" d="${LAND_PATH}"/>
  ${marks}
</svg>`;
  return { svg, W, H, nodes: pins.map(p => { const [x, y] = project(p.lon, p.lat); return { ...p, xPct: x / W * 100, yPct: y / H * 100 }; }) };
}

/* ---------------------------------------------------------
   4. EMBLEMS — small generative marks for rail chips + cards.
   --------------------------------------------------------- */
export function emblem(seed, kind = 'auto') {
  const rand = rng(seed);
  const S = 48;
  const pick = kind === 'auto' ? ['rings', 'arc', 'grid', 'wave', 'burst'][Math.floor(rand() * 5)] : kind;
  let body = '';
  if (pick === 'rings') {
    for (let i = 0; i < 3; i++) body += `<circle cx="${(18 + rand() * 12).toFixed(0)}" cy="${(18 + rand() * 12).toFixed(0)}" r="${(6 + i * 5).toFixed(0)}" fill="none"/>`;
  } else if (pick === 'arc') {
    for (let i = 0; i < 4; i++) { const r = 8 + i * 6; body += `<path fill="none" d="M${24 - r} 30 A${r} ${r} 0 0 1 ${24 + r} 30"/>`; }
  } else if (pick === 'grid') {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      if (rand() > .34) body += `<rect x="${10 + i * 8}" y="${10 + j * 8}" width="5.5" height="5.5" rx="1.4" stroke="none"/>`;
  } else if (pick === 'wave') {
    for (let i = 0; i < 3; i++) body += `<path fill="none" d="M6 ${16 + i * 8} Q15 ${8 + i * 8} 24 ${16 + i * 8} T42 ${16 + i * 8}"/>`;
  } else {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; body += `<path d="M24 24 L${(24 + Math.cos(a) * 16).toFixed(1)} ${(24 + Math.sin(a) * 16).toFixed(1)}"/>`; }
    body += '<circle cx="24" cy="24" r="4" stroke="none"/>';
  }
  return `<svg viewBox="0 0 ${S} ${S}" class="emblem"><g stroke="currentColor" stroke-width="1.7" fill="currentColor" stroke-linecap="round">${body}</g></svg>`;
}

/* Course card art: layered strata, seeded per course */
export function courseArt(seed) {
  const rand = rng(seed);
  const W = 400, H = 225;
  let bands = '';
  for (let i = 0; i < 6; i++) {
    const y = 40 + i * 30 + rand() * 12;
    const c1 = 90 + rand() * 80, c2 = 240 + rand() * 90;
    bands += `<path style="--i:${i}" d="M-10 ${y.toFixed(0)} C${c1.toFixed(0)} ${(y - 26 - rand() * 18).toFixed(0)} ${c2.toFixed(0)} ${(y + 22 + rand() * 16).toFixed(0)} ${W + 10} ${(y - 10).toFixed(0)}"/>`;
  }
  let dots = '';
  for (let i = 0; i < 16; i++) dots += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(rand() * 2.2 + .8).toFixed(1)}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="cart" preserveAspectRatio="none">
    <g class="bands" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">${bands}</g>
    <g class="dots" fill="currentColor">${dots}</g></svg>`;
}
