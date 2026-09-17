/**
 * Shape & colour matching: drag each solid shape onto its pale outline.
 *
 * Drop targets are found by hit-testing the targets' bounding rectangles rather
 * than with elementFromPoint, because the dragged piece sits under the pointer
 * and pointer capture makes it unreliable to "see through" it. Rectangles are
 * read at drop time, so a window resize mid-drag cannot desynchronise them.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});
  KP.games = KP.games || {};

  var util = KP.util;

  /* Later levels reuse shapes and colours, so a child must match both
     properties instead of recognising the silhouette alone. */
  var LEVELS = [
    { count: 3, shapes: 3, colors: 3, distinct: true },
    { count: 4, shapes: 4, colors: 4, distinct: true },
    { count: 5, shapes: 3, colors: 3, distinct: false },
    { count: 6, shapes: 3, colors: 3, distinct: false },
    /* Distractors have no target at all, so the child can no longer solve the
       board by elimination and has to read shape and colour together. */
    { count: 5, shapes: 3, colors: 3, distinct: false, distractors: 3 },
    /* A different rule entirely: click the odd one out, three rounds of it. */
    { mode: 'odd', rounds: 3, count: 5 }
  ];

  /**
   * Builds `count` distinct shape+colour combinations for a level.
   * The first two levels give every item its own shape *and* its own colour, so
   * either one is enough to solve them. Later levels draw from the full
   * shape x colour product, which repeats both and forces the child to look at
   * the two properties together - that is the whole difficulty curve here.
   */
  function buildItems(level) {
    var shapes = util.pick(KP.art.SHAPE_IDS, level.shapes);
    var colors = util.pick(KP.art.COLOR_IDS, level.colors);
    if (level.distinct) {
      return shapes.slice(0, level.count).map(function (shape, index) {
        return { key: shape + ':' + colors[index], shape: shape, color: colors[index] };
      });
    }
    var combos = [];
    shapes.forEach(function (shape) {
      colors.forEach(function (color) {
        combos.push({ key: shape + ':' + color, shape: shape, color: color });
      });
    });
    return util.shuffle(combos).slice(0, level.count);
  }

  /**
   * Odd-one-out round: every shape shares one look except a single intruder
   * that differs in shape or in colour. Returns the items plus the odd index.
   */
  function buildOddRound(count) {
    var shapes = util.pick(KP.art.SHAPE_IDS, 2);
    var colors = util.pick(KP.art.COLOR_IDS, 2);
    var odd = Math.random() < 0.5
      ? { shape: shapes[1], color: colors[0] }
      : { shape: shapes[0], color: colors[1] };
    var items = [];
    for (var i = 0; i < count - 1; i++) items.push({ shape: shapes[0], color: colors[0] });
    var oddIndex = Math.floor(Math.random() * count);
    items.splice(oddIndex, 0, odd);
    return { items: items, oddIndex: oddIndex };
  }

  function createOdd(mount, level, callbacks) {
    var root = util.el('div', 'match match--odd');
    var row = util.el('div', 'match__row', { role: 'group', 'data-i18n-aria': 'match.odd' });
    root.appendChild(row);
    mount.appendChild(root);

    var round = 0;
    var mistakes = 0;
    var busy = false;
    var finished = false;
    var timer = null;

    /* Long-press on a shape offers to save it as an image on Android. */
    KP.drag.harden(root);

    function renderRound() {
      util.clear(row);
      var data = buildOddRound(level.count);
      data.items.forEach(function (item, index) {
        var node = util.el('div', 'match__piece match__piece--tap', {
          role: 'button', tabindex: '0', 'data-i18n-aria': 'match.odd'
        });
        node.innerHTML = KP.art.shape(item.shape, item.color, false);
        node.addEventListener('click', function () { choose(index === data.oddIndex, node); });
        /* role="button" on a div gets no click from the keyboard by itself. */
        node.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
          ev.preventDefault();
          choose(index === data.oddIndex, node);
        });
        row.appendChild(node);
      });
      /* Rounds after the first are built long after the shell applied the
         translations, so this subtree has to be labelled again. */
      KP.i18n.apply(row);
    }

    /** Guarded by `busy` so a double click cannot score two rounds at once. */
    function choose(correct, node) {
      if (finished || busy) return;
      if (!correct) {
        mistakes++;
        KP.audio.play('wrong');
        node.classList.remove('is-rejected');
        void node.offsetWidth;
        node.classList.add('is-rejected');
        return;
      }
      busy = true;
      KP.audio.play('correct');
      round++;
      timer = global.setTimeout(function () {
        timer = null;
        busy = false;
        if (round >= level.rounds) {
          finished = true;
          callbacks.onComplete(util.starsForMistakes(mistakes));
          return;
        }
        renderRound();
      }, 450);
    }

    renderRound();

    return {
      relayout: function () {},
      destroy: function () {
        finished = true;
        if (timer !== null) global.clearTimeout(timer);
        timer = null;
        util.clear(mount);
      }
    };
  }

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    if (level.mode === 'odd') return createOdd(mount, level, callbacks);
    var items = buildItems(level);
    /* Extra shapes that belong nowhere: drawn from the same shape/colour pool
       but excluded from the targets, so they are only rejected on drop. */
    var lures = [];
    if (level.distractors) {
      var used = {};
      var shapes = [];
      var colors = [];
      items.forEach(function (item) {
        used[item.key] = true;
        if (shapes.indexOf(item.shape) === -1) shapes.push(item.shape);
        if (colors.indexOf(item.color) === -1) colors.push(item.color);
      });
      var pool = [];
      shapes.forEach(function (shape) {
        colors.forEach(function (color) {
          var key = shape + ':' + color;
          if (!used[key]) pool.push({ key: key, shape: shape, color: color });
        });
      });
      lures = util.pick(pool, level.distractors);
    }

    var root = util.el('div', 'match');
    var targetRow = util.el('div', 'match__row match__row--targets', {
      role: 'group', 'data-i18n-aria': 'match.targets'
    });
    var pieceRow = util.el('div', 'match__row match__row--pieces', {
      role: 'group', 'data-i18n-aria': 'match.pieces'
    });
    root.appendChild(targetRow);
    root.appendChild(pieceRow);
    mount.appendChild(root);

    var targets = [];
    var mistakes = 0;
    var filled = 0;
    var finished = false;
    var winTimer = null;

    util.shuffle(items).forEach(function (item) {
      var node = util.el('div', 'match__target', { 'data-i18n-aria': 'match.item' });
      node.innerHTML = KP.art.shape(item.shape, item.color, true);
      targetRow.appendChild(node);
      targets.push({ key: item.key, item: item, node: node, filled: false });
    });

    util.shuffle(items.concat(lures)).forEach(function (item) {
      var node = util.el('div', 'match__piece', { role: 'img', 'data-i18n-aria': 'match.item' });
      node.innerHTML = KP.art.shape(item.shape, item.color, false);
      pieceRow.appendChild(node);
      node.addEventListener('pointerdown', function (ev) { onPointerDown(ev, item, node); });
    });

    /* Long-press and native drag would both fire in the middle of a slow drag. */
    KP.drag.harden(root);

    function clearHot() {
      targets.forEach(function (target) { target.node.classList.remove('is-hot'); });
    }

    /** Returns the free target under the given viewport point, if any. */
    function targetAt(x, y) {
      for (var i = 0; i < targets.length; i++) {
        var rect = targets[i].node.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return targets[i];
        }
      }
      return null;
    }

    function flashRejected(node) {
      node.classList.remove('is-rejected');
      void node.offsetWidth;
      node.classList.add('is-rejected');
    }

    function checkComplete() {
      if (finished || filled < targets.length) return;
      finished = true;
      winTimer = global.setTimeout(function () {
        winTimer = null;
        callbacks.onComplete(util.starsForMistakes(mistakes));
      }, 350);
    }

    function onPointerDown(ev, item, node) {
      if (finished || node.classList.contains('is-used')) return;

      var started = KP.drag.begin(ev, node, {
        onStart: function () {
          node.classList.add('is-dragging');
          KP.audio.play('pickup');
        },
        onMove: function (state) {
          node.style.transform = 'translate(' + state.dx + 'px,' + state.dy + 'px) scale(1.1)';
          clearHot();
          var hover = targetAt(state.x, state.y);
          if (hover && !hover.filled) hover.node.classList.add('is-hot');
        },
        onEnd: function (state) {
          node.classList.remove('is-dragging');
          node.style.transform = '';
          clearHot();

          /* A tap on a piece is not a drop attempt: these pieces are only
             ever dragged, so a stray tap must cost the child nothing. */
          if (state.tap) return;

          var target = targetAt(state.x, state.y);
          if (!target) {
            KP.audio.play('drop');
            return;
          }
          if (target.filled || target.key !== item.key) {
            mistakes++;
            KP.audio.play('wrong');
            flashRejected(node);
            return;
          }

          target.filled = true;
          filled++;
          target.node.classList.add('is-filled');
          target.node.innerHTML = KP.art.shape(item.shape, item.color, false);
          node.classList.add('is-used');
          KP.audio.play('correct');
          checkComplete();
        }
      });

      if (started) ev.preventDefault();
    }

    return {
      /* The matching board is ordinary flow layout, so a resize needs no work
         beyond dropping any hover highlight left over from a drag. */
      relayout: clearHot,
      destroy: function () {
        finished = true;
        if (winTimer !== null) global.clearTimeout(winTimer);
        winTimer = null;
        util.clear(mount);
      }
    };
  }

  KP.games.match = { id: 'match', levelCount: LEVELS.length, levels: LEVELS, create: create };
})(window);
