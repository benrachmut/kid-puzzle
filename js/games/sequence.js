/**
 * Pattern completion: a row of shapes runs to a gap, and the child picks which
 * of three choices continues it.
 *
 * Difficulty is carried entirely by the repeating template, not by the number
 * of shapes: ABAB is obvious to a five-year-old, AABB and ABCB are not.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});
  KP.games = KP.games || {};

  var util = KP.util;

  /* `template` indexes into the level's item set and repeats to fill `length`;
     the last cell is always the gap. */
  var LEVELS = [
    { template: [0, 1], length: 7, rounds: 3 },
    { template: [0, 1, 2], length: 7, rounds: 3 },
    { template: [0, 0, 1, 1], length: 9, rounds: 3 },
    { template: [0, 1, 2, 1], length: 9, rounds: 3 }
  ];

  var CHOICE_COUNT = 3;

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    var distinct = Math.max.apply(null, level.template) + 1;

    var root = util.el('div', 'board seq');
    var row = util.el('div', 'seq__row', { role: 'group', 'data-i18n-aria': 'sequence.row' });
    var choicesRow = util.el('div', 'seq__choices', { role: 'group', 'data-i18n-aria': 'sequence.choices' });
    root.appendChild(row);
    root.appendChild(choicesRow);
    mount.appendChild(root);

    var round = 0;
    var mistakes = 0;
    var busy = false;
    var finished = false;
    var timer = null;

    /** One puzzle: the visible run, the answer, and two wrong choices. */
    function buildRound() {
      var shapes = util.pick(KP.art.SHAPE_IDS, distinct + 1);
      var colors = util.pick(KP.art.COLOR_IDS, distinct + 1);
      var items = [];
      for (var i = 0; i < distinct + 1; i++) {
        items.push({ shape: shapes[i], color: colors[i] });
      }

      var cells = [];
      for (var position = 0; position < level.length; position++) {
        cells.push(items[level.template[position % level.template.length]]);
      }
      var answer = cells[level.length - 1];

      /* Wrong choices are drawn from the pattern's own vocabulary plus one
         outsider, so guessing by "which one looks new" does not work. */
      var wrong = items.filter(function (item) { return item !== answer; });
      var choices = util.shuffle([answer].concat(util.pick(wrong, CHOICE_COUNT - 1)));

      return { cells: cells.slice(0, level.length - 1), answer: answer, choices: choices };
    }

    function shapeNode(className, item, extraAttrs) {
      var node = util.el('div', className, extraAttrs);
      node.innerHTML = KP.art.shape(item.shape, item.color, false);
      return node;
    }

    function renderRound() {
      var data = buildRound();
      util.clear(row);
      util.clear(choicesRow);

      data.cells.forEach(function (item) {
        row.appendChild(shapeNode('seq__cell', item, { role: 'img' }));
      });
      var gapNode = util.el('div', 'seq__cell seq__gap', { 'data-i18n-aria': 'sequence.gap' });
      gapNode.textContent = '?';
      row.appendChild(gapNode);

      data.choices.forEach(function (item) {
        var node = shapeNode('seq__choice', item, {
          role: 'button', tabindex: '0', 'data-i18n-aria': 'sequence.choices'
        });
        node.addEventListener('click', function () { choose(item === data.answer, node, gapNode, item); });
        /* role="button" on a div gets no click from the keyboard by itself. */
        node.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
          ev.preventDefault();
          choose(item === data.answer, node, gapNode, item);
        });
        choicesRow.appendChild(node);
      });
      /* Rounds after the first are built long after the shell applied the
         translations, so these subtrees have to be labelled again. */
      KP.i18n.apply(row);
      KP.i18n.apply(choicesRow);
    }

    /** `busy` stops a double click from scoring the same round twice. */
    function choose(correct, node, gapNode, item) {
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
      gapNode.textContent = '';
      gapNode.innerHTML = KP.art.shape(item.shape, item.color, false);
      gapNode.classList.remove('seq__gap');
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
      }, 600);
    }

    renderRound();

    return {
      /* Flow layout with wrapping rows; nothing to recompute on resize. */
      relayout: function () {},
      destroy: function () {
        finished = true;
        if (timer !== null) global.clearTimeout(timer);
        timer = null;
        util.clear(mount);
      }
    };
  }

  KP.games.sequence = { id: 'sequence', levelCount: LEVELS.length, levels: LEVELS, create: create };
})(window);
