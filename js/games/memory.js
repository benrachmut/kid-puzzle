/**
 * Memory pairs: flip two cards, keep them if the pictures match.
 *
 * The only real hazard here is input during the compare animation — a child
 * clicks fast and would otherwise be able to open three or four cards at once,
 * so every click passes a `busy` gate and the pending timer is cancelled on
 * teardown.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});
  KP.games = KP.games || {};

  var util = KP.util;

  var LEVELS = [
    { cols: 2, rows: 2 },
    { cols: 3, rows: 2 },
    { cols: 4, rows: 3 },
    { cols: 4, rows: 4 }
  ];

  var HIDE_DELAY_MS = 900;

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    var pairCount = (level.cols * level.rows) / 2;
    var pictures = util.pick(KP.art.PICTURE_IDS, pairCount);

    var deck = [];
    pictures.forEach(function (id) {
      deck.push(id);
      deck.push(id);
    });
    deck = util.shuffle(deck);

    var grid = util.el('div', 'memory', { role: 'group' });
    grid.style.setProperty('--cols', level.cols);
    grid.style.setProperty('--rows', level.rows);
    mount.appendChild(grid);

    var cards = [];
    var open = [];
    var matched = 0;
    var mistakes = 0;
    var busy = false;
    var finished = false;
    var hideTimer = null;
    var winTimer = null;

    deck.forEach(function (pictureId) {
      var node = util.el('button', 'btn memory__card', { type: 'button', 'data-i18n-aria': 'memory.card' });
      var inner = util.el('div', 'memory__inner');
      var back = util.el('div', 'memory__face memory__face--back');
      var front = util.el('div', 'memory__face memory__face--front');
      back.innerHTML = KP.art.icon('star');
      front.innerHTML = KP.art.picture(pictureId);
      inner.appendChild(back);
      inner.appendChild(front);
      node.appendChild(inner);
      grid.appendChild(node);

      var card = { pictureId: pictureId, node: node, open: false, matched: false };
      cards.push(card);
      node.addEventListener('click', function () { onCardClick(card); });
    });

    function setOpen(card, isOpen) {
      card.open = isOpen;
      card.node.classList.toggle('is-open', isOpen);
    }

    function checkComplete() {
      if (finished || matched < cards.length) return;
      finished = true;
      winTimer = global.setTimeout(function () {
        winTimer = null;
        callbacks.onComplete(util.starsForMistakes(mistakes));
      }, 450);
    }

    function resolvePair() {
      var first = open[0];
      var second = open[1];
      open = [];

      if (first.pictureId === second.pictureId) {
        first.matched = true;
        second.matched = true;
        first.node.classList.add('is-matched');
        second.node.classList.add('is-matched');
        first.node.disabled = true;
        second.node.disabled = true;
        matched += 2;
        KP.audio.play('correct');
        checkComplete();
        return;
      }

      mistakes++;
      KP.audio.play('wrong');
      busy = true;
      hideTimer = global.setTimeout(function () {
        hideTimer = null;
        setOpen(first, false);
        setOpen(second, false);
        busy = false;
      }, HIDE_DELAY_MS);
    }

    function onCardClick(card) {
      if (finished || busy || card.open || card.matched) return;
      setOpen(card, true);
      KP.audio.play('flip');
      open.push(card);
      if (open.length === 2) resolvePair();
    }

    return {
      /* The grid is CSS-driven and reflows by itself; nothing to recompute. */
      relayout: function () {},
      destroy: function () {
        finished = true;
        if (hideTimer !== null) global.clearTimeout(hideTimer);
        if (winTimer !== null) global.clearTimeout(winTimer);
        hideTimer = null;
        winTimer = null;
        util.clear(mount);
      }
    };
  }

  KP.games.memory = { id: 'memory', levelCount: LEVELS.length, levels: LEVELS, create: create };
})(window);
