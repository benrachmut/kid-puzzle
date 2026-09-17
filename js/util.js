/**
 * Small shared helpers. Kept in one place so the three games behave identically
 * for things a child will absolutely do: resize the window, click twice fast,
 * and drag a piece halfway off the screen.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  /** Fisher-Yates on a copy: callers keep their source arrays intact. */
  function shuffle(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function pick(list, count) {
    return shuffle(list).slice(0, count);
  }

  /**
   * Trailing-edge debounce used for resize handling: a drag across the window
   * edge can fire dozens of resize events, and re-laying out the board on each
   * one makes the pieces jitter under the child's hand.
   */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, wait);
    };
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }


  /**
   * Turns mistakes into a star rating.
   * Deliberately forgiving: a 6-year-old who eventually finishes should still
   * feel rewarded, so the floor is one star and never zero.
   */
  function starsForMistakes(mistakes) {
    if (mistakes <= 1) return 3;
    if (mistakes <= 3) return 2;
    return 1;
  }

  KP.util = {
    clamp: clamp,
    shuffle: shuffle,
    pick: pick,
    debounce: debounce,
    el: el,
    clear: clear,
    starsForMistakes: starsForMistakes
  };
})(window);
