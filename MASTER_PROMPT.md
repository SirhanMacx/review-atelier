# Master prompt — Mr. Mac's review site

## 0. What went wrong the first three times

I copied the *form* of an anatomy app onto three social studies and psychology
courses. In that app the 3D model is the content: you are studying the heart, so
rotating a heart teaches you something. Here the specimens were metaphors
(nesting dolls for "Development and Learning"), which teach nothing, cost load
time, and pushed the actual studying behind a toy.

**The rule this document exists to enforce: every visual element must either be
the thing being studied, or must go.**

---

## 1. Who this is for

A 14 year old on a phone, at 9pm, the night before a unit test. Sometimes a
17 year old revising for the AP exam in May. Occasionally Mr. Mac projecting it
on the board to run a review day.

They are not here to admire anything. They are here to answer: *what am I
supposed to know, and do I know it yet?*

Design for the phone first. The desktop three column layout is a bonus, not the
premise.

## 2. What it must do, in priority order

1. **Get me to my unit in one tap.** Course, then unit. No hunting.
2. **Show me what I need to know.** The key terms, the big questions, the common
   mix-ups, from the actual lessons taught.
3. **Let me check myself.** Flip through terms, mark each as *got it* or *not yet*,
   and come back to only the *not yet* pile. Progress persists on the device.
4. **Let me find one thing fast.** Search a term from anywhere and land on it.
5. **Work offline-ish and instantly.** The night before a test is not the time
   for a 3 MB download on school wifi.

## 3. What it must not do

- **No tests, no quiz items, no answer keys, no rubrics, no model answers.**
  This is review material only. The extractors already enforce this and must
  keep doing so. Flashcards and self-checks are fine; graded assessment is not.
- No decorative 3D. See section 5.
- No teacher name or school name anywhere.
- No em dashes or en dashes in student-facing copy. Use "to" for ranges.

## 4. The content that already exists (do not rebuild this)

Extracted from the real curriculum on `/Volumes/CURRICULA`, in `data/*.json`:

| Course | Units | Lessons | Key terms | Notes |
|---|---|---|---|---|
| AP Psychology | 7 | 89 | 527 | plus 49 researchers with contributions |
| Global History 9R | 10 | 178 | 494 | NYS Key Ideas 9.1 to 9.10 |
| Global History 9 ENL | 10 | 147 | 1,111 | every term has Pinyin, Chinese, Spanish |

Each topic also carries: overview, essential questions, objectives,
misconceptions, and primary source citations. This is the substance. The
interface exists to serve it.

## 5. Every topic gets a specimen, and every specimen is a real thing

Each topic in each course is modelled in 3D and explained. Roughly 90 specimens.

The rule from section 0 still holds, and it is what makes this work rather than
decorate: **model the iconic real object of the topic, never an abstract
metaphor.** Almost every topic in these courses has one, because science and
history both happened through objects.

AP Psychology, the apparatus and anatomy that made the finding:

| Topic | Specimen |
|---|---|
| Research methods | brass laboratory balance |
| Heredity and environment | the Watson and Crick double helix model |
| Nervous system, the neuron | a single motor neuron |
| The brain | the brain, with lobes as hotspots |
| Sleep | an EEG electrode cap |
| Sensation | the eye, the cochlea |
| Perception | a Necker cube, the Muller Lyer figure |
| Memory | the hippocampus |
| Classical conditioning | Pavlov's salivation apparatus |
| Operant conditioning | a Skinner box |
| Psychology of social situations | Milgram's shock generator |
| Attitudes and conformity | Asch's line judgment cards |
| Psychodynamic theory | Freud's consulting couch |
| Personality assessment | a Rorschach card |
| Disorders, historically | a phrenology head |

Global History, the artifact that carries the evidence:

| Topic | Specimen |
|---|---|
| Paleolithic life | a hand axe, a Lascaux horse |
| Neolithic revolution | a sickle, a grain jar |
| Mesopotamia | Hammurabi's stele, a cuneiform tablet |
| Egypt | the Rosetta Stone, a canopic jar |
| Indus valley | a Harappan seal |
| Shang China | an oracle bone, a ritual bronze |
| Greece | a Doric capital, a hoplite helmet |
| Rome | an aqueduct arch, a legionary gladius |
| Han China | a Han crossbow, a silk bolt |
| Belief systems | a Buddha figure, a Torah scroll, a mihrab |
| Silk Roads | a Bactrian camel with panniers |
| Indian Ocean trade | a dhow, an astrolabe |
| Trans Saharan trade | a salt slab, a gold weight |
| Mongols | a composite bow, a stirrup |
| Black Death | a plague doctor mask |
| Renaissance | a printing press, an armillary sphere |
| Exploration | a caravel, a magnetic compass |
| The Americas | the Aztec sun stone, an Inca quipu |

Two consequences worth stating plainly:

- These are things a student is actually expected to recognise on a Regents
  stimulus or an AP question. Rotating an oracle bone is studying.
- Each specimen carries a short explanation of **what you are looking at and why
  this object is the one that matters**, alongside the terms. That caption is
  content, written per topic, not filler.

Hotspots are added where a specimen has nameable parts worth learning: the
brain's lobes, the neuron's dendrites and axon and myelin, the caravel's lateen
sail, the stele's relief and law text. Where an object has no parts worth
naming, it simply rotates.

## 6. Look and feel

The warm paper palette and Cormorant Garamond typography from the current build
are good and should stay, with these corrections:

- Text sizes are too small for a phone. Body should be comfortably readable at
  arm's length: 16 to 17px minimum for content, not 13px.
- Contrast is too low in places. The muted grey on warm paper fails on a phone
  in a lit room.
- Cards must not crop their images. Either the image fits, or there is no image.
- Three courses must be distinguishable at a glance. Colour alone is not enough
  when two of them are both world history.

Tokens: paper `#f7f2e9`, panels `rgba(255,251,244,.72)`, hairline
`rgba(117,91,70,.18)`, ink `rgb(47,42,39)`. Accents: psych violet, 9R terracotta,
ENL green.

## 7. Structure

```
/                         three courses, each with what it covers and where you left off
/course?c=<id>            units list, progress per unit
/course?c=<id>#u<n>       one unit: overview, terms, self-check
```

On a phone this is three stacked screens. On desktop the unit view may use the
rail plus panel layout. Deep links must survive a refresh and be shareable, so a
student can send a friend the exact topic.

## 8. The self-check loop, in detail

This is the heart of the product and does not exist yet.

- A term shows its word. Tap to reveal the definition.
- Two buttons: **Got it** and **Not yet**.
- Progress is stored per course per topic in `localStorage`.
- The unit list shows a quiet progress indication, e.g. "38 of 78 terms".
- A **Review what I missed** entry point rebuilds a deck from everything marked
  *not yet*, across the whole course.
- ENL: the translation is part of the card, not an option buried behind a toggle.
  Vocabulary first is how that course is taught, so English, then home language,
  then the plain English definition.

## 9. Performance budget

- First view usable in under a second on school wifi.
- Text content renders first, always. The specimen loads after, and never
  blocks reading.
- One model per topic, loaded on demand, meshopt compressed. Budget 300 KB per
  specimen, and never preload the next one on a phone.
- A student on a slow connection still gets a complete, usable review page.

## 10. How I will know it worked

Not "does it look like the anatomy site". These:

- A student can get from the home page to studying a specific unit's terms in
  two taps, on a phone, without pinching to read anything.
- After one pass, they can return and drill only what they got wrong.
- Every visible element can be justified as either content or navigation.
- Mr. Mac can open a unit on the board and it is legible from the back row.
