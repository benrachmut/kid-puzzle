/**
 * The child's own photos: decode, downscale, keep, delete.
 *
 * Two promises are made to the rest of the app, because both of them are what
 * keep a broken phone from becoming a broken toy:
 *
 * 1. Nothing here ever throws or rejects. Every call resolves with a result or
 *    with null, so the photo screen only has to tell "it worked" from "it did
 *    not" and can answer a 6-year-old with a friendly picture either way.
 * 2. Storage is best-effort. If IndexedDB is missing, blocked (Firefox private
 *    mode throws on open), or full, the photos taken in this session are kept
 *    in memory instead and the game plays on - isPersistent() then reports
 *    false so the UI can show a small "these will not be here tomorrow" hint.
 *
 * Photos never leave the device: there is no upload, no network call and no
 * copy outside this origin's own storage.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var DB_NAME = 'kid-puzzle';
  var DB_VERSION = 1;
  var STORE = 'photos';
  /* Safari has been known to leave open() pending forever after a crash, and a
     photo screen that never answers is worse than one without storage. */
  var OPEN_TIMEOUT_MS = 3000;

  /* A phone photo is 12MP or more; a puzzle board is at most a few hundred CSS
     pixels. 1280 on the longest side still looks sharp when a jigsaw piece is
     magnified, and keeps a stored photo at a few hundred KB instead of megabytes. */
  var MAX_EDGE = 1280;
  var THUMB_EDGE = 240;
  var JPEG_QUALITY = 0.82;
  var THUMB_QUALITY = 0.7;

  /* Records IndexedDB could not take (no storage, or quota full). They are real,
     playable photos for as long as the tab lives. */
  var memoryPhotos = [];
  /* Optimistic until a real attempt fails: meaningful once any call has resolved. */
  var persistent = true;
  var dbPromise = null;
  var idCounter = 0;

  function nextId() {
    /* Time alone collides when two photos are saved in the same millisecond,
       which a fast double-tap on "save" does reach. */
    idCounter += 1;
    return 'p' + Date.now().toString(36) + '-' + idCounter.toString(36);
  }

  function closeQuietly(db) {
    try {
      db.close();
    } catch (err) {
      /* Already closing, or the connection died with the tab's storage. */
    }
  }

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve) {
      var request;
      var settled = false;
      var timer = null;

      function finish(db) {
        if (settled) {
          /* The open succeeded after we had already given up - a phone under
             memory pressure can take seconds. Nobody can ever use this handle
             now, and leaving it open blocks the next version upgrade, so it is
             closed; clearing dbPromise lets the following call try again
             against a database we have just seen work. */
          if (db) {
            closeQuietly(db);
            dbPromise = null;
            persistent = true;
          }
          return;
        }
        settled = true;
        if (timer) global.clearTimeout(timer);
        if (!db) persistent = false;
        resolve(db);
      }

      if (!global.indexedDB) {
        finish(null);
        return;
      }
      try {
        request = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        /* Private-browsing modes throw here rather than firing onerror. */
        finish(null);
        return;
      }

      timer = global.setTimeout(function () { finish(null); }, OPEN_TIMEOUT_MS);

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
        /* A second tab upgrading the schema must not be left blocked by this one. */
        db.onversionchange = function () {
          db.close();
          dbPromise = null;
        };
        finish(db);
      };
      request.onerror = function () { finish(null); };
      request.onblocked = function () { finish(null); };
    });

    return dbPromise;
  }

  /**
   * Runs one transaction and resolves with whatever `fn` handed to `done`, or
   * null if anything at all went wrong. This is the single place IndexedDB
   * errors are swallowed, which is what lets every public method promise never
   * to reject.
   */
  function withStore(mode, fn) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx;
        var result = null;
        try {
          tx = db.transaction(STORE, mode);
        } catch (err) {
          resolve(null);
          return;
        }
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { resolve(null); };
        tx.onabort = function () { resolve(null); };
        try {
          fn(tx.objectStore(STORE), function (value) { result = value; });
        } catch (err) {
          /* A quota failure can surface as a synchronous throw on put(). */
          resolve(null);
        }
      });
    });
  }

  /**
   * Draws `source` into a NEW canvas no larger than `maxEdge` on its longest
   * side. Always a copy: the games are handed one of these and may draw on it,
   * and the thumbnail must not disturb the full-size picture it came from.
   */
  function fitCanvas(source, maxEdge) {
    var width = source.width;
    var height = source.height;
    var scale;
    var canvas;
    var ctx;

    if (!width || !height) return null;
    scale = Math.min(1, maxEdge / Math.max(width, height));

    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    /* Downscaling a 12MP photo in one step aliases badly without this. */
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    try {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      return null;
    }
    return canvas;
  }

  /**
   * Phone photos carry their rotation in EXIF rather than in their pixels, so
   * upright has to be asked for explicitly - without it every portrait picture
   * arrives lying on its side.
   */
  function fromBitmap(blob) {
    return new Promise(function (resolve) {
      var pending;
      try {
        pending = global.createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch (err) {
        resolve(null);
        return;
      }
      if (!pending || typeof pending.then !== 'function') {
        resolve(null);
        return;
      }
      pending.then(function (bitmap) {
        var canvas = fitCanvas(bitmap, MAX_EDGE);
        /* Release the full-size decoded pixels immediately; on a phone that is
           tens of megabytes we are done with. */
        if (bitmap.close) bitmap.close();
        resolve(canvas);
      }, function () {
        resolve(null);
      });
    });
  }

  /**
   * Fallback decode for browsers without createImageBitmap. Current browsers
   * apply EXIF orientation to an <img> by default, so this stays upright too.
   */
  function fromImageElement(blob) {
    return new Promise(function (resolve) {
      var url;
      var img;

      try {
        url = global.URL.createObjectURL(blob);
      } catch (err) {
        resolve(null);
        return;
      }

      function done(canvas) {
        /* Without this the blob stays pinned in memory for the tab's lifetime. */
        global.URL.revokeObjectURL(url);
        resolve(canvas);
      }

      img = new global.Image();
      img.onload = function () { done(fitCanvas(img, MAX_EDGE)); };
      /* HEIC from an iPhone, and any other format this browser cannot read,
         lands here: null travels up and the screen shows a friendly message. */
      img.onerror = function () { done(null); };
      img.src = url;
    });
  }

  function decodeBlob(blob) {
    if (!blob) return Promise.resolve(null);
    if (!global.createImageBitmap) return fromImageElement(blob);
    return fromBitmap(blob).then(function (canvas) {
      return canvas || fromImageElement(blob);
    });
  }

  function toJpeg(canvas, quality) {
    return new Promise(function (resolve) {
      if (!canvas || !canvas.toBlob) {
        resolve(null);
        return;
      }
      try {
        canvas.toBlob(function (blob) { resolve(blob || null); }, 'image/jpeg', quality);
      } catch (err) {
        resolve(null);
      }
    });
  }

  /**
   * Thumbnails are data URLs rather than blobs on purpose: the grid can put one
   * straight into an <img> with no object URL to create, track and revoke, so a
   * language switch or a delete cannot leak or blank an image.
   */
  function toThumb(canvas) {
    var small = fitCanvas(canvas, THUMB_EDGE);
    if (!small) return '';
    try {
      return small.toDataURL('image/jpeg', THUMB_QUALITY);
    } catch (err) {
      return '';
    }
  }

  /** What the photo grid needs; the full JPEG stays in storage until play. */
  function meta(record) {
    return {
      id: record.id,
      created: record.created,
      w: record.w,
      h: record.h,
      thumb: record.thumb
    };
  }

  function newestFirst(records) {
    return records.slice().sort(function (a, b) { return b.created - a.created; });
  }

  /**
   * Every saved photo, newest first, as light metadata records
   * ({ id, created, w, h, thumb }).
   */
  function list() {
    return withStore('readonly', function (store, done) {
      var request = store.getAll();
      request.onsuccess = function () { done(request.result || []); };
    }).then(function (rows) {
      var stored = (rows || []).map(meta);
      /* Photos that only ever made it into memory are just as playable, so the
         grid shows them alongside the persisted ones. */
      return newestFirst(stored.concat(memoryPhotos.map(meta)));
    });
  }

  /**
   * Stores a photo. `canvas` is anything drawImage accepts; it is downscaled to
   * MAX_EDGE and encoded as JPEG here, so callers never have to think about size.
   * Resolves with the metadata record, or null if the picture could not be encoded.
   */
  function save(canvas) {
    var scaled = canvas ? fitCanvas(canvas, MAX_EDGE) : null;
    if (!scaled) return Promise.resolve(null);

    return toJpeg(scaled, JPEG_QUALITY).then(function (blob) {
      var record;
      if (!blob) return null;

      record = {
        id: nextId(),
        created: Date.now(),
        w: scaled.width,
        h: scaled.height,
        blob: blob,
        thumb: toThumb(scaled)
      };

      return withStore('readwrite', function (store, done) {
        var request = store.put(record);
        request.onsuccess = function () { done(true); };
      }).then(function (stored) {
        if (!stored) {
          /* No storage, or the quota is full: keep the photo for this session
             rather than refusing it. The child can still play with it today. */
          persistent = false;
          memoryPhotos.push(record);
        }
        return meta(record);
      });
    });
  }

  function findRecord(id) {
    var i;
    for (i = 0; i < memoryPhotos.length; i++) {
      if (memoryPhotos[i].id === id) return Promise.resolve(memoryPhotos[i]);
    }
    return withStore('readonly', function (store, done) {
      var request = store.get(id);
      request.onsuccess = function () { done(request.result || null); };
    });
  }

  /**
   * The photo as a fresh HTMLCanvasElement, upright and already downscaled -
   * exactly what a game is handed as callbacks.image. A new canvas every call,
   * so a game may draw on it without affecting the stored picture or the next
   * game to ask for it. Resolves null if the photo is gone or unreadable.
   */
  function get(id) {
    return findRecord(id).then(function (record) {
      if (!record || !record.blob) return null;
      return decodeBlob(record.blob);
    });
  }

  /**
   * Resolves true if a photo with this id existed and is now gone.
   * The existence check shares the delete's transaction on purpose: IndexedDB
   * happily "deletes" a key that was never there, and an unknown id has to give
   * the same answer whether the photo lived in storage or only in memory.
   */
  function remove(id) {
    var before = memoryPhotos.length;
    memoryPhotos = memoryPhotos.filter(function (record) { return record.id !== id; });
    var droppedFromMemory = memoryPhotos.length !== before;

    return withStore('readwrite', function (store, done) {
      var lookup = store.get(id);
      lookup.onsuccess = function () {
        if (!lookup.result) return;
        var request = store.delete(id);
        request.onsuccess = function () { done(true); };
      };
    }).then(function (deleted) {
      return !!deleted || droppedFromMemory;
    });
  }

  /**
   * A File from a camera or gallery input, as an upright downscaled canvas.
   * Resolves null for "no file", for a non-image, and for a format this browser
   * cannot decode (HEIC on a non-Apple browser is the common one).
   */
  function decode(file) {
    if (!file) return Promise.resolve(null);
    /* Some pickers report an empty type for HEIC, so only an explicitly
       non-image type is rejected outright; everything else is tried. */
    if (file.type && file.type.indexOf('image/') !== 0) return Promise.resolve(null);
    return decodeBlob(file);
  }

  /**
   * False once a save has had to fall back to memory, or once storage has been
   * found unusable. Meaningful after any other call has resolved.
   */
  function isPersistent() {
    return persistent;
  }

  KP.photos = {
    list: list,
    save: save,
    get: get,
    remove: remove,
    decode: decode,
    isPersistent: isPersistent
  };
})(window);
