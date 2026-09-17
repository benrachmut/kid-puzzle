/**
 * Single source of truth for every display string in the game.
 * Nothing user-visible may be hardcoded in markup or in game logic: a 6-year-old
 * playing in Hebrew must never see a stray English word, and the language toggle
 * must be able to repaint the whole UI without touching game state.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var DICTIONARIES = {
    en: {
      dir: 'ltr',
      lang: 'en',
      'app.title': 'Puzzle Play',
      'app.subtitle': 'Pick a game',
      'game.jigsaw': 'Jigsaw',
      'game.match': 'Shapes & Colours',
      'game.memory': 'Memory',
      'ui.langToggle': 'עברית',
      'ui.langToggleAria': 'Switch to Hebrew',
      'ui.soundOn': 'Sound on',
      'ui.soundOff': 'Sound off',
      'ui.back': 'Back',
      'ui.home': 'Home',
      'ui.replay': 'Play again',
      'ui.next': 'Next',
      'ui.level': 'Level',
      'ui.locked': 'Locked',
      'ui.chooseLevel': 'Pick a level',
      'win.title': 'Well done!',
      'jigsaw.board': 'Puzzle board',
      'jigsaw.piece': 'Puzzle piece',
      'match.targets': 'Matching places',
      'match.pieces': 'Shapes to drag',
      'match.item': 'Shape',
      'memory.card': 'Card'
    },
    he: {
      dir: 'rtl',
      lang: 'he',
      'app.title': 'משחקי פאזל',
      'app.subtitle': 'בחרו משחק',
      'game.jigsaw': 'פאזל',
      'game.match': 'צורות וצבעים',
      'game.memory': 'זיכרון',
      'ui.langToggle': 'English',
      'ui.langToggleAria': 'מעבר לאנגלית',
      'ui.soundOn': 'הצליל דולק',
      'ui.soundOff': 'הצליל כבוי',
      'ui.back': 'חזרה',
      'ui.home': 'בית',
      'ui.replay': 'שוב',
      'ui.next': 'הלאה',
      'ui.level': 'שלב',
      'ui.locked': 'נעול',
      'ui.chooseLevel': 'בחרו שלב',
      'win.title': 'כל הכבוד!',
      'jigsaw.board': 'לוח הפאזל',
      'jigsaw.piece': 'חלק פאזל',
      'match.targets': 'מקומות להתאמה',
      'match.pieces': 'צורות לגרירה',
      'match.item': 'צורה',
      'memory.card': 'קלף'
    }
  };

  var DEFAULT_LANG = 'he';
  var current = DEFAULT_LANG;

  /**
   * Looks a string up in the active dictionary.
   * Falls back to the key itself so a missing translation is visible during
   * development instead of rendering an empty, unclickable-looking button.
   */
  function t(key) {
    var dict = DICTIONARIES[current] || DICTIONARIES[DEFAULT_LANG];
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  }

  function setLang(lang) {
    current = DICTIONARIES[lang] ? lang : DEFAULT_LANG;
    return current;
  }

  function getLang() {
    return current;
  }

  function other() {
    return current === 'he' ? 'en' : 'he';
  }

  /**
   * Repaints every translatable node in a subtree.
   * Games mark their own labels with the same data attributes, so a mid-puzzle
   * language switch only rewrites text and never rebuilds the board.
   */
  function apply(root) {
    var scope = root || document;
    var i, nodes;

    nodes = scope.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }

    nodes = scope.querySelectorAll('[data-i18n-aria]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('aria-label', t(nodes[i].getAttribute('data-i18n-aria')));
    }
  }

  KP.i18n = {
    t: t,
    apply: apply,
    setLang: setLang,
    getLang: getLang,
    other: other,
    dir: function () { return t('dir'); },
    htmlLang: function () { return t('lang'); }
  };
})(window);
