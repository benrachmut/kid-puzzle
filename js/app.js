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
  var HOME_PREVIEW_SIZE = 160;

  var progress = KP.storage.load();
  var current = { gameId: null, levelIndex: 0, instance: null };

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
      levels: $('screen-levels'),
      game: $('screen-game')
    };
    dom.homeGrid = $('home-grid');
    dom.levelGrid = $('level-grid');
    dom.gameMount = $('game-mount');
    dom.overlay = $('overlay-win');
    dom.winStars = $('win-stars');
    dom.next = $('btn-next');
    dom.replay = $('btn-replay');
    dom.home = $('btn-home');
  }

  function starsFor(gameId, levelIndex) {
    var levels = progress.stars[gameId] || {};
    var value = levels[levelIndex];
    return typeof value === 'number' ? value : 0;
  }

  function totalStars(gameId) {
    var module = KP.games[gameId];
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
      var module = KP.games[gameId];
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
  }

  /** Small abstract picture of what a level looks like: its grid or its count. */
  function levelPreview(gameId, levelIndex) {
    var preview = util.el('div', 'level-btn__preview');
    var level = KP.games[gameId].levels[levelIndex];
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
    var module = KP.games[gameId];

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
    /* The game screen must be visible before the jigsaw measures its stage,
       otherwise every size reads as zero and the board collapses. */
    current.instance = KP.games[gameId].create(dom.gameMount, levelIndex, {
      onComplete: function (stars) { completeLevel(stars); }
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
    var module = KP.games[current.gameId];
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

  function goBack() {
    KP.audio.play('click');
    hideOverlay();
    if (dom.screens.game.classList.contains('is-active')) {
      destroyGame();
      renderLevels();
      showScreen('levels');
      return;
    }
    destroyGame();
    current.gameId = null;
    renderHome();
    showScreen('home');
  }

  function goHome() {
    KP.audio.play('click');
    hideOverlay();
    destroyGame();
    current.gameId = null;
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
