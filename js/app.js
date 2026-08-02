/* =========================================================
   app.js — the Review Atelier engine.
   Review only: term banks, concept maps, flashcards, search.
   No quizzes, no answer keys.
   ========================================================= */
import { constellation, brain, worldMap, emblem, rng } from './art.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = {
  course: null,          // loaded JSON
  unitIdx: 0,
  topicIdx: 0,
  view: 'overview',      // overview | terms | cards
  lessonIdx: null,
  cardIdx: 0,
  flipped: false,
  lang: null             // ENL translation language
};

/* ---------- world-map pins: unit -> where it happened ---------- */
const PLACES = {
  // Global 9R units
  'global:00': { lon: 15, lat: 25 },   'global:01': { lon: 36, lat: 4 },
  'global:02': { lon: 44, lat: 32 },   'global:03': { lon: 78, lat: 24 },
  'global:04': { lon: 20, lat: 40 },   'global:05': { lon: 60, lat: 22 },
  'global:06': { lon: 30, lat: 45 },   'global:07': { lon: 8,  lat: 44 },
  'global:08': { lon: -40, lat: 12 },  'global:09': { lon: 0,  lat: 30 },
  // ENL units
  'enl:1': { lon: 0, lat: 10 },   'enl:2': { lon: 34, lat: 6 },
  'enl:3': { lon: 44, lat: 32 },  'enl:4': { lon: 22, lat: 39 },
  'enl:5': { lon: 12, lat: 48 },  'enl:6': { lon: 11, lat: 43 },
  'enl:7': { lon: -60, lat: 10 }, 'enl:8': { lon: 5, lat: 30 },
  'enl:Intro': { lon: 0, lat: 20 }, 'enl:EI': { lon: 20, lat: 20 }
};

/* ============================ LANDING ============================ */
async function renderHome() {
  const courses = [
    { id: 'psych',  file: 'data/psych.json' },
    { id: 'global', file: 'data/global.json' },
    { id: 'enl',    file: 'data/enl.json' }
  ];
  const grid = $('#courseGrid');
  const loaded = await Promise.all(courses.map(async c => {
    try { const r = await fetch(c.file); return r.ok ? await r.json() : null; }
    catch { return null; }
  }));

  grid.innerHTML = loaded.filter(Boolean).map(c => {
    const units = c.units.length;
    const terms = c.units.reduce((a, u) => a + (u.counts?.terms || 0), 0);
    const lessons = c.units.reduce((a, u) => a + (u.counts?.lessons || 0), 0);
    return `
    <a class="course-card" href="course.html?c=${esc(c.id)}" data-accent="${esc(c.accent)}">
      <div class="art">${courseArtFor(c)}</div>
      <div class="body">
        <span class="eyebrow">${esc(c.subtitle)}</span>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.note || '')}</p>
        <div class="meta"><span>${units} units</span><span>${lessons} lessons</span><span>${terms} key terms</span></div>
      </div>
    </a>`;
  }).join('');

  // per-card accent
  $$('.course-card').forEach(el => el.style.setProperty('--accent',
    getComputedStyle(document.documentElement).getPropertyValue(`--c-${el.dataset.accent}`) || ''));
}

function courseArtFor(c) {
  if (c.specimen === 'brain') return brain().svg;
  if (c.specimen === 'map')   return worldMap([]).svg;
  return constellation(c.units[0] || { id: c.id, topics: [] }).svg;
}

/* ============================ COURSE ============================ */
async function renderCourse() {
  const id = new URLSearchParams(location.search).get('c') || 'psych';
  let data;
  try {
    const r = await fetch(`data/${id}.json`);
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch (e) {
    $('#workspace').innerHTML = `<div class="panel panel-pad"><h2>Course not found</h2>
      <p class="lede">Could not load <code>data/${esc(id)}.json</code>.</p>
      <a class="btn" href="index.html">Back to all courses</a></div>`;
    return;
  }
  state.course = data;
  document.body.dataset.course = data.accent || id;
  document.title = `${data.title} — Review Atelier`;
  $('#courseTitle').textContent = data.title;
  if (data.multilingual && data.languages?.length) state.lang = data.languages[0].code;

  restoreFromHash();
  buildRail();
  render();
  buildSearchIndex();
}

function unit()  { return state.course.units[state.unitIdx] || { topics: [] }; }

/* A unit with one lumped topic makes a lonely map. Fan it out per lesson
   so every node is something a student can actually click into. */
function mapNodes(u) {
  const t = u.topics || [];
  if (t.length >= 3 || !t[0]) return t.map((x, i) => ({ title: x.title || `Topic ${i + 1}`, topicIdx: i }));
  return (t[0].lessons || []).map((l, i) => ({ title: l.title, topicIdx: 0, lessonIdx: i }));
}
function topic() { return unit().topics[state.topicIdx] || { vocab: [], lessons: [] }; }

/* ---------- rail ---------- */
function buildRail() {
  const c = state.course;
  $('#rail').innerHTML = `
    <div class="panel-head"><span class="eyebrow">${esc(c.title)} · Units</span></div>
    <ul class="unit-list" role="tablist">
      ${c.units.map((u, i) => `
        <li><button class="unit-item" role="tab" data-unit="${i}" aria-selected="${i === state.unitIdx}">
          <span class="unit-chip">${emblem(c.id + u.id + u.title)}</span>
          <span><span class="unit-name">${esc(u.title)}</span>
          <span class="unit-sub">${u.counts?.terms || 0} terms · ${u.counts?.lessons || 0} lessons</span></span>
        </button></li>`).join('')}
    </ul>`;
  $$('#rail .unit-item').forEach(b => b.addEventListener('click', () => {
    state.unitIdx = +b.dataset.unit; state.topicIdx = 0; state.lessonIdx = null;
    state.cardIdx = 0; state.view = 'overview';
    buildRail(); render(); syncHash();
  }));
}

/* ---------- stage ---------- */
function buildStage() {
  const c = state.course, u = unit();
  const nodes = mapNodes(u);
  let art, marks, caption, kind;

  if (c.specimen === 'brain' && u.id === '1') {
    // A real anatomy specimen: the markers are brain regions, not topics.
    const b = brain();
    art = b.svg; marks = b.nodes; kind = 'part';
    caption = 'Brain specimen · click a region to read about it';
  } else if (c.specimen === 'map') {
    const home = PLACES[`${c.id}:${u.id}`] || { lon: 0, lat: 20 };
    const rand = rng(c.id + u.id);
    const pins = nodes.map((nd, i) => ({
      id: String(i), title: nd.title,
      lon: Math.max(-176, Math.min(176, home.lon + (rand() - .5) * 40)),
      lat: Math.max(-54, Math.min(72, home.lat + (rand() - .5) * 30))
    }));
    const m = worldMap(pins, { label: `Where ${u.title} happened` });
    art = m.svg; marks = m.nodes; kind = 'node';
    caption = 'World atlas · click a marker to open it';
  } else {
    const synth = { id: c.id + u.id, title: u.title,
      topics: nodes.map(nd => ({ code: nd.title, title: nd.title,
        vocab: (u.topics[nd.topicIdx]?.vocab) || [] })) };
    const k = constellation(synth);
    art = k.svg; marks = k.nodes; kind = 'node';
    caption = 'Topic map · click a node to open it';
  }

  const markers = marks.map((nd, i) => {
    const label = kind === 'part' ? nd.title : (nodes[i]?.title || nd.title || '');
    const active = kind === 'node' && nodes[i] &&
      nodes[i].topicIdx === state.topicIdx &&
      (nodes[i].lessonIdx == null || nodes[i].lessonIdx === state.lessonIdx);
    return `<button class="hotspot" style="left:${nd.xPct.toFixed(2)}%;top:${nd.yPct.toFixed(2)}%"
      data-i="${i}" data-kind="${kind}" aria-pressed="${!!active}"
      aria-label="${esc(label)}" title="${esc(label)}"></button>`;
  }).join('');

  const strip = u.topics.length > 1 ? `
    <div class="pills topicstrip">${u.topics.map((t, i) =>
      `<button class="pill" data-topic="${i}" aria-pressed="${i === state.topicIdx}"
        >${esc(t.title || t.code || `Topic ${i + 1}`)}</button>`).join('')}</div>` : '';

  $('#stage').innerHTML = `
    <div class="stage-art">
      <div class="artbox" data-wide="${c.specimen === 'map'}">${art}${markers}</div>
      <div class="tip-note"><b>Tip</b><br>Click a marker on the specimen, then switch to Key terms or Flashcards.</div>
    </div>
    ${strip}
    <div class="stage-foot">
      <span class="eyebrow">${esc(caption)}</span>
      <div class="pills">
        <button class="pill" data-view="overview" aria-pressed="${state.view === 'overview'}">Overview</button>
        <button class="pill" data-view="terms" aria-pressed="${state.view === 'terms'}">Key terms</button>
        <button class="pill" data-view="cards" aria-pressed="${state.view === 'cards'}">Flashcards</button>
      </div>
    </div>`;

  $$('#stage .hotspot').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if (b.dataset.kind === 'part') return showPart(brain().nodes[i]);
    const nd = nodes[i];
    if (!nd) return;
    state.topicIdx = nd.topicIdx;
    state.lessonIdx = nd.lessonIdx ?? null;
    state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
  $$('#stage .topicstrip .pill').forEach(b => b.addEventListener('click', () => {
    state.topicIdx = +b.dataset.topic; state.lessonIdx = null;
    state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
  $$('#stage .stage-foot .pill').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
}

function showPart(part) {
  $('#detail').innerHTML = `
    <div class="panel-pad">
      <span class="eyebrow">Brain specimen</span>
      <h2>${esc(part.title)}</h2>
      <p class="lede">${esc(part.note)}</p>
      <button class="btn" id="backTopic">Back to the topic</button>
    </div>`;
  $('#backTopic').addEventListener('click', render);
}

/* ---------- detail panel ---------- */
function buildDetail() {
  const u = unit(), t = topic();
  if (state.view === 'terms') return buildTerms();
  if (state.view === 'cards') return buildCards();

  const all = t.lessons || [];
  const lessons = (state.lessonIdx != null && all[state.lessonIdx]) ? [all[state.lessonIdx]] : all;
  const src = lessons.map(l => l.source).find(Boolean);
  const facts = [
    ['◇', 'Unit', u.title],
    u.weight ? ['⌁', 'Weighting', u.weight] : null,
    ['❋', 'Topic', t.code ? `${t.code} ${t.title || ''}`.trim() : (t.title || '')],
    ['⌖', 'Lessons', `${lessons.length}`],
    ['◈', 'Key terms', `${(t.vocab || []).length}`]
  ].filter(Boolean);

  const eqs = lessons.flatMap(l => l.essentialQuestions || []).slice(0, 3);
  const objs = lessons.flatMap(l => l.objectives || []).slice(0, 4);
  const mis = (t.misconceptions || []).slice(0, 3);
  const people = (state.course.researchers || []).filter(p => p.unit === u.id);
  const overview = lessons.map(l => l.overview).filter(Boolean)[0] || '';

  $('#detail').innerHTML = `
    <div class="panel-pad">
      <span class="eyebrow">${esc(u.title)}</span>
      <h2>${esc(lessons.length === 1 && state.lessonIdx != null ? lessons[0].title : (t.title || u.title))}</h2>
      <div class="kicker">${esc(u.blurb || '')}</div>
      ${overview ? `<p class="lede">${esc(overview)}</p>` : ''}

      <span class="eyebrow">Key facts</span>
      <div class="facts">${facts.map(([g, k, v]) =>
        `<div class="fact"><span class="gl">${g}</span><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>

      ${eqs.length ? `<hr class="rule"><span class="eyebrow">Questions to be able to answer</span>
        <div class="actions">${eqs.map(q => `<div class="note-card"><span>${esc(q)}</span></div>`).join('')}</div>` : ''}

      ${objs.length ? `<hr class="rule"><span class="eyebrow">You should be able to</span>
        <div class="actions">${objs.map(o => `<div class="note-card"><span>${esc(o)}</span></div>`).join('')}</div>` : ''}

      ${mis.length ? `<hr class="rule"><span class="eyebrow">Common mix-ups</span>
        <div class="actions">${mis.map(m => `<div class="note-card"><b>Watch out</b><span>${esc(m)}</span></div>`).join('')}</div>` : ''}

      ${people.length ? `<hr class="rule"><span class="eyebrow">Researchers to know in this unit</span>
        <div class="terms">${people.map(p => `<div class="term">
          <dt>${esc(p.who)}</dt><dd>${esc(p.what)}</dd></div>`).join('')}</div>` : ''}

      ${src ? `<hr class="rule"><span class="eyebrow">Primary source in this topic</span>
        <div class="note-card"><span><b>${esc(src.title)}</b>
        ${[src.author, src.year].filter(Boolean).map(esc).join(', ')}</span></div>` : ''}

      <hr class="rule">
      <div class="actions">
        <button class="action" data-go="terms"><span class="ico">◈</span>
          <span><span class="t">Key terms</span><span class="s">${(t.vocab || []).length} to review</span></span></button>
        <button class="action" data-go="cards"><span class="ico">⇄</span>
          <span><span class="t">Flashcards</span><span class="s">Flip through this topic</span></span></button>
      </div>

      ${lessons.length ? `<hr class="rule"><span class="eyebrow">Lessons in this topic</span>
        <div class="terms">${lessons.map(l => `<div class="term">
          <dt>${esc(l.title)}</dt>${l.date ? `<dd>${esc(l.date)}</dd>` : ''}</div>`).join('')}</div>` : ''}
    </div>`;

  $$('#detail [data-go]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.go; state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
}

function langPicker() {
  const c = state.course;
  if (!c.multilingual || !c.languages?.length) return '';
  return `<div class="pills" style="margin:10px 0 4px">
    ${c.languages.map(l => `<button class="pill" data-lang="${esc(l.code)}"
      aria-pressed="${state.lang === l.code}">${esc(l.label)}</button>`).join('')}
    <button class="pill" data-lang="" aria-pressed="${!state.lang}">English only</button>
  </div>`;
}

function bindLang() {
  $$('#detail [data-lang]').forEach(b => b.addEventListener('click', () => {
    state.lang = b.dataset.lang || null; render();
  }));
}

function buildTerms() {
  const t = topic(), u = unit();
  const vocab = t.vocab || [];
  $('#detail').innerHTML = `
    <div class="panel-pad">
      <span class="eyebrow">${esc(u.title)} · ${esc(t.title || '')}</span>
      <h2>Key terms</h2>
      <div class="kicker">${vocab.length} to review</div>
      ${langPicker()}
      ${vocab.length ? `<div class="terms" style="margin-top:12px">${vocab.map(v => `
        <div class="term">
          <dt>${esc(v.term)}</dt>
          ${state.lang && v[state.lang] ? `<dd><b>${esc(v[state.lang])}</b>${v.pinyin && state.lang === 'zh' ? ` · ${esc(v.pinyin)}` : ''}</dd>` : ''}
          <dd>${esc(v.def)}</dd>
        </div>`).join('')}</div>`
        : `<p class="lede">No term list has been added for this topic yet.</p>`}
      <hr class="rule">
      <div class="btn-row">
        <button class="btn btn-primary" data-go="cards">Study as flashcards</button>
        <button class="btn" data-go="overview">Back to overview</button>
      </div>
    </div>`;
  bindLang();
  $$('#detail [data-go]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.go; state.cardIdx = 0; state.flipped = false; render(); syncHash();
  }));
}

function buildCards() {
  const t = topic(), u = unit();
  const vocab = t.vocab || [];
  if (!vocab.length) {
    $('#detail').innerHTML = `<div class="panel-pad"><h2>Flashcards</h2>
      <p class="lede">No terms are available for this topic yet.</p>
      <button class="btn" data-go="overview">Back to overview</button></div>`;
    $('#detail [data-go]').addEventListener('click', () => { state.view = 'overview'; render(); });
    return;
  }
  const i = Math.min(state.cardIdx, vocab.length - 1);
  const v = vocab[i];
  const tr = state.lang && v[state.lang] ? `<div class="kicker" style="margin-top:8px">${esc(v[state.lang])}</div>` : '';

  $('#detail').innerHTML = `
    <div class="panel-pad">
      <span class="eyebrow">${esc(u.title)} · Flashcards</span>
      <h2 style="font-size:24px">Card ${i + 1} of ${vocab.length}</h2>
      ${langPicker()}
      <div class="card-flip ${state.flipped ? 'flipped' : ''}" id="card" style="margin:12px 0 14px">
        <div class="card-inner">
          <div class="card-face"><div><div style="font-family:var(--serif);font-size:24px;font-weight:600">${esc(v.term)}</div>
            ${tr}<div class="eyebrow" style="margin-top:12px">Click to reveal</div></div></div>
          <div class="card-face back"><div style="font-size:14px;line-height:1.6">${esc(v.def)}</div></div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn" id="prev">‹ Previous</button>
        <button class="btn" id="flip">Flip</button>
        <button class="btn btn-primary" id="next">Next ›</button>
        <button class="btn" id="shuffle">Shuffle</button>
      </div>
      <hr class="rule">
      <button class="btn" data-go="overview">Back to overview</button>
    </div>`;

  const go = d => { state.cardIdx = (i + d + vocab.length) % vocab.length; state.flipped = false; buildCards(); };
  $('#card').addEventListener('click', () => { state.flipped = !state.flipped; $('#card').classList.toggle('flipped'); });
  $('#flip').addEventListener('click', e => { e.stopPropagation(); state.flipped = !state.flipped; $('#card').classList.toggle('flipped'); });
  $('#prev').addEventListener('click', () => go(-1));
  $('#next').addEventListener('click', () => go(1));
  $('#shuffle').addEventListener('click', () => {
    for (let k = vocab.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[vocab[k], vocab[j]] = [vocab[j], vocab[k]]; }
    state.cardIdx = 0; state.flipped = false; buildCards();
  });
  bindLang();
  $('#detail [data-go]').addEventListener('click', () => { state.view = 'overview'; render(); syncHash(); });
}

/* ---------- search ---------- */
let INDEX = [];
function buildSearchIndex() {
  INDEX = [];
  state.course.units.forEach((u, ui) => (u.topics || []).forEach((t, ti) => {
    INDEX.push({ kind: 'topic', label: t.title || u.title, sub: u.title, ui, ti });
    (t.vocab || []).forEach(v => INDEX.push({ kind: 'term', label: v.term, sub: `${u.title} · ${t.title || ''}`, def: v.def, ui, ti }));
  }));
  (state.course.researchers || []).forEach(r =>
    INDEX.push({ kind: 'person', label: r.who, sub: r.what, def: r.what }));
}

function runSearch(q) {
  const box = $('#searchResults');
  q = q.trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; box.hidden = true; return; }
  const hits = INDEX.filter(x => x.label.toLowerCase().includes(q) ||
    (x.def || '').toLowerCase().includes(q)).slice(0, 24);
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.map((h, i) => `<button class="result" data-i="${i}">
        <div class="r-t">${esc(h.label)}</div><div class="r-s">${esc(h.kind)} · ${esc(h.sub)}</div></button>`).join('')
    : `<div class="result" style="cursor:default"><div class="r-s">No matches</div></div>`;
  $$('#searchResults .result[data-i]').forEach(b => b.addEventListener('click', () => {
    const h = hits[+b.dataset.i];
    if (h.ui != null) {
      state.unitIdx = h.ui; state.topicIdx = h.ti;
      state.view = h.kind === 'term' ? 'terms' : 'overview';
      buildRail(); render(); syncHash();
    }
    box.hidden = true; $('#search').value = '';
  }));
}

/* ---------- routing + shell ---------- */
function syncHash() {
  location.hash = `u${state.unitIdx}-t${state.topicIdx}-${state.view}`;
}
function restoreFromHash() {
  const m = /^#u(\d+)-t(\d+)-(\w+)$/.exec(location.hash);
  if (!m) return;
  state.unitIdx = Math.min(+m[1], state.course.units.length - 1);
  state.topicIdx = Math.max(0, +m[2]);
  if (['overview', 'terms', 'cards'].includes(m[3])) state.view = m[3];
}

function render() { buildStage(); buildDetail(); }

/* theme toggle */
function initTheme() {
  const saved = localStorage.getItem('atelier-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  const btn = $('#themeBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('atelier-theme', next);
  });
}

/* boot */
initTheme();
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
    if (e.key === ' ') { e.preventDefault(); $('#flip')?.click(); }
  });
}
