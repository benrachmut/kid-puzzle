# kid-puzzle — project rules

## Stack

- **Language:** plain ES5-compatible JavaScript in IIFE modules on a `window.KP`
  namespace. No framework, no bundler, no runtime dependency, no network call.
- **Markup/styles:** static HTML + one hand-written CSS file.
- **Storage:** `localStorage` only, always behind `js/storage.js`.
- **Audio/graphics:** WebAudio, canvas and inline SVG. No asset files.

## Commands

- **Run:** open `index.html`, or `python3 -m http.server 8000` and browse to
  <http://localhost:8000>.
- **Build:** none, by design.
- **Test / lint:** `node --check` on each file in `js/` — there is no test runner
  and no linter in this repo; behaviour is verified in a browser.

## Overrides of the shared engineering standards

These are deliberate, and follow from the brief (a dependency-free static toy):

- **No `src/types|interfaces|enums` folders.** The project is plain JavaScript
  with no type system; shared constants live beside the code that owns them
  (`KP.art`, `KP.storage.GAME_IDS`).
- **No backend, so no layered backend architecture, DTO validation, Swagger,
  DAL, error-code middleware, JWT/RBAC.** There is no server and no user
  account; the Cambium `[page][number]` error-code scheme has nothing to address
  because nothing can fail across a boundary.
- **No Zustand, PrimeReact or axios.** No framework is allowed here; state is
  plain module-scoped objects and there are no HTTP calls at all.
- **No automated test layers.** The brief scoped one implementation pass; the
  negative cases (bad drops, double clicks, resize mid-puzzle, missing
  localStorage, language switch mid-puzzle) are handled in code and were checked
  by hand in a browser.

## Kept from the shared standards

SOLID-ish separation per module, no dead code, comments explaining *why*, the
single i18n dictionary (`js/i18n.js`) with no hardcoded display strings, and a
negative-testing mindset throughout.
