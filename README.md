# Mr. Mac's Review Atelier

A student review site for the 2026 to 2027 school year, covering all three preps:

- **AP Psychology** (College Board CED, Course Framework V.1)
- **Global History 9R** (NYS Grade 9 Framework, Regents)
- **Global History 9 ENL** (vocabulary-first, with translation support)

Live at: https://sirhanmacx.github.io/review-atelier/

## What it is

Each course opens as a three-column workspace: a unit rail on the left, an
interactive specimen in the middle, and a detail panel on the right. Pick a unit,
click a marker on the specimen, then read the overview, work the key term list,
or flip through flashcards.

The specimens are drawn as SVG, so they scale cleanly and follow the light or
dark theme:

- Each AP Psych unit opens on a photoreal 3D specimen render. Unit 1 is a brain
  with clickable anatomical regions.
- Global 9R and ENL open on a real rotating globe: an orthographic canvas render
  of Natural Earth 110m coastlines (public domain), lit like a sphere, with
  drag-to-rotate, auto-spin, and markers placed where the history actually
  happened, fading in as they come over the limb.
- Units without a specimen render a generated topic map, with node size scaled
  to how many key terms that topic carries.

## Review only

This site deliberately contains **no tests, no quiz items, and no answer keys**.
The extractors in `build/` read only review-safe fields (overviews, objectives,
essential questions, vocabulary, misconceptions, primary-source citations) and
explicitly skip assessment content, teacher keys, rubrics, and model answers.

## Layout

```
index.html          landing page, one card per course
course.html         the three-column course workspace
css/atelier.css     design system (warm ivory canvas, per-course accents)
js/app.js           engine: rail, stage, detail panel, flashcards, search
js/art.js           SVG specimen generators (topic maps, emblems)
js/globe.js         the rotating canvas globe
assets/img/         photoreal unit specimens
assets/land.js      world coastline path, generated from Natural Earth 110m
data/*.json         extracted course content
build/*.py          extractors that regenerate data/ from the curriculum volume
```

## Rebuilding the data

The extractors read from the curriculum volume, so they only run on Jon's machine
with `/Volumes/CURRICULA` mounted:

```bash
python3 build/extract_psych.py
python3 build/extract_global.py
python3 build/extract_enl.py
```

Each writes one JSON file into `data/` and prints per-unit counts. The site itself
is plain static files with no build step and no dependencies.

## Running locally

```bash
python3 -m http.server 8901
```

Then open http://127.0.0.1:8901/

## Credits

World map geometry from Natural Earth via the world-atlas project, public domain.
Type is Fraunces and Inter, both open licensed.
