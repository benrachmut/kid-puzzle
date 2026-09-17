# 🧩 Puzzle Play / משחקי פאזל

A small browser puzzle game for a 6-year-old, in **Hebrew and English** with a
one-click language toggle. No reading is needed to play: icons and sounds carry
the whole interface.

Pictures taken with the phone camera, or picked from its gallery, become
puzzles of their own. The game installs to the home screen and plays offline.

## Games

| Game | What you do | Levels |
| --- | --- | --- |
| Jigsaw | Drag the pieces onto the board; they snap when they are close enough. On the last two levels pieces start turned — click one to rotate it, and it only snaps when it is upright | 4 → 6 → 9 → 12 → 16 → 20 → 25 pieces |
| Shapes & Colours | Drag each shape onto the matching outline. Later levels add distractor shapes that fit nowhere, and the last level changes the rule: click the odd one out | 3 → 4 → 5 → 6 shapes, then distractors, then odd-one-out |
| Memory | Flip cards and find the pairs; rated on how few moves you take | 2 → 3 → 6 → 8 → 10 pairs |
| Sliding Picture | Slide tiles into the gap to rebuild the picture | 3×3 → 4×4 |
| What Comes Next | Read the pattern and pick the piece that continues it | 4 patterns, ABAB → ABCB |
| Picture Jigsaw | The same jigsaw, cut from one of your own photos | 4 → 6 → 9 → 12 → 16 → 20 → 25 pieces |
| Sliding Picture (photo) | The same sliding puzzle, made from one of your own photos | 3×3 → 4×4 |

The two photo tracks keep one set of stars each, shared across every picture,
so a child is not made to start over because they chose a different photo.

Finishing a level awards up to three stars and unlocks the next one. Stars and
unlocked levels are kept in `localStorage`; if storage is unavailable or blocked
(private browsing), the game still runs and simply forgets progress when the tab
closes.

## Your own pictures

The camera card on the home screen opens the picture screen: **take a picture**
(the phone opens its back camera) or **choose a picture** from the gallery. Tap
a saved picture to turn it into a jigsaw or a sliding puzzle; tap the bin on it
and confirm to remove it.

Pictures are turned upright, shrunk to 1280px on their longest side and stored
on the device with IndexedDB. If storage is unavailable or full the pictures
still work for as long as the tab is open, and the screen says so. Formats the
browser cannot decode — an iPhone HEIC on a non-Apple browser is the usual one —
are refused with a friendly message rather than a broken puzzle.

## Install it

Served over HTTPS (or from localhost) the game is a PWA: Chrome on Android
offers **Add to home screen**, Safari on iOS has **Share → Add to Home Screen**.
It then opens full-screen without browser chrome, and works with no network at
all — the service worker precaches every file on first visit.

## How to run

Either works — there is no build step, no dependency and no network call.

**Just open the file**

```
double-click index.html
```

The scripts are plain `<script>` tags (not ES modules) precisely so that
`file://` works.

**Or serve it locally** (recommended, and required to exercise the service
worker: `file://` has no service worker, so the install and offline behaviour
only appear over http)

```
python3 -m http.server 8000
```

then open <http://localhost:8000>. Any free port will do if 8000 is taken.

## Controls

Mouse or trackpad only: drag pieces and shapes, click cards and buttons.
Top-right: 🌐 language toggle, 🔈 sound on/off.

## Privacy

Nothing is collected, sent or logged. There are no analytics, no fonts or images
fetched from the network, and no external requests of any kind — all artwork is
drawn with canvas and inline SVG, and every sound is synthesised with WebAudio at
play time.

**Photographs never leave the device.** They are stored only in this site's own
IndexedDB, they are never uploaded anywhere, and the service worker refuses to
touch anything that is not a same-origin request. Removing a picture in the game
deletes it; clearing the site's data removes them all.

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
js/games/slide.js
js/games/sequence.js
js/app.js           screens, progress, language & sound, win overlay
js/photos.js        the child's photos: decode, downscale, keep (IndexedDB)
manifest.webmanifest  name, icons, colours and scope for installing
sw.js               precaches the shell and serves it offline
icons/              app icons: the source SVGs and the PNGs drawn from them
.nojekyll           tells GitHub Pages to publish the files exactly as they are
```

`icons/` is the one folder of binary assets the project allows itself, because
an installed app has to hand the operating system a real PNG. The SVGs they are
drawn from ship beside them, so they can be changed and redrawn:

```
rsvg-convert -w 192 -h 192 icons/icon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/icon-512.png
rsvg-convert -w 192 -h 192 icons/icon-maskable.svg -o icons/icon-maskable-192.png
rsvg-convert -w 512 -h 512 icons/icon-maskable.svg -o icons/icon-maskable-512.png
rsvg-convert -w 180 -h 180 icons/icon.svg -o icons/apple-touch-icon.png
```

## Deploy to GitHub Pages

The site is published from the repository exactly as it stands — no build, no
action, no gh-pages branch. It ends up at:

**<https://benrachmut.github.io/kid-puzzle/>**

Every path in the project is relative, which is what lets the same files work
from `file://`, from `localhost`, and under the `/kid-puzzle/` sub-path Pages
serves a project site from.

### First publication

```bash
# 1. Create the repository under the benrachmut account, from this folder.
#    Either with the GitHub CLI:
gh repo create benrachmut/kid-puzzle --public --source=. --remote=origin

#    ...or create an empty repo named kid-puzzle on github.com first, then:
git remote add origin https://github.com/benrachmut/kid-puzzle.git

# 2. Push the branch this project lives on.
git push -u origin master
```

3. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **master**, folder: **/ (root)**
   - **Save**

The first build takes about a minute. Pages serves over HTTPS, which is what
the service worker needs; Chrome offers to install the game once it has seen
the manifest and a registered worker.

`.nojekyll` is in the repository root so that Pages publishes every file
verbatim instead of running Jekyll over them.

### Publishing a change

```bash
git push
```

Pages rebuilds by itself within a minute or so.

### Bumping the service worker cache version

This is the one manual step, and skipping it is the one way to ship a change
nobody sees. The worker serves from its cache first and never waits on the
network, so a device that already has the game keeps playing the old files
until the cache name changes.

In [`sw.js`](sw.js), bump the version:

```js
var CACHE_VERSION = 'v2';   /* was 'v1' */
```

then commit and push it with the change it belongs to. On the next launch the
worker installs the new files under `kid-puzzle-v2`, deletes `kid-puzzle-v1`,
and the launch after that is the new version.

## Browser support

Any current Chrome, Edge, Firefox or Safari. Requires Pointer Events,
`aspect-ratio`, CSS custom properties and WebAudio; if WebAudio is missing or
blocked the game stays fully playable and silent.

Everything the photo and install features need degrades rather than breaks: no
service worker (or `file://`) means no offline, no IndexedDB means pictures last
only as long as the tab, and a picture the browser cannot decode is refused with
a message. None of it stops the drawn games from being played.
