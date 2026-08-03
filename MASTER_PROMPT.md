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

## 5. Where 3D and imagery are actually earned

Use a visual **only where it is the object of study**:

- **AP Psych Unit 1, the brain.** Genuine. A student must locate the frontal
  lobe, the cerebellum, the brainstem. Keep the 3D model with labelled regions.
- **Global 9R and ENL, the map.** Genuine. Geography is content: where the river
  valleys are, where the Silk Roads ran, what the Columbian Exchange moved and
  in which direction. But a slowly spinning globe with scattered pins is
  decoration. It must become a **real map that answers a question**: the four
  river valleys located and named; trade routes drawn as routes; the Mongol
  advance; the Atlantic triangle. If a unit has no geographic claim to make,
  it shows no map.
- **Everywhere else: no specimen.** Cognition, Development, Social, Health, the
  ENL vocabulary units. These get a clean type-led page. Empty space is better
  than a metaphor.

Delete the nesting dolls, ceramic heads, glass head, jars, prism, balance scale.
They are handsome objects that mean nothing here. Keep the files in the repo if
useful elsewhere, but they do not ship on the unit pages.

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
- three.js and any model load **only** on the two pages that earn one, and only
  after the text content is on screen.
- Total for a typical unit page without a specimen: under 150 KB.

## 10. How I will know it worked

Not "does it look like the anatomy site". These:

- A student can get from the home page to studying a specific unit's terms in
  two taps, on a phone, without pinching to read anything.
- After one pass, they can return and drill only what they got wrong.
- Every visible element can be justified as either content or navigation.
- Mr. Mac can open a unit on the board and it is legible from the back row.
