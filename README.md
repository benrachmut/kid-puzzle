# 🧩 Puzzle Play / משחקי פאזל

A small browser puzzle game for a 6-year-old, in **Hebrew and English** with a
one-click language toggle. No reading is needed to play: icons and sounds carry
the whole interface.

## Games

| Game | What you do | Levels |
| --- | --- | --- |
| Jigsaw | Drag the pieces onto the board; they snap when they are close enough | 4 → 6 → 9 → 12 pieces |
| Shapes & Colours | Drag each shape onto the matching outline | 3 → 4 → 5 → 6 shapes |
| Memory | Flip cards and find the pairs | 2×2 → 3×2 → 4×3 → 4×4 |

Finishing a level awards up to three stars and unlocks the next one. Stars and
unlocked levels are kept in `localStorage`; if storage is unavailable or blocked
(private browsing), the game still runs and simply forgets progress when the tab
closes.

## How to run

Either works — there is no build step, no dependency and no network call.

**Just open the file**

```
double-click index.html
```

The scripts are plain `<script>` tags (not ES modules) precisely so that
`file://` works.

**Or serve it locally** (recommended, and required if you later switch to modules)

```
python3 -m http.server 8000
```

then open <http://localhost:8000>.

## Controls

Mouse or trackpad only: drag pieces and shapes, click cards and buttons.
Top-right: 🌐 language toggle, 🔈 sound on/off.

## Privacy

Nothing is collected, sent or logged. There are no analytics, no fonts or images
fetched from the network, and no external requests of any kind — all artwork is
drawn with canvas and inline SVG, and every sound is synthesised with WebAudio at
play time.

## Project layout

```
index.html          markup and script order
css/styles.css      all styling (class-based; no inline layout styles)
js/i18n.js          the ONE dictionary of display strings (he/en)
js/storage.js       localStorage with try/catch + in-memory fallback
js/audio.js         WebAudio cues, unlocked on the first user gesture
js/util.js          shuffle / clamp / debounce / star scoring
js/drag.js          shared pointer-drag helper (pointer capture)
js/art.js           every picture: SVG icons and canvas scenes
js/confetti.js      celebration burst on a full-screen canvas
js/games/jigsaw.js
js/games/matching.js
js/games/memory.js
js/app.js           screens, progress, language & sound, win overlay
```

## Browser support

Any current Chrome, Edge, Firefox or Safari. Requires Pointer Events,
`aspect-ratio`, CSS custom properties and WebAudio; if WebAudio is missing or
blocked the game stays fully playable and silent.
