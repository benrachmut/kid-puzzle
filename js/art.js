/**
 * Every picture in the game is drawn here — as inline SVG for icons and cards,
 * and as canvas paint routines for the jigsaw photographs. The brief forbids
 * image files, and drawing from code also means the art stays crisp at any
 * board size after a window resize.
 *
 * All SVG markup in this file is static and author-written; nothing here ever
 * interpolates user input, so injecting it with innerHTML carries no XSS risk.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var PALETTE = {
    red: '#ef4444',
    orange: '#f97316',
    yellow: '#facc15',
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#a855f7',
    pink: '#ec4899',
    teal: '#14b8a6'
  };

  function svg(body, extraClass) {
    return '<svg class="art ' + (extraClass || '') + '" viewBox="0 0 100 100" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /* ---------- geometric shapes used by the matching game ---------- */

  var SHAPE_BODIES = {
    circle: function (fill, stroke) {
      return '<circle cx="50" cy="50" r="38" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5"/>';
    },
    square: function (fill, stroke) {
      return '<rect x="14" y="14" width="72" height="72" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5"/>';
    },
    triangle: function (fill, stroke) {
      return '<polygon points="50,12 90,84 10,84" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round"/>';
    },
    star: function (fill, stroke) {
      return '<polygon points="50,8 61,38 94,38 67,58 77,90 50,70 23,90 33,58 6,38 39,38" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round"/>';
    },
    heart: function (fill, stroke) {
      return '<path d="M50 88C20 66 10 50 10 36a22 22 0 0 1 40-12A22 22 0 0 1 90 36c0 14-10 30-40 52z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round"/>';
    },
    hexagon: function (fill, stroke) {
      return '<polygon points="50,8 88,29 88,71 50,92 12,71 12,29" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round"/>';
    },
    diamond: function (fill, stroke) {
      return '<polygon points="50,8 90,50 50,92 10,50" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round"/>';
    },
    moon: function (fill, stroke) {
      return '<path d="M62 10a42 42 0 1 0 0 80 34 34 0 0 1 0-80z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="5" stroke-linejoin="round"/>';
    }
  };

  var SHAPE_IDS = Object.keys(SHAPE_BODIES);
  var COLOR_IDS = Object.keys(PALETTE);

  function darken(hex) {
    var num = parseInt(hex.slice(1), 16);
    var r = Math.max(0, ((num >> 16) & 255) - 55);
    var g = Math.max(0, ((num >> 8) & 255) - 55);
    var b = Math.max(0, (num & 255) - 55);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /**
   * Renders a shape either solid (the draggable piece) or as a pale outline
   * (the target it belongs in). The outline keeps the shape's colour as a tint
   * so the matching game tests shape *and* colour without needing any words.
   */
  function shape(shapeId, colorId, ghost) {
    var body = SHAPE_BODIES[shapeId] || SHAPE_BODIES.circle;
    var color = PALETTE[colorId] || PALETTE.blue;
    return ghost
      ? svg(body(color + '33', color), 'art--ghost')
      : svg(body(color, darken(color)));
  }

  /* ---------- picture cards used by the memory game ---------- */

  var PICTURES = {
    sun: '<circle cx="50" cy="50" r="24" fill="#facc15" stroke="#f59e0b" stroke-width="4"/>' +
      '<g stroke="#f59e0b" stroke-width="7" stroke-linecap="round">' +
      '<line x1="50" y1="6" x2="50" y2="18"/><line x1="50" y1="82" x2="50" y2="94"/>' +
      '<line x1="6" y1="50" x2="18" y2="50"/><line x1="82" y1="50" x2="94" y2="50"/>' +
      '<line x1="19" y1="19" x2="28" y2="28"/><line x1="72" y1="72" x2="81" y2="81"/>' +
      '<line x1="81" y1="19" x2="72" y2="28"/><line x1="28" y1="72" x2="19" y2="81"/></g>',
    flower: '<g fill="#ec4899"><circle cx="50" cy="22" r="16"/><circle cx="50" cy="60" r="16"/>' +
      '<circle cx="31" cy="41" r="16"/><circle cx="69" cy="41" r="16"/></g>' +
      '<circle cx="50" cy="41" r="11" fill="#facc15"/>' +
      '<path d="M50 56v36" stroke="#22c55e" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M50 78c-14 0-20-8-20-14 10-2 20 5 20 14z" fill="#22c55e"/>',
    fish: '<ellipse cx="46" cy="52" rx="32" ry="22" fill="#38bdf8" stroke="#0284c7" stroke-width="4"/>' +
      '<polygon points="78,52 96,32 96,72" fill="#0ea5e9" stroke="#0284c7" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="30" cy="45" r="5" fill="#0f172a"/>' +
      '<path d="M46 34c6 6 6 30 0 36" stroke="#0284c7" stroke-width="4" fill="none"/>',
    butterfly: '<ellipse cx="32" cy="34" rx="22" ry="18" fill="#a855f7"/>' +
      '<ellipse cx="68" cy="34" rx="22" ry="18" fill="#a855f7"/>' +
      '<ellipse cx="34" cy="66" rx="18" ry="16" fill="#f472b6"/>' +
      '<ellipse cx="66" cy="66" rx="18" ry="16" fill="#f472b6"/>' +
      '<rect x="46" y="24" width="8" height="56" rx="4" fill="#4c1d95"/>' +
      '<path d="M50 26 38 10M50 26 62 10" stroke="#4c1d95" stroke-width="4" stroke-linecap="round" fill="none"/>',
    house: '<rect x="20" y="46" width="60" height="42" fill="#fbbf24" stroke="#b45309" stroke-width="4"/>' +
      '<polygon points="50,12 92,50 8,50" fill="#ef4444" stroke="#991b1b" stroke-width="4" stroke-linejoin="round"/>' +
      '<rect x="42" y="62" width="18" height="26" fill="#7c2d12"/>' +
      '<rect x="26" y="54" width="12" height="12" fill="#bae6fd" stroke="#0369a1" stroke-width="3"/>',
    rocket: '<path d="M50 6c14 12 20 30 20 48l-8 14H38l-8-14C30 36 36 18 50 6z" fill="#e2e8f0" stroke="#475569" stroke-width="4"/>' +
      '<circle cx="50" cy="40" r="10" fill="#38bdf8" stroke="#0369a1" stroke-width="4"/>' +
      '<path d="M30 54 14 78l20-8zM70 54l16 24-20-8z" fill="#ef4444" stroke="#991b1b" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M42 76h16l-8 20z" fill="#f97316"/>',
    apple: '<path d="M50 30c14-12 36-6 36 18 0 22-16 44-26 44-4 0-6-3-10-3s-6 3-10 3C30 92 14 70 14 48c0-24 22-30 36-18z" fill="#ef4444" stroke="#991b1b" stroke-width="4"/>' +
      '<path d="M50 30V12" stroke="#7c2d12" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M52 18c10-10 22-8 22-8s0 12-12 14-10-6-10-6z" fill="#22c55e"/>',
    car: '<rect x="10" y="48" width="80" height="26" rx="10" fill="#3b82f6" stroke="#1d4ed8" stroke-width="4"/>' +
      '<path d="M24 48 34 28h32l10 20z" fill="#bae6fd" stroke="#1d4ed8" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="30" cy="76" r="11" fill="#1e293b"/><circle cx="70" cy="76" r="11" fill="#1e293b"/>',
    tree: '<rect x="43" y="58" width="14" height="34" rx="4" fill="#7c2d12"/>' +
      '<circle cx="50" cy="34" r="22" fill="#22c55e"/><circle cx="31" cy="48" r="16" fill="#16a34a"/>' +
      '<circle cx="69" cy="48" r="16" fill="#16a34a"/>',
    balloon: '<ellipse cx="50" cy="38" rx="28" ry="33" fill="#f472b6" stroke="#be185d" stroke-width="4"/>' +
      '<polygon points="50,70 44,80 56,80" fill="#be185d"/>' +
      '<path d="M50 80c10 8-10 12 0 18" stroke="#be185d" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="40" cy="28" rx="7" ry="10" fill="#ffffff" opacity="0.5"/>'
  };

  var PICTURE_IDS = Object.keys(PICTURES);

  function picture(id) {
    return svg(PICTURES[id] || PICTURES.sun);
  }

  /* ---------- flat interface icons ---------- */

  var ICONS = {
    globe: '<circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="7"/>' +
      '<ellipse cx="50" cy="50" rx="17" ry="38" fill="none" stroke="currentColor" stroke-width="6"/>' +
      '<path d="M14 36h72M14 64h72" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
    soundOn: '<path d="M18 38h16l20-18v60L34 62H18z" fill="currentColor"/>' +
      '<path d="M66 34a24 24 0 0 1 0 32M78 22a40 40 0 0 1 0 56" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
    soundOff: '<path d="M18 38h16l20-18v60L34 62H18z" fill="currentColor"/>' +
      '<path d="M66 38l26 24M92 38L66 62" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
    back: '<path d="M62 18 30 50l32 32" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>',
    home: '<path d="M14 48 50 16l36 32" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M26 46v38h48V46" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
    replay: '<path d="M78 34A34 34 0 1 0 84 56" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>' +
      '<polygon points="80,10 84,40 54,32" fill="currentColor"/>',
    next: '<polygon points="30,16 84,50 30,84" fill="currentColor"/>',
    lock: '<rect x="22" y="44" width="56" height="42" rx="9" fill="currentColor"/>' +
      '<path d="M34 44V32a16 16 0 0 1 32 0v12" fill="none" stroke="currentColor" stroke-width="9"/>',
    star: '<polygon points="50,6 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" fill="currentColor"/>',
    camera: '<path d="M10 32h18l8-10h28l8 10h18a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V38a6 6 0 0 1 6-6z" fill="currentColor"/>' +
      '<circle cx="50" cy="58" r="18" fill="none" stroke="#fff" stroke-width="8"/>',
    gallery: '<rect x="18" y="12" width="74" height="56" rx="8" fill="none" stroke="currentColor" stroke-width="8"/>' +
      '<path d="M26 58l18-18 14 14 10-8 14 12" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="40" cy="30" r="6" fill="currentColor"/>' +
      '<path d="M8 30v52a6 6 0 0 0 6 6h60" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    trash: '<path d="M22 32h56l-5 52a8 8 0 0 1-8 7H35a8 8 0 0 1-8-7z" fill="currentColor"/>' +
      '<path d="M14 26h72M38 26v-8a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v8" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>',
    yes: '<path d="M18 52l22 22 42-46" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>',
    no: '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round"/>'
  };

  function icon(id) {
    return svg(ICONS[id] || ICONS.star, 'art--icon');
  }

  /* ---------- canvas pictures cut up by the jigsaw ---------- */

  function sky(ctx, w, h, top, bottom) {
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function disc(ctx, x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Jigsaw scenes. Each painter fills the whole w x h box, so the same routine
   * draws the faint board ghost and every individual piece at any size.
   */
  var SCENES = {
    meadow: function (ctx, w, h) {
      sky(ctx, w, h, '#7dd3fc', '#e0f2fe');
      disc(ctx, w * 0.76, h * 0.22, Math.min(w, h) * 0.13, '#facc15');
      ctx.fillStyle = '#ffffff';
      [[0.22, 0.24, 0.09], [0.3, 0.21, 0.07], [0.15, 0.22, 0.06]].forEach(function (c) {
        disc(ctx, w * c[0], h * c[1], Math.min(w, h) * c[2], '#ffffff');
      });
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(w * 0.5, h * 0.48, w, h * 0.72);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(w * 0.45, h * 0.72, w, h * 0.92);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      [[0.2, 0.82], [0.5, 0.88], [0.78, 0.86]].forEach(function (p) {
        disc(ctx, w * p[0], h * p[1], Math.min(w, h) * 0.045, '#f472b6');
        disc(ctx, w * p[0], h * p[1], Math.min(w, h) * 0.018, '#fde047');
      });
    },
    house: function (ctx, w, h) {
      sky(ctx, w, h, '#bae6fd', '#fef3c7');
      ctx.fillStyle = '#86efac';
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(w * 0.24, h * 0.42, w * 0.44, h * 0.34);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(w * 0.18, h * 0.44);
      ctx.lineTo(w * 0.46, h * 0.16);
      ctx.lineTo(w * 0.74, h * 0.44);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(w * 0.4, h * 0.56, w * 0.13, h * 0.2);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(w * 0.29, h * 0.5, w * 0.08, h * 0.08);
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(w * 0.79, h * 0.5, w * 0.05, h * 0.26);
      disc(ctx, w * 0.815, h * 0.42, Math.min(w, h) * 0.14, '#22c55e');
    },
    sea: function (ctx, w, h) {
      sky(ctx, w, h, '#0ea5e9', '#0369a1');
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(2, h * 0.012);
      for (var i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h * (i / 6));
        ctx.quadraticCurveTo(w * 0.5, h * (i / 6) - h * 0.05, w, h * (i / 6));
        ctx.stroke();
      }
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.ellipse(w * 0.45, h * 0.55, w * 0.2, h * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.64, h * 0.55);
      ctx.lineTo(w * 0.82, h * 0.4);
      ctx.lineTo(w * 0.82, h * 0.7);
      ctx.closePath();
      ctx.fill();
      disc(ctx, w * 0.34, h * 0.5, Math.min(w, h) * 0.035, '#0f172a');
      ctx.fillStyle = '#fde047';
      [[0.2, 0.78, 0.04], [0.72, 0.84, 0.03], [0.55, 0.9, 0.035]].forEach(function (p) {
        disc(ctx, w * p[0], h * p[1], Math.min(w, h) * p[2], '#fde047');
      });
    },
    space: function (ctx, w, h) {
      sky(ctx, w, h, '#1e1b4b', '#4c1d95');
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < 40; i++) {
        var sx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        var sy = (Math.sin(i * 78.233) * 12345.6789) % 1;
        disc(ctx, Math.abs(sx) * w, Math.abs(sy) * h, Math.min(w, h) * 0.008, '#ffffff');
      }
      disc(ctx, w * 0.78, h * 0.24, Math.min(w, h) * 0.12, '#fde68a');
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.14);
      ctx.quadraticCurveTo(w * 0.62, h * 0.4, w * 0.56, h * 0.7);
      ctx.lineTo(w * 0.24, h * 0.7);
      ctx.quadraticCurveTo(w * 0.18, h * 0.4, w * 0.4, h * 0.14);
      ctx.closePath();
      ctx.fill();
      disc(ctx, w * 0.4, h * 0.38, Math.min(w, h) * 0.09, '#38bdf8');
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(w * 0.24, h * 0.56);
      ctx.lineTo(w * 0.1, h * 0.82);
      ctx.lineTo(w * 0.28, h * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.56, h * 0.56);
      ctx.lineTo(w * 0.7, h * 0.82);
      ctx.lineTo(w * 0.52, h * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(w * 0.32, h * 0.7);
      ctx.lineTo(w * 0.48, h * 0.7);
      ctx.lineTo(w * 0.4, h * 0.96);
      ctx.closePath();
      ctx.fill();
    }
  };

  function paintScene(sceneId, ctx, w, h) {
    (SCENES[sceneId] || SCENES.meadow)(ctx, w, h);
  }

  /* ---------- photographs brought in from the phone ---------- */

  /**
   * Cover-fits a photo into the w x h box: centre-crop, aspect preserved and
   * never stretched - a squashed face is the first thing a child notices.
   *
   * The crop is derived from the box alone and not from the part of it being
   * drawn, which is what makes the jigsaw ghost, each jigsaw piece and each
   * slide tile - all of which paint this same box under a different ctx
   * translation - slices of one and the same framing.
   */
  function paintPhoto(image, ctx, w, h) {
    var scale = Math.max(w / image.width, h / image.height);
    var drawW = image.width * scale;
    var drawH = image.height * scale;
    ctx.drawImage(image, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
  }

  /**
   * Chooses what fills a puzzle's picture box - the photo the shell handed the
   * game, or the drawn scene - and hands it back with paintScene's signature so
   * that the games keep one single painting path.
   *
   * A photo with no pixels (a canvas that never received a frame) falls back to
   * the scene: cropping by NaN would paint an empty board the child cannot
   * solve, and drawImage from a zero-sized canvas throws outright.
   */
  function picturePainter(sceneId, image) {
    if (!image || !image.width || !image.height) {
      return function (ctx, w, h) { paintScene(sceneId, ctx, w, h); };
    }
    return function (ctx, w, h) { paintPhoto(image, ctx, w, h); };
  }

  KP.art = {
    shape: shape,
    picture: picture,
    icon: icon,
    paintScene: paintScene,
    picturePainter: picturePainter,
    SHAPE_IDS: SHAPE_IDS,
    COLOR_IDS: COLOR_IDS,
    PICTURE_IDS: PICTURE_IDS
  };
})(window);
