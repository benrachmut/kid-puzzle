/**
 * Application shell: menus, progress, language and sound, and the celebration.
 *
 * The shell owns navigation and persistence; each game module owns only its own
 * board. That split is what lets the language toggle repaint every label
 * mid-puzzle without the running game losing a single placed piece.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});
  var util = KP.util;
  var i18n = KP.i18n;

  var GAME_ORDER = ['jigsaw', 'match', 'memory', 'slide', 'sequence'];
  /* A photo track is an ordinary game as far as stars and unlocking go; it just
     borrows another game's board and feeds it a photo instead of a drawn scene.
     Keeping the progress id apart from the module id is what lets the two tracks
     reuse the jigsaw and slide ladders without sharing their stars. */
  var PHOTO_TRACKS = { photoJigsaw: 'jigsaw', photoSlide: 'slide' };
  var PHOTO_TRACK_ORDER = ['photoJigsaw', 'photoSlide'];
  var HOME_PREVIEW_SIZE = 160;

  var progress = KP.storage.load();
  var current = { gameId: null, levelIndex: 0, instance: null, photo: null };
  /* Bumped on every teardown, so a photo that finishes decoding after the child
     has already walked away is dropped instead of mounted into a dead screen. */
  var mountToken = 0;
  /* Bumped on every picture the child picks, so a slow decode that lands after
     they have picked again - or walked off the screen - cannot fire a reward
     sound or write a note on a screen nobody is looking at. */
  var importToken = 0;

  var dom = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    dom.back = $('btn-back');
    dom.sound = $('btn-sound');
    dom.lang = $('btn-lang');
    dom.langIcon = $('btn-lang-icon');
    dom.screens = {
      home: $('screen-home'),
      photos: $('screen-photos'),
      photoGame: $('screen-photo-game'),
      levels: $('screen-levels'),
      game: $('screen-game')
    };
    dom.homeGrid = $('home-grid');
    dom.photoGrid = $('photo-grid');
    dom.photoGameGrid = $('photo-game-grid');
    dom.photoWorking = $('photo-working');
    dom.photoError = $('photo-error');
    dom.photoHint = $('photo-hint');
    dom.takeInput = $('input-take');
    dom.pickInput = $('input-pick');
    dom.levelGrid = $('level-grid');
    dom.gameMount = $('game-mount');
    dom.overlay = $('overlay-win');
    dom.winStars = $('win-stars');
    dom.next = $('btn-next');
    dom.replay = $('btn-replay');
    dom.home = $('btn-home');
  }

  /** The board a track plays on: its own module, or the one it borrows. */
  function moduleFor(gameId) {
    return KP.games[PHOTO_TRACKS[gameId] || gameId];
  }

  function isPhotoTrack(gameId) {
    return Object.prototype.hasOwnProperty.call(PHOTO_TRACKS, gameId);
  }

  function starsFor(gameId, levelIndex) {
    var levels = progress.stars[gameId] || {};
    var value = levels[levelIndex];
    return typeof value === 'number' ? value : 0;
  }

  function totalStars(gameId) {
    var module = moduleFor(gameId);
    var sum = 0;
    for (var i = 0; i < module.levelCount; i++) sum += starsFor(gameId, i);
    return sum;
  }

  /** A level opens once the previous one has been finished at least once. */
  function isUnlocked(gameId, levelIndex) {
    return levelIndex === 0 || starsFor(gameId, levelIndex - 1) > 0;
  }

  /** Repaints an existing `.stars` container - the win overlay owns its own. */
  function fillStars(row, earned, max) {
    util.clear(row);
    for (var i = 0; i < max; i++) {
      var slot = util.el('span', i < earned ? 'is-earned' : '');
      slot.innerHTML = KP.art.icon('star');
      row.appendChild(slot);
    }
    return row;
  }

  function starRow(earned, max) {
    return fillStars(util.el('div', 'stars'), earned, max);
  }

  function showScreen(name) {
    Object.keys(dom.screens).forEach(function (key) {
      dom.screens[key].classList.toggle('is-active', key === name);
    });
    dom.back.hidden = name === 'home';
  }

  /**
   * Paints one quadrant of a jigsaw scene at a fixed size for the home card.
   * Drawn rather than cached as an image so the menu needs no asset files.
   */
  function quadrantCanvas(scene, col, row) {
    var canvas = util.el('canvas');
    var dpr = global.devicePixelRatio || 1;
    var size = HOME_PREVIEW_SIZE / 2;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    /* The backing store is in device pixels, so the CSS size has to be stated
       explicitly: without it a retina screen lays the canvas out at 2x and the
       four quadrants overflow the card. */
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    var ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(-col * size, -row * size);
    KP.art.paintScene(scene, ctx, HOME_PREVIEW_SIZE, HOME_PREVIEW_SIZE);
    return canvas;
  }

  function homeArtwork(gameId) {
    var art = util.el('div', 'game-card__art');
    if (gameId === 'jigsaw' || gameId === 'slide') {
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (cell) {
        art.appendChild(quadrantCanvas(gameId === 'slide' ? 'space' : 'meadow', cell[0], cell[1]));
      });
    } else if (gameId === 'sequence') {
      /* An ABAB run, which is exactly what the game asks the child to continue. */
      [['circle', 'red'], ['star', 'blue'], ['circle', 'red'], ['star', 'blue']]
        .forEach(function (pair) {
          var cell = util.el('div');
          cell.innerHTML = KP.art.shape(pair[0], pair[1], false);
          art.appendChild(cell);
        });
    } else if (gameId === 'match') {
      [['circle', 'red'], ['square', 'blue'], ['triangle', 'green'], ['star', 'purple']]
        .forEach(function (pair) {
          var cell = util.el('div');
          cell.innerHTML = KP.art.shape(pair[0], pair[1], false);
          art.appendChild(cell);
        });
    } else {
      ['sun', 'fish', 'flower', 'balloon'].forEach(function (id) {
        var cell = util.el('div');
        cell.innerHTML = KP.art.picture(id);
        art.appendChild(cell);
      });
    }
    return art;
  }

  function renderHome() {
    util.clear(dom.homeGrid);
    GAME_ORDER.forEach(function (gameId) {
      var module = moduleFor(gameId);
      var card = util.el('button', 'btn game-card', { type: 'button' });
      card.setAttribute('aria-label', i18n.t('game.' + gameId));
      card.appendChild(homeArtwork(gameId));

      var name = util.el('span', 'game-card__name');
      name.textContent = i18n.t('game.' + gameId);
      card.appendChild(name);
      card.appendChild(starRow(totalStars(gameId), module.levelCount * 3));

      card.addEventListener('click', function () {
        KP.audio.play('click');
        openLevels(gameId);
      });
      dom.homeGrid.appendChild(card);
    });
    dom.homeGrid.appendChild(photoCard());
  }

  /* ---------- the child's own pictures ---------- */

  /**
   * The camera card. It carries no star row on purpose: it is a doorway to the
   * two photo tracks rather than a game with a ladder of its own.
   */
  function photoCard() {
    var card = util.el('button', 'btn game-card', { type: 'button' });
    var art = util.el('div', 'game-card__art game-card__art--single');
    var glyph = util.el('div', 'photo-card__glyph');

    card.setAttribute('aria-label', i18n.t('game.photos'));
    glyph.innerHTML = KP.art.icon('camera');
    art.appendChild(glyph);
    card.appendChild(art);

    var name = util.el('span', 'game-card__name');
    name.textContent = i18n.t('game.photos');
    card.appendChild(name);

    card.addEventListener('click', function () {
      KP.audio.play('click');
      openPhotos();
    });
    return card;
  }

  function setNote(node, visible) {
    node.hidden = !visible;
  }

  /**
   * One saved picture: tap it to play, tap the bin to be asked once.
   * The confirmation is a pair of big coloured buttons rather than a dialog,
   * because a 6-year-old deletes by accident and cannot read "are you sure".
   */
  function photoTile(record) {
    var tile = util.el('div', 'photo-tile');

    var open = util.el('button', 'photo-tile__open', {
      type: 'button', 'data-i18n-aria': 'photos.item'
    });
    var img = util.el('img', '', { alt: '' });
    img.src = record.thumb;
    open.appendChild(img);

    var bin = util.el('button', 'photo-tile__del', {
      type: 'button', 'data-i18n-aria': 'photos.delete'
    });
    bin.innerHTML = KP.art.icon('trash');

    var confirm = util.el('div', 'photo-tile__confirm');
    var yes = util.el('button', 'photo-tile__answer photo-tile__answer--yes', {
      type: 'button', 'data-i18n-aria': 'photos.deleteYes'
    });
    var no = util.el('button', 'photo-tile__answer photo-tile__answer--no', {
      type: 'button', 'data-i18n-aria': 'photos.deleteNo'
    });
    yes.innerHTML = KP.art.icon('yes');
    no.innerHTML = KP.art.icon('no');
    confirm.appendChild(yes);
    confirm.appendChild(no);

    open.addEventListener('click', function () {
      KP.audio.play('click');
      openPhotoGames(record);
    });
    bin.addEventListener('click', function () {
      KP.audio.play('click');
      closeConfirmations();
      tile.classList.add('is-confirming');
    });
    no.addEventListener('click', function () {
      KP.audio.play('click');
      tile.classList.remove('is-confirming');
    });
    /* Per tile, not per screen: a shared flag would also refuse a delete of a
       *different* picture that is already confirmed, and swallow that tap
       silently. */
    var removing = false;
    yes.addEventListener('click', function () {
      /* Two taps on "yes" must not run two deletes and two re-renders. */
      if (removing) return;
      removing = true;
      KP.audio.play('drop');
      KP.photos.remove(record.id).then(function () {
        removing = false;
        renderPhotoGrid();
      });
    });

    tile.appendChild(open);
    tile.appendChild(bin);
    tile.appendChild(confirm);
    return tile;
  }

  function closeConfirmations() {
    var open = dom.photoGrid.querySelectorAll('.is-confirming');
    for (var i = 0; i < open.length; i++) open[i].classList.remove('is-confirming');
  }

  function renderPhotoGrid() {
    return KP.photos.list().then(function (rows) {
      util.clear(dom.photoGrid);
      /* Only worth saying once storage has actually been tried and found wanting. */
      setNote(dom.photoHint, !KP.photos.isPersistent());

      if (!rows.length) {
        var empty = util.el('p', 'photo-grid__empty', { 'data-i18n': 'photos.empty' });
        empty.textContent = i18n.t('photos.empty');
        dom.photoGrid.appendChild(empty);
        return;
      }
      rows.forEach(function (record) { dom.photoGrid.appendChild(photoTile(record)); });
      i18n.apply(dom.photoGrid);
    });
  }

  /**
   * A file arriving from the camera or the gallery.
   * Every failure a child can produce - cancelling the picker, an iPhone HEIC
   * this browser cannot read, a file that is not a picture at all - ends as the
   * same friendly line rather than as a broken screen.
   */
  function handlePicked(input) {
    var file = input.files && input.files[0];
    /* Clearing the field matters: choosing the same picture twice in a row fires
       no change event otherwise, and the second attempt would look broken. */
    input.value = '';
    if (!file) return;

    importToken += 1;
    var token = importToken;

    /** Is this still the import the child is waiting on, on the screen for it? */
    function stillWanted() {
      return token === importToken &&
        dom.screens.photos.classList.contains('is-active');
    }

    setNote(dom.photoError, false);
    setNote(dom.photoWorking, true);

    KP.photos.decode(file).then(function (canvas) {
      return canvas ? KP.photos.save(canvas) : null;
    }).then(function (record) {
      /* The picture is kept either way - only the reporting is abandoned. The
         photo screen re-renders its grid whenever it is opened. */
      if (!stillWanted()) return null;
      setNote(dom.photoWorking, false);
      if (!record) {
        setNote(dom.photoError, true);
        KP.audio.play('wrong');
        return null;
      }
      KP.audio.play('correct');
      return renderPhotoGrid();
    });
  }

  /**
   * Shows the chosen picture cut the way each track will cut it - four jigsaw
   * pieces, or a sliding grid with its gap - so the choice reads without words.
   */
  function trackPreview(trackId, record) {
    var cols = trackId === 'photoSlide' ? 3 : 2;
    var total = cols * cols;
    var preview = util.el('div', 'photo-preview');
    preview.style.setProperty('grid-template-columns', 'repeat(' + cols + ', 1fr)');
    preview.style.setProperty('--thumb', 'url(' + record.thumb + ')');
    preview.style.setProperty('--zoom', (cols * 100) + '%');

    for (var i = 0; i < total; i++) {
      /* The sliding puzzle always has exactly one empty square. */
      var isGap = trackId === 'photoSlide' && i === total - 1;
      var cell = util.el('span', isGap ? 'is-gap' : '');
      cell.style.setProperty('--px', ((i % cols) / (cols - 1) * 100) + '%');
      cell.style.setProperty('--py', (Math.floor(i / cols) / (cols - 1) * 100) + '%');
      preview.appendChild(cell);
    }
    return preview;
  }

  function renderPhotoGames() {
    util.clear(dom.photoGameGrid);
    if (!current.photo) return;

    PHOTO_TRACK_ORDER.forEach(function (trackId) {
      var module = moduleFor(trackId);
      var card = util.el('button', 'btn game-card', { type: 'button' });
      var art = util.el('div', 'game-card__art game-card__art--single');

      card.setAttribute('aria-label', i18n.t('game.' + trackId));
      art.appendChild(trackPreview(trackId, current.photo));
      card.appendChild(art);

      var name = util.el('span', 'game-card__name');
      name.textContent = i18n.t('game.' + trackId);
      card.appendChild(name);
      card.appendChild(starRow(totalStars(trackId), module.levelCount * 3));

      card.addEventListener('click', function () {
        KP.audio.play('click');
        openLevels(trackId);
      });
      dom.photoGameGrid.appendChild(card);
    });
  }

  function openPhotos() {
    destroyGame();
    current.gameId = null;
    current.photo = null;
    setNote(dom.photoError, false);
    setNote(dom.photoWorking, false);
    showScreen('photos');
    renderPhotoGrid();
  }

  function openPhotoGames(record) {
    current.photo = record;
    renderPhotoGames();
    showScreen('photoGame');
  }

  /** Small abstract picture of what a level looks like: its grid or its count. */
  function levelPreview(gameId, levelIndex) {
    var preview = util.el('div', 'level-btn__preview');
    var level = moduleFor(gameId).levels[levelIndex];
    var cols;
    var cells;
    if (level.cols) {
      cols = level.cols;
      cells = level.cols * level.rows;
    } else if (level.template) {
      cols = level.template.length;
      cells = level.template.length;
    } else {
      cols = Math.min(3, level.count);
      cells = level.count;
    }
    preview.style.setProperty('grid-template-columns', 'repeat(' + cols + ', 1fr)');
    for (var i = 0; i < cells; i++) preview.appendChild(util.el('span'));
    return preview;
  }

  function renderLevels() {
    util.clear(dom.levelGrid);
    if (!current.gameId) return;
    var gameId = current.gameId;
    var module = moduleFor(gameId);

    for (var index = 0; index < module.levelCount; index++) {
      (function (levelIndex) {
        var unlocked = isUnlocked(gameId, levelIndex);
        var button = util.el('button', 'btn level-btn' + (unlocked ? '' : ' is-locked'), {
          type: 'button'
        });
        button.setAttribute('aria-label',
          i18n.t(unlocked ? 'ui.level' : 'ui.locked') + ' ' + (levelIndex + 1));
        button.disabled = !unlocked;

        var number = util.el('span', 'level-btn__num');
        number.textContent = String(levelIndex + 1);
        button.appendChild(number);

        if (unlocked) {
          button.appendChild(levelPreview(gameId, levelIndex));
          button.appendChild(starRow(starsFor(gameId, levelIndex), 3));
        } else {
          var lock = util.el('span', 'level-btn__lock');
          lock.innerHTML = KP.art.icon('lock');
          button.appendChild(lock);
        }

        button.addEventListener('click', function () {
          if (!isUnlocked(gameId, levelIndex)) return;
          KP.audio.play('click');
          startLevel(gameId, levelIndex);
        });
        dom.levelGrid.appendChild(button);
      })(index);
    }
  }

  function openLevels(gameId) {
    destroyGame();
    current.gameId = gameId;
    renderLevels();
    showScreen('levels');
  }

  function destroyGame() {
    /* Any photo still decoding for a level we are leaving must not mount. */
    mountToken += 1;
    /* Removing the board removes the node a drag is captured on, so the drag
       has to be released here or no piece can ever be picked up again. */
    KP.drag.cancel();
    if (current.instance) {
      current.instance.destroy();
      current.instance = null;
    }
    util.clear(dom.gameMount);
  }

  function startLevel(gameId, levelIndex) {
    destroyGame();
    hideOverlay();
    current.gameId = gameId;
    current.levelIndex = levelIndex;
    showScreen('game');

    if (!isPhotoTrack(gameId)) {
      mountLevel(null);
      return;
    }

    /* A photo track decodes its picture afresh for every attempt, so each board
       is handed a canvas of its own and may do what it likes with it. */
    var token = mountToken;
    KP.photos.get(current.photo ? current.photo.id : null).then(function (image) {
      if (token !== mountToken) return;
      if (!image) {
        /* The picture was deleted in another tab, or has become unreadable.
           Saying so beats a board painted with a drawn scene the child did not
           choose. */
        openPhotos();
        setNote(dom.photoError, true);
        return;
      }
      mountLevel(image);
    });
  }

  /**
   * Builds the board itself. `image` is the photo a photo track plays on, and
   * null for the drawn games - the module falls back to its own scene then.
   */
  function mountLevel(image) {
    /* The game screen must be visible before the jigsaw measures its stage,
       otherwise every size reads as zero and the board collapses. */
    current.instance = moduleFor(current.gameId).create(dom.gameMount, current.levelIndex, {
      onComplete: function (stars) { completeLevel(stars); },
      image: image
    });
    i18n.apply(dom.gameMount);
  }

  function completeLevel(stars) {
    var gameId = current.gameId;
    var levels = progress.stars[gameId] || (progress.stars[gameId] = {});
    levels[current.levelIndex] = Math.max(starsFor(gameId, current.levelIndex), stars);
    KP.storage.save(progress);

    fillStars(dom.winStars, stars, 3);
    dom.overlay.classList.add('is-active');
    KP.audio.play('win');
    KP.confetti.start();
    dom.next.focus();
  }

  function hideOverlay() {
    dom.overlay.classList.remove('is-active');
    KP.confetti.stop();
  }

  /** Advances to the next level, or back to the level menu after the last one. */
  function goNext() {
    KP.audio.play('click');
    var module = moduleFor(current.gameId);
    var nextIndex = current.levelIndex + 1;
    hideOverlay();
    if (nextIndex < module.levelCount) {
      startLevel(current.gameId, nextIndex);
    } else {
      destroyGame();
      renderLevels();
      showScreen('levels');
    }
  }

  function applyLanguage(lang) {
    i18n.setLang(lang);
    document.documentElement.setAttribute('lang', i18n.htmlLang());
    document.documentElement.setAttribute('dir', i18n.dir());
    i18n.apply(document);
    renderHome();
    renderLevels();
    renderPhotoGames();
    updateSoundButton();
    /* Direction and font metrics can change the available width, so the running
       puzzle recomputes its geometry - without rebuilding, keeping its state. */
    if (current.instance) current.instance.relayout();
  }

  function updateSoundButton() {
    var on = KP.audio.isEnabled();
    dom.sound.innerHTML = KP.art.icon(on ? 'soundOn' : 'soundOff');
    dom.sound.setAttribute('aria-label', i18n.t(on ? 'ui.soundOn' : 'ui.soundOff'));
  }

  function toggleSound() {
    var next = !KP.audio.isEnabled();
    KP.audio.setEnabled(next);
    progress.sound = next;
    KP.storage.save(progress);
    updateSoundButton();
    if (next) KP.audio.play('click');
  }

  function toggleLanguage() {
    KP.audio.play('click');
    var next = i18n.other();
    progress.lang = next;
    KP.storage.save(progress);
    applyLanguage(next);
  }

  /**
   * One step back along the route the child walked in on:
   * board -> levels -> (which game?) -> pictures -> home.
   */
  function goBack() {
    KP.audio.play('click');
    hideOverlay();

    if (dom.screens.game.classList.contains('is-active')) {
      destroyGame();
      renderLevels();
      showScreen('levels');
      return;
    }
    if (dom.screens.levels.classList.contains('is-active') && isPhotoTrack(current.gameId)) {
      destroyGame();
      renderPhotoGames();
      showScreen('photoGame');
      return;
    }
    if (dom.screens.photoGame.classList.contains('is-active')) {
      openPhotos();
      return;
    }
    destroyGame();
    current.gameId = null;
    current.photo = null;
    renderHome();
    showScreen('home');
  }

  function goHome() {
    KP.audio.play('click');
    hideOverlay();
    destroyGame();
    current.gameId = null;
    current.photo = null;
    renderHome();
    showScreen('home');
  }

  function init() {
    cacheDom();
    dom.langIcon.innerHTML = KP.art.icon('globe');
    dom.back.innerHTML = KP.art.icon('back');
    dom.home.innerHTML = KP.art.icon('home');
    dom.replay.innerHTML = KP.art.icon('replay');
    dom.next.appendChild((function () {
      var span = util.el('span', 'btn__glyph');
      span.innerHTML = KP.art.icon('next');
      return span;
    })());

    KP.audio.setEnabled(progress.sound !== false);
    applyLanguage(progress.lang || i18n.getLang());
    showScreen('home');

    $('glyph-take').innerHTML = KP.art.icon('camera');
    $('glyph-pick').innerHTML = KP.art.icon('gallery');
    dom.takeInput.addEventListener('change', function () { handlePicked(dom.takeInput); });
    dom.pickInput.addEventListener('change', function () { handlePicked(dom.pickInput); });

    dom.back.addEventListener('click', goBack);
    dom.home.addEventListener('click', goHome);
    dom.sound.addEventListener('click', toggleSound);
    dom.lang.addEventListener('click', toggleLanguage);
    dom.next.addEventListener('click', goNext);
    dom.replay.addEventListener('click', function () {
      KP.audio.play('click');
      startLevel(current.gameId, current.levelIndex);
    });

    /* Browsers only allow an AudioContext to start inside a user gesture. */
    document.addEventListener('pointerdown', function unlockAudio() {
      document.removeEventListener('pointerdown', unlockAudio);
      KP.audio.unlock();
    });

    global.addEventListener('resize', util.debounce(function () {
      if (current.instance) current.instance.relayout();
    }, 120));
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
