/* =========================================================
   app.js — the Review Atelier.
   Review only: term banks, specimens, flashcards, search.
   No quizzes, no answer keys.
   ========================================================= */
import { constellation, emblem, rng } from './art.js';
import { createGlobe } from './globe.js';
import { createViewer } from './viewer.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Real 3D specimens, one GLB per unit, loaded on demand.
   Made locally from the specimen renders with img2glb (TripoSR). */
const ASSET_V = '4';        // bump when the GLBs are regenerated, to beat caches
const MODELS = {
  'psych:0': 'balance.glb', 'psych:1': 'brain.glb',   'psych:2': 'prism.glb',
  'psych:3': 'nesting.glb', 'psych:4': 'busts.glb',   'psych:5': 'glasshead.glb',
  'psych:6': 'jars.glb'
};

/* Hotspots live in model space. Every model is normalised into the same box,
   so these are portable, and the viewer snaps each one onto the real surface. */
const HOTSPOTS = {
  'psych:1': [
    { id: 'frontal',    title: 'Frontal lobe',   position: [-1.30,  0.45,  0.85],
      note: 'Planning, judgment, personality, and speech production (Broca). The Phineas Gage lobe.' },
    { id: 'parietal',   title: 'Parietal lobe',  position: [ 0.10,  1.30,  0.30],
      note: 'Touch, temperature, pain, and body position. Home of the somatosensory cortex.' },
    { id: 'occipital',  title: 'Occipital lobe', position: [ 1.35,  0.35,  0.10],
      note: 'Vision. Damage here can blind you even with perfectly healthy eyes.' },
    { id: 'temporal',   title: 'Temporal lobe',  position: [-0.35, -0.65,  1.10],
      note: 'Hearing and language comprehension (Wernicke). Wraps around the hippocampus.' },
    { id: 'cerebellum', title: 'Cerebellum',     position: [ 1.05, -0.95,  0.35],
      note: 'Balance, coordination, and procedural (muscle memory) learning.' },
    { id: 'brainstem',  title: 'Brainstem',      position: [ 0.25, -1.35,  0.45],
      note: 'Breathing, heartbeat, and arousal. The parts you never have to think about.' }
  ]
};

/* Where each unit's history sits, as a starting view for the globe. */
const PLACES = {
  'global:00': [15, 25], 'global:01': [36, 4],  'global:02': [44, 32], 'global:03': [78, 24],
  'global:04': [20, 40], 'global:05': [60, 22], 'global:06': [30, 45], 'global:07': [8, 44],
  'global:08': [-40, 12],'global:09': [0, 30],
  'enl:Intro': [0, 20],  'enl:1': [0, 10],      'enl:2': [34, 6],      'enl:3': [44, 32],
  'enl:EI': [20, 20],    'enl:4': [22, 39],     'enl:5': [12, 48],     'enl:6': [11, 43],
  'enl:7': [-60, 10],    'enl:8': [5, 30]
};

/* Pins belong where the history happened, so match the name before falling back. */
const GEO = [
  [/mesopotam|sumer|babylon|hammurabi|fertile crescent|tigris|euphrates/i, 44, 32],
  [/egypt|nile|pyramid|pharaoh|hieroglyph/i, 31, 27],
  [/indus|harappa|mohenjo|india|maurya|gupta|ashoka|hindu|buddh|delhi|sikh/i, 78, 24],
  [/china|shang|qin|han|tang|song|confuc|dao|legalism|zheng he|ming|silk road/i, 112, 34],
  [/greece|greek|athens|sparta|polis|alexander|hellenis/i, 23, 38],
  [/rome|roman|caesar|augustus|republic|patrician|plebeian|twelve tables/i, 12, 42],
  [/japan|samurai|shogun/i, 138, 36],
  [/byzant|justinian|constantinople|orthodox/i, 29, 41],
  [/islam|caliph|muhammad|sunni|shia|mecca|arabia/i, 40, 24],
  [/mongol|genghis|khan|steppe/i, 100, 47],
  [/africa|ghana|mali|mansa musa|songhai|trans.?saharan|timbuktu/i, -4, 15],
  [/maya|aztec|tenochtitlan|mesoamerica|inca|andes|olmec/i, -92, 17],
  [/renaissance|medici|florence|italian|humanism/i, 11, 43],
  [/reformation|luther|calvin|protestant|counter.?reform|trent/i, 11, 51],
  [/scientific revolution|copernicus|galileo|newton/i, 14, 50],
  [/crusade|jerusalem|holy land/i, 35, 32],
  [/black death|plague|middle ages|feudal|manorial|medieval|dark ages/i, 5, 48],
  [/ottoman|turk|istanbul/i, 32, 39],
  [/indian ocean|monsoon|swahili|port city/i, 62, 2],
  [/columbus|exploration|atlantic|portug|magellan|da gama|conquest|columbian/i, -32, 22],
  [/paleolithic|neolithic|human origin|out of africa|hunter|forager|catalhoyuk/i, 33, 8],
  [/slave trade|middle passage/i, -22, 5],
  [/russia|moscow/i, 40, 56],
  [/geography|map|continent|hemisphere|equator/i, 0, 8]
];
const geo = (name, home) => {
  for (const [re, lon, lat] of GEO) if (re.test(name || '')) return { lon, lat, exact: true };
  return { lon: home[0], lat: home[1], exact: false };
};

const state = {
  course: null, unitIdx: 0, topicIdx: 0, lessonIdx: null,
  view: 'overview', cardIdx: 0, flipped: false, lang: null, part: null
};
let GLOBE = null, VIEWER = null;

const unit  = () => state.course.units[state.unitIdx] || { topics: [] };
const topic = () => unit().topics[state.topicIdx] || { vocab: [], lessons: [] };

/* A unit lumped into one topic makes a lonely map, so fan it out per lesson. */
function nodesFor(u) {
  const t = u.topics || [];
  if (t.length >= 3 || !t[0]) return t.map((x, i) => ({ title: x.title || `Topic ${i + 1}`, topicIdx: i }));
  return (t[0].lessons || []).map((l, i) => ({ title: l.title, topicIdx: 0, lessonIdx: i }));
}

/* ============================ LANDING ============================ */
async function renderHome() {
  const files = ['psych', 'global', 'enl'];
  const loaded = await Promise.all(files.map(async id => {
    try { const r = await fetch(`data/${id}.json`); return r.ok ? await r.json() : null; } catch { return null; }
  }));

  $('#courseGrid').innerHTML = loaded.filter(Boolean).map(c => {
    const terms = c.units.reduce((a, u) => a + (u.counts?.terms || 0), 0);
    const lessons = c.units.reduce((a, u) => a + (u.counts?.lessons || 0), 0);
    const art = c.specimen === 'brain'
      ? `<img class="cardphoto" src="assets/img/brain.png" alt="">`
      : `<canvas class="cardglobe"></canvas>`;
    return `
      <a class="course-card" href="course.html?c=${esc(c.id)}" data-accent="${esc(c.accent)}">
        <div class="art">${art}</div>
        <div class="body">
          <span class="label">${esc(c.subtitle)}</span>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.note || '')}</p>
          <div class="nums"><span>${c.units.length} units</span><span>${lessons} lessons</span><span>${terms} key terms</span></div>
        </div>
      </a>`;
  }).join('');

  $$('canvas.cardglobe').forEach((cv, i) => createGlobe(cv, { markers: [], rot: 40 + i * 110, tilt: -12, speed: 0.06 }));
}

/* ============================ COURSE ============================ */
async function renderCourse() {
  const id = new URLSearchParams(location.search).get('c') || 'psych';
  let data;
  try {
    const r = await fetch(`data/${id}.json`);
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch {
    $('#workspace').innerHTML = `<div class="panel pad"><h2>Course not found</h2>
      <p class="lede">Could not load <code>data/${esc(id)}.json</code>.</p>
      <a class="btn" href="index.html">Back to all courses</a></div>`;
    return;
  }
  state.course = data;
  document.body.dataset.course = data.accent || id;
  document.title = `${data.title} — Review Atelier`;
  if (data.multilingual && data.languages?.length) state.lang = data.languages[0].code;

  restoreHash();
  buildRail();
  render();
  buildIndex();
}

/* ---------- rail ---------- */
function buildRail() {
  const c = state.course;
  $('#rail').innerHTML = `
    <div class="rail-head"><span class="label">${esc(c.title)}</span></div>
    <ul class="unit-list" role="tablist">
      ${c.units.map((u, i) => `
        <li><button class="unit-item" role="tab" data-unit="${i}" aria-selected="${i === state.unitIdx}">
          <span class="unit-chip">${emblem(c.id + u.id + u.title)}</span>
          <span><span class="unit-name">${esc(u.title)}</span>
          <span class="unit-sub">${esc(u.weight || `${u.counts?.terms || 0} terms`)}</span></span>
        </button></li>`).join('')}
    </ul>`;
  $$('#rail .unit-item').forEach(b => b.addEventListener('click', () => {
    state.unitIdx = +b.dataset.unit; state.topicIdx = 0; state.lessonIdx = null;
    state.cardIdx = 0; state.view = 'overview'; state.part = null;
    buildRail(); render(); syncHash();
  }));
}

/* ---------- stage ---------- */
function buildStage() {
  const c = state.course, u = unit();
  if (GLOBE) { GLOBE.destroy(); GLOBE = null; }
  if (VIEWER) { VIEWER.destroy(); VIEWER = null; }
  const nodes = nodesFor(u);
  const model = MODELS[`${c.id}:${u.id}`];

  const seg = `
    <div class="seg">
      <button data-view="overview" aria-pressed="${state.view === 'overview'}">Overview</button>
      <button data-view="terms" aria-pressed="${state.view === 'terms'}">Key terms</button>
      <button data-view="cards" aria-pressed="${state.view === 'cards'}">Flashcards</button>
    </div>`;

  if (c.specimen === 'map') return globeStage(c, u, nodes, seg);

  if (model) return modelStage(c, u, model, seg);

  let art, marks, caption;
  {
    const synth = { id: c.id + u.id, title: u.title,
      topics: nodes.map(nd => ({ title: nd.title, vocab: u.topics[nd.topicIdx]?.vocab || [] })) };
    const k = constellation(synth);
    art = k.svg;
    marks = k.nodes.map((nd, i) => ({ ...nd, title: nodes[i]?.title, node: i }));
    caption = 'Topic map · click a dot to open it';
  }

  const dots = marks.map((nd, i) => `
    <button class="hotspot" style="left:${nd.xPct.toFixed(2)}%;top:${nd.yPct.toFixed(2)}%"
      data-i="${i}" aria-pressed="${nd.node != null
        ? (nodes[i]?.topicIdx === state.topicIdx && (nodes[i]?.lessonIdx == null || nodes[i]?.lessonIdx === state.lessonIdx))
        : state.part === nd.title}"
      aria-label="${esc(nd.title || '')}" title="${esc(nd.title || '')}"></button>`).join('');

  $('#stage').innerHTML = `
    <div class="stage-art">
      <div class="artbox">${art}${dots}</div>
      ${marks.length ? `<div class="tip"><b>Tip</b>Click a dot to learn more</div>` : ''}
    </div>
    <div class="stage-foot">
      <span class="stage-caption">${esc(caption)}</span>
      ${seg}
    </div>`;

  $$('#stage .hotspot').forEach(b => b.addEventListener('click', () => {
    const nd = marks[+b.dataset.i];
    if (nd.node != null) {
      const n = nodes[nd.node];
      state.topicIdx = n.topicIdx; state.lessonIdx = n.lessonIdx ?? null; state.part = null;
      state.cardIdx = 0; state.view = 'overview';
    } else {
      state.part = nd.title;
    }
    render(); syncHash();
  }));
  bindSeg();
}

/* A real specimen: orbit it, or click a marker on its surface. */
function modelStage(c, u, file, seg) {
  const pins = HOTSPOTS[`${c.id}:${u.id}`] || [];
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#8d6bcc';

  $('#stage').innerHTML = `
    <div class="stage-art">
      <div class="viewbox" id="viewbox"></div>
      <div class="tools">
        <button class="tool" id="tSpin" aria-pressed="true"><span class="g">↻</span><span class="t">Rotate</span></button>
        <button class="tool" id="tIn"><span class="g">+</span><span class="t">Closer</span></button>
        <button class="tool" id="tOut"><span class="g">&minus;</span><span class="t">Back</span></button>
        <button class="tool" id="tReset"><span class="g">⟲</span><span class="t">Reset</span></button>
      </div>
      <div class="tip"><b>Tip</b>Drag to rotate<br>Scroll to zoom${pins.length ? '<br>Click a dot to learn more' : ''}</div>
    </div>
    <div class="stage-foot">
      <span class="stage-caption">3D specimen${pins.length ? ' · click a dot to explore' : ''}</span>
      ${seg}
    </div>`;

  VIEWER = createViewer($('#viewbox'), {
    accent,
    onSelect(hit) { state.part = hit ? hit.id : null; buildDetail(); }
  });
  VIEWER.show(`assets/models/${file}?v=${ASSET_V}`, pins);

  $('#tSpin').addEventListener('click', e => {
    const on = !VIEWER.auto; VIEWER.setAuto(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });
  $('#tIn').addEventListener('click', () => VIEWER.zoom(-1));
  $('#tOut').addEventListener('click', () => VIEWER.zoom(1));
  $('#tReset').addEventListener('click', () => VIEWER.reset());
  bindSeg();
}

function globeStage(c, u, nodes, seg) {
  const home = PLACES[`${c.id}:${u.id}`] || [0, 20];
  const rand = rng(c.id + u.id);
  const markers = nodes.map((nd, i) => {
    const g = geo(nd.title, home);
    const spread = g.exact ? 5 : 30;
    return {
      idx: i, title: nd.title,
      lon: g.lon + (rand() - .5) * spread,
      lat: Math.max(-60, Math.min(75, g.lat + (rand() - .5) * spread * 0.7)),
      active: nd.topicIdx === state.topicIdx && (nd.lessonIdx == null || nd.lessonIdx === state.lessonIdx)
    };
  });

  $('#stage').innerHTML = `
    <div class="stage-art">
      <canvas id="globeCanvas" class="globe" aria-label="Globe showing where ${esc(u.title)} happened"></canvas>
      <div class="tools">
        <button class="tool" id="tSpin" aria-pressed="true"><span class="g">↻</span><span class="t">Rotate</span></button>
        <button class="tool" id="tHome"><span class="g">⌂</span><span class="t">Center</span></button>
        <button class="tool" id="tReset"><span class="g">⟲</span><span class="t">Reset</span></button>
      </div>
      <div class="tip"><b>Tip</b>Drag to rotate<br>Click a dot to learn more</div>
    </div>
    <div class="stage-foot">
      <span class="stage-caption">3D globe · drag to rotate</span>
      ${seg}
    </div>`;

  GLOBE = createGlobe($('#globeCanvas'), {
    markers,
    onPick(m) {
      const nd = nodes[m.idx];
      state.topicIdx = nd.topicIdx; state.lessonIdx = nd.lessonIdx ?? null;
      state.cardIdx = 0; state.view = 'overview';
      render(); syncHash();
    }
  });
  const active = markers.find(m => m.active) || markers[0];
  if (active) GLOBE.spinTo(active.lon, active.lat);

  $('#tSpin').addEventListener('click', e => {
    const on = !GLOBE.auto; GLOBE.setAuto(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });
  $('#tHome').addEventListener('click', () => { if (active) GLOBE.spinTo(active.lon, active.lat); });
  $('#tReset').addEventListener('click', () => GLOBE.reset());
  bindSeg();
}

function bindSeg() {
  $$('#stage .seg button').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; state.cardIdx = 0; state.flipped = false; state.part = null;
    render(); syncHash();
  }));
}

/* ---------- detail ---------- */
function buildDetail() {
  if (state.part) return partPanel();
  if (state.view === 'terms') return termsPanel();
  if (state.view === 'cards') return cardsPanel();

  const u = unit(), t = topic();
  const all = t.lessons || [];
  const lessons = (state.lessonIdx != null && all[state.lessonIdx]) ? [all[state.lessonIdx]] : all;
  const heading = (lessons.length === 1 && state.lessonIdx != null) ? lessons[0].title : (t.title || u.title);
  const src = lessons.map(l => l.source).find(Boolean);
  const people = (state.course.researchers || []).filter(p => p.unit === u.id).slice(0, 6);
  const eq = lessons.flatMap(l => l.essentialQuestions || [])[0];
  const obj = lessons.flatMap(l => l.objectives || [])[0];
  const mis = (t.misconceptions || [])[0];
  const overview = lessons.map(l => l.overview).filter(Boolean)[0] || '';

  const facts = [
    ['◇', 'Unit', u.title],
    u.weight ? ['⌁', 'Weighting', u.weight] : null,
    ['❋', 'Lessons', String(lessons.length)],
    ['◈', 'Key terms', String((t.vocab || []).length)]
  ].filter(Boolean);

  $('#detail').innerHTML = `
    <div class="pad">
      <span class="kicker">${esc(u.title)}</span>
      <h2>${esc(heading)}</h2>
      ${u.blurb ? `<div class="sub">${esc(u.blurb)}</div>` : ''}
      ${overview ? `<p class="lede">${esc(overview)}</p>` : ''}

      <div class="sec">
        <span class="label">Key facts</span>
        <div class="facts">${facts.map(([g, k, v]) =>
          `<div class="fact"><span class="g">${g}</span><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      </div>

      ${eq ? `<div class="soft"><span class="g">?</span><div><b>Be able to answer</b><p>${esc(eq)}</p></div></div>` : ''}
      ${obj ? `<div class="soft"><span class="g">✦</span><div><b>You should be able to</b><p>${esc(obj)}</p></div></div>` : ''}
      ${mis ? `<div class="soft"><span class="g">!</span><div><b>Common mix-up</b><p>${esc(mis)}</p></div></div>` : ''}
      ${src ? `<div class="soft"><span class="g">❞</span><div><b>Primary source</b><p>${esc(src.title)}${
        [src.author, src.year].filter(Boolean).length ? ', ' + [src.author, src.year].filter(Boolean).map(esc).join(', ') : ''}</p></div></div>` : ''}

      <div class="sec">
        <button class="act" data-go="terms"><span class="g">◈</span>
          <span><span class="t">Key terms</span><span class="s">${(t.vocab || []).length} to review</span></span></button>
        <button class="act" data-go="cards"><span class="g">⇄</span>
          <span><span class="t">Flashcards</span><span class="s">Flip through this topic</span></span></button>
      </div>

      ${u.topics.length > 1 ? `<div class="sec"><span class="label">Topics in this unit</span>
        <div class="topics">${u.topics.map((x, i) =>
          `<button class="topic-row" data-topic="${i}" aria-pressed="${i === state.topicIdx}">
            <span class="n">${i + 1}</span><span class="t">${esc(x.title || x.code || `Topic ${i + 1}`)}</span>
          </button>`).join('')}</div></div>` : ''}

      ${people.length ? `<div class="sec"><span class="label">Researchers to know</span>
        <div class="terms">${people.map(p =>
          `<div class="term"><dt>${esc(p.who)}</dt><dd>${esc(p.what)}</dd></div>`).join('')}</div></div>` : ''}
    </div>`;

  $$('#detail [data-go]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.go; state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
  $$('#detail .topic-row').forEach(b => b.addEventListener('click', () => {
    state.topicIdx = +b.dataset.topic; state.lessonIdx = null; state.cardIdx = 0;
    render(); syncHash();
  }));
}

function partPanel() {
  const u = unit();
  const list = HOTSPOTS[`${state.course.id}:${u.id}`] || [];
  const p = list.find(x => x.id === state.part);
  if (!p) { state.part = null; return buildDetail(); }
  $('#detail').innerHTML = `
    <div class="pad">
      <span class="kicker">${esc(u.title)} · specimen</span>
      <h2>${esc(p.title)}</h2>
      <p class="lede">${esc(p.note)}</p>
      <hr class="rule">
      <button class="btn" id="back">Back to the unit</button>
    </div>`;
  $('#back').addEventListener('click', () => { state.part = null; render(); });
}

function langBar() {
  const c = state.course;
  if (!c.multilingual || !c.languages?.length) return '';
  return `<div class="btn-row" style="margin:12px 0 4px">
    ${c.languages.map(l => `<button class="btn ${state.lang === l.code ? 'btn-key' : ''}" data-lang="${esc(l.code)}">${esc(l.label)}</button>`).join('')}
    <button class="btn ${!state.lang ? 'btn-key' : ''}" data-lang="">English only</button></div>`;
}
function bindLang() {
  $$('#detail [data-lang]').forEach(b => b.addEventListener('click', () => {
    state.lang = b.dataset.lang || null; render();
  }));
}

function termsPanel() {
  const u = unit(), t = topic(), vocab = t.vocab || [];
  $('#detail').innerHTML = `
    <div class="pad">
      <span class="kicker">${esc(u.title)}</span>
      <h2>Key terms</h2>
      <div class="sub">${vocab.length} to review</div>
      ${langBar()}
      ${vocab.length
        ? `<div class="terms" style="margin-top:14px">${vocab.map(v => `
            <div class="term"><dt>${esc(v.term)}</dt>
            ${state.lang && v[state.lang] ? `<dd class="tr">${esc(v[state.lang])}${
              state.lang === 'zh' && v.pinyin ? ` · ${esc(v.pinyin)}` : ''}</dd>` : ''}
            <dd>${esc(v.def)}</dd></div>`).join('')}</div>`
        : `<p class="lede">No term list has been added for this topic yet.</p>`}
      <hr class="rule">
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-key" data-go="cards">Study as flashcards</button>
        <button class="btn" data-go="overview">Back</button>
      </div>
    </div>`;
  bindLang();
  $$('#detail [data-go]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.go; state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
}

function cardsPanel() {
  const u = unit(), t = topic(), vocab = t.vocab || [];
  if (!vocab.length) {
    $('#detail').innerHTML = `<div class="pad"><span class="kicker">${esc(u.title)}</span>
      <h2>Flashcards</h2><p class="lede">No terms are available for this topic yet.</p>
      <button class="btn" data-go="overview">Back</button></div>`;
    $('#detail [data-go]').addEventListener('click', () => { state.view = 'overview'; render(); });
    return;
  }
  const i = Math.min(state.cardIdx, vocab.length - 1), v = vocab[i];
  const tr = state.lang && v[state.lang] ? `<div class="sub" style="margin-top:8px">${esc(v[state.lang])}</div>` : '';

  $('#detail').innerHTML = `
    <div class="pad">
      <span class="kicker">${esc(u.title)}</span>
      <h2 style="font-size:32px">Flashcards</h2>
      <div class="sub">Card ${i + 1} of ${vocab.length}</div>
      ${langBar()}
      <div class="card-flip ${state.flipped ? 'flipped' : ''}" id="card" style="margin:14px 0 16px">
        <div class="card-inner">
          <div class="card-face"><div><div class="word">${esc(v.term)}</div>${tr}
            <div class="label" style="margin-top:14px">Click to reveal</div></div></div>
          <div class="card-face back"><div class="def">${esc(v.def)}</div></div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn" id="prev">‹ Back</button>
        <button class="btn btn-key" id="next">Next ›</button>
        <button class="btn" id="shuffle">Shuffle</button>
        <button class="btn" data-go="overview">Done</button>
      </div>
    </div>`;

  const go = d => { state.cardIdx = (i + d + vocab.length) % vocab.length; state.flipped = false; cardsPanel(); };
  $('#card').addEventListener('click', () => { state.flipped = !state.flipped; $('#card').classList.toggle('flipped'); });
  $('#prev').addEventListener('click', () => go(-1));
  $('#next').addEventListener('click', () => go(1));
  $('#shuffle').addEventListener('click', () => {
    for (let k = vocab.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [vocab[k], vocab[j]] = [vocab[j], vocab[k]]; }
    state.cardIdx = 0; state.flipped = false; cardsPanel();
  });
  bindLang();
  $('#detail [data-go]').addEventListener('click', () => { state.view = 'overview'; render(); syncHash(); });
}

/* ---------- search ---------- */
let INDEX = [];
function buildIndex() {
  INDEX = [];
  state.course.units.forEach((u, ui) => (u.topics || []).forEach((t, ti) => {
    INDEX.push({ kind: 'topic', label: t.title || u.title, sub: u.title, ui, ti });
    (t.vocab || []).forEach(v => INDEX.push({ kind: 'term', label: v.term, sub: u.title, def: v.def, ui, ti }));
  }));
  (state.course.researchers || []).forEach(r => INDEX.push({ kind: 'researcher', label: r.who, sub: r.what, def: r.what }));
}

function runSearch(q) {
  const box = $('#searchResults');
  q = q.trim().toLowerCase();
  if (q.length < 2) { box.hidden = true; return; }
  const hits = INDEX.filter(x => x.label.toLowerCase().includes(q) || (x.def || '').toLowerCase().includes(q)).slice(0, 24);
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.map((h, i) => `<button class="result" data-i="${i}">
        <div class="r-t">${esc(h.label)}</div><div class="r-s">${esc(h.kind)} · ${esc(h.sub)}</div></button>`).join('')
    : `<div class="result"><div class="r-s">No matches</div></div>`;
  $$('#searchResults .result[data-i]').forEach(b => b.addEventListener('click', () => {
    const h = hits[+b.dataset.i];
    if (h.ui != null) {
      state.unitIdx = h.ui; state.topicIdx = h.ti; state.lessonIdx = null; state.part = null;
      state.view = h.kind === 'term' ? 'terms' : 'overview';
      buildRail(); render(); syncHash();
    }
    box.hidden = true; $('#search').value = '';
  }));
}

/* ---------- shell ---------- */
const syncHash = () => { location.hash = `u${state.unitIdx}-t${state.topicIdx}-${state.view}`; };
function restoreHash() {
  const m = /^#u(\d+)-t(\d+)-(\w+)$/.exec(location.hash);
  if (!m) return;
  state.unitIdx = Math.min(+m[1], state.course.units.length - 1);
  state.topicIdx = Math.max(0, +m[2]);
  if (['overview', 'terms', 'cards'].includes(m[3])) state.view = m[3];
}
function render() { buildStage(); buildDetail(); }

if ($('#courseGrid')) renderHome();
if ($('#workspace')) {
  renderCourse();
  const s = $('#search');
  if (s) {
    s.addEventListener('input', e => runSearch(e.target.value));
    s.addEventListener('blur', () => setTimeout(() => { $('#searchResults').hidden = true; }, 180));
  }
  addEventListener('keydown', e => {
    if (state.view !== 'cards') return;
    if (e.key === 'ArrowRight') $('#next')?.click();
    if (e.key === 'ArrowLeft') $('#prev')?.click();
    if (e.key === ' ') { e.preventDefault(); $('#card')?.click(); }
  });
}
