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
    { count: 6, shapes: 3, colors: 3, distinct: false }
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

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    var items = buildItems(level);

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

    util.shuffle(items).forEach(function (item) {
      var node = util.el('div', 'match__piece', { role: 'img', 'data-i18n-aria': 'match.item' });
      node.innerHTML = KP.art.shape(item.shape, item.color, false);
      pieceRow.appendChild(node);
      node.addEventListener('pointerdown', function (ev) { onPointerDown(ev, item, node); });
    });

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

          if (!state.moved) return;

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
