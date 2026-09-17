# kid-puzzle — project rules

## Stack

- **Language:** plain ES5-compatible JavaScript in IIFE modules on a `window.KP`
  namespace. No framework, no bundler, no runtime dependency, no network call.
- **Markup/styles:** static HTML + one hand-written CSS file.
- **Storage:** `localStorage` for progress, always behind `js/storage.js`;
  `IndexedDB` for the child's photos, always behind `js/photos.js`. Both fall
  back to memory rather than failing.
- **Audio/graphics:** WebAudio, canvas and inline SVG. The only asset files in
  the project are the app icons in `icons/` (see below).
- **Input:** pointer events only, one code path for finger and mouse, through
  `js/drag.js` (pointer capture, a 12px tap radius, and suppression of the
  browser's own touch gestures). Boards claim every touch inside them
  (`touch-action: none`) and tap targets stay at 48px or more on a 360px-wide
  phone; both are easy to break from CSS, so check a phone viewport after any
  layout change.
- **Offline:** `sw.js` at the repo root precaches the shell under a versioned
  cache name and serves it cache-first. It is registered from `index.html` and
  skipped on `file://`, so offline is always an upgrade and never a requirement.

## Commands

- **Run:** open `index.html`, or `python3 -m http.server 8000` and browse to
  <http://localhost:8000>.
- **Build:** none, by design.
- **Test / lint:** `node --check` on each file in `js/` and on `sw.js` — there is
  no test runner and no linter in this repo; behaviour is verified in a browser.
- **Deploy:** GitHub Pages from `master` at the repo root, served under
  `/kid-puzzle/`. Every path in the project must stay relative. See the Deploy
  section of `README.md`, including the `CACHE_VERSION` bump in `sw.js` that a
  release needs.

## Overrides of the shared engineering standards

These are deliberate, and follow from the brief (a dependency-free static toy):

- **One asset folder, `icons/`.** An installed PWA has to hand the operating
  system real PNG files; they cannot be drawn at runtime the way the rest of the
  artwork is. The source SVGs ship beside the PNGs and `README.md` records the
  command that redraws them, so the folder stays generated rather than binary
  data nobody can reproduce.
- **One display string outside `js/i18n.js`:** the app name in
  `manifest.webmanifest`. The operating system reads it before any JavaScript
  runs, so it cannot come from the dictionary; it is bilingual there instead.
- **No `src/types|interfaces|enums` folders.** The project is plain JavaScript
  with no type system; shared constants live beside the code that owns them
  (`KP.art`, `KP.storage.GAME_IDS`).
- **No backend, so no layered backend architecture, DTO validation, Swagger,
  DAL, error-code middleware, JWT/RBAC.** There is no server and no user
  account; the Cambium `[page][number]` error-code scheme has nothing to address
  because nothing can fail across a boundary.
- **No Zustand, PrimeReact or axios.** No framework is allowed here; state is
  plain module-scoped objects and there are no HTTP calls at all.
- **No automated test layers.** Nothing in the repo runs tests. The negative
  cases (bad drops, double taps, a second finger mid-drag, resize or device
  rotation mid-puzzle, missing `localStorage` or IndexedDB, a photo the browser
  cannot decode, language switch mid-puzzle) are handled in code, and behaviour
  is verified by driving a real browser — Chrome device emulation with touch,
  and a mouse — rather than by a suite that ships.

## Kept from the shared standards

SOLID-ish separation per module, no dead code, comments explaining *why*, the
single i18n dictionary (`js/i18n.js`) with no hardcoded display strings, and a
negative-testing mindset throughout.
