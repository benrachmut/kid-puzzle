/**
 * Progress persistence with a hard guarantee: the game never breaks because of
 * storage. Safari private mode throws on setItem, some kiosk browsers remove
 * localStorage entirely, and a corrupted value must not crash the menu — so every
 * access is guarded and an in-memory object is used as the fallback store.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var STORAGE_KEY = 'kid-puzzle:progress:v1';
  var GAME_IDS = ['jigsaw', 'match', 'memory'];
  var memoryFallback = null;

  /**
   * Returns localStorage only if it is actually usable.
   * Merely checking for existence is not enough: private mode exposes the object
   * and throws on write, so we probe with a real round-trip.
   */
  function usableStorage() {
    try {
      var probe = '__kp_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return global.localStorage;
    } catch (err) {
      return null;
    }
  }

  function emptyProgress() {
    var progress = { stars: {}, sound: true, lang: null };
    GAME_IDS.forEach(function (id) { progress.stars[id] = {}; });
    return progress;
  }

  /**
   * Normalises whatever came out of storage into the shape the app expects.
   * Anything unexpected (hand-edited JSON, an older version, a truncated write)
   * is silently replaced rather than allowed to reach the level screen.
   */
  function normalise(raw) {
    var progress = emptyProgress();
    if (!raw || typeof raw !== 'object') return progress;

    if (raw.stars && typeof raw.stars === 'object') {
      GAME_IDS.forEach(function (id) {
        var levels = raw.stars[id];
        if (!levels || typeof levels !== 'object') return;
        Object.keys(levels).forEach(function (levelKey) {
          var stars = Number(levels[levelKey]);
          var index = Number(levelKey);
          if (!isFinite(stars) || !isFinite(index) || index < 0) return;
          progress.stars[id][index] = Math.max(0, Math.min(3, Math.round(stars)));
        });
      });
    }
    if (typeof raw.sound === 'boolean') progress.sound = raw.sound;
    if (typeof raw.lang === 'string') progress.lang = raw.lang;
    return progress;
  }

  function load() {
    var store = usableStorage();
    if (!store) return memoryFallback ? normalise(memoryFallback) : emptyProgress();
    try {
      return normalise(JSON.parse(store.getItem(STORAGE_KEY)));
    } catch (err) {
      return emptyProgress();
    }
  }

  function save(progress) {
    memoryFallback = progress;
    var store = usableStorage();
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(progress));
      return true;
    } catch (err) {
      return false;
    }
  }

  KP.storage = { load: load, save: save, GAME_IDS: GAME_IDS };
})(window);
