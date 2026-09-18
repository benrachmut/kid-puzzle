/**
 * Jigsaw: drag interlocking pieces onto the board.
 *
 * Geometry is recomputed from the stage size on every layout instead of being
 * fixed at build time, because the window can be resized mid-puzzle and the
 * pieces must follow. Piece positions are therefore stored as state (placed or
 * tray-slot) rather than as pixel values that would go stale.
 *
 * The picture is either the level's drawn scene or, when the shell passes
 * `callbacks.image`, a photo from the phone. Both are painted through one
 * painter that fills the whole board box, so every piece keeps showing a slice
 * of the same framing - including after a relayout, which repaints them all
 * from that painter again.
 *
 * The board itself stays empty: it shows slot outlines and nothing else, so the
 * child solves the puzzle from the pieces rather than by tracing a picture
 * printed underneath them. The peek button in its corner shows the picture for
 * as long as it is held, which is the paper-box-lid version of the same help.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});
  KP.games = KP.games || {};

  var util = KP.util;

  /* The first four levels are the original warm-up ladder. The last three add
     volume, and the top two also start every piece at a random quarter turn:
     a click turns a piece, and a piece only snaps when its rotation is upright
     as well as its position. */
  var LEVELS = [
    { cols: 2, rows: 2, scene: 'meadow' },
    { cols: 3, rows: 2, scene: 'house' },
    { cols: 3, rows: 3, scene: 'sea' },
    { cols: 4, rows: 3, scene: 'space' },
    { cols: 4, rows: 4, scene: 'meadow' },
    { cols: 5, rows: 4, scene: 'house', rotate: true },
    { cols: 5, rows: 5, scene: 'sea', rotate: true }
  ];

  var PAD = 12;
  /* Share of the stage the board may take: of the height when the tray goes
     underneath it, of the width when the tray goes beside it. */
  var BOARD_HEIGHT_SHARE = 0.6;
  var BOARD_WIDTH_SHARE = 0.6;
  /** A drop counts as "close enough" within this fraction of a piece. */
  var SNAP_FACTOR = 0.7;
  /** Side of the hold-to-peek button, mirroring .jig-peek in the stylesheet.
      52px, so it clears a 48px finger target without covering the board. */
  var PEEK_SIZE = 52;

  /* ---------- tabs and blanks ---------- */

  /**
   * How far outside its own cell a piece's canvas reaches, as a fraction of the
   * cell. Every piece gets the same canvas box whether or not a given side
   * carries a tab, so one piece size serves the whole board and every position,
   * snap and tray calculation can go on working in whole cells.
   * It is a little more than the tallest point of TAB_PROFILE, to leave room
   * for the outline stroke drawn on top of the shape.
   */
  var TAB_OVERHANG = 0.3;

  /**
   * One tab, as (along the edge, out from the edge) pairs in units of the edge
   * length: a starting point followed by three cubic segments - up through the
   * narrow neck, over the round knob, and back down the far side.
   *
   * It is deliberately symmetric about the middle of the edge. The piece on the
   * other side of that edge walks it backwards and with the opposite sign, and
   * the symmetry is what makes it trace exactly the same curve, so the two
   * pieces interlock instead of merely almost fitting.
   */
  var TAB_PROFILE = [
    [0.38, 0],
    [0.44, 0.015], [0.30, 0.152], [0.38, 0.213],
    [0.455, 0.273], [0.545, 0.273], [0.62, 0.213],
    [0.70, 0.152], [0.56, 0.015], [0.62, 0]
  ];

  /**
   * Adds one side of a piece to the current path, from corner A to corner B.
   * `sign` is 0 for a straight board edge, 1 for a tab and -1 for a blank.
   *
   * Sides are walked clockwise, so turning the direction of travel a quarter
   * turn anticlockwise always points out of the piece; a blank is the same
   * curve pointing the other way.
   */
  function edgeTo(ctx, ax, ay, bx, by, sign) {
    if (!sign) {
      ctx.lineTo(bx, by);
      return;
    }
    var len = Math.hypot(bx - ax, by - ay);
    var ux = (bx - ax) / len;
    var uy = (by - ay) / len;
    var nx = uy * sign;
    var ny = -ux * sign;

    function at(index) {
      var along = TAB_PROFILE[index][0] * len;
      var out = TAB_PROFILE[index][1] * len;
      return [ax + ux * along + nx * out, ay + uy * along + ny * out];
    }

    var start = at(0);
    ctx.lineTo(start[0], start[1]);
    for (var i = 1; i < TAB_PROFILE.length; i += 3) {
      var c1 = at(i);
      var c2 = at(i + 1);
      var to = at(i + 2);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]);
    }
    ctx.lineTo(bx, by);
  }

  function mediaMatches(query) {
    return !!(global.matchMedia && global.matchMedia(query).matches);
  }

  /* Phone layouts. The desktop and wide-window layout is deliberately left
     alone - a mouse has no trouble with a small tray piece - so these are
     viewport queries mirroring the stylesheet's own breakpoints rather than
     measurements of the stage.
     PHONE_PORTRAIT: the tray grid is fitted to the space it has instead of
     using a fixed row count, which on a 360px screen left the 25 pieces at
     32px and overlapping - far too small to pick up with a finger.
     PHONE_LANDSCAPE: a phone on its side leaves the stage barely 270px tall,
     and a board capped at 60% of that comes out 142px across (28px pieces), so
     there the board takes the height and the tray moves alongside it. */
  var PHONE_PORTRAIT = '(max-width: 720px) and (orientation: portrait)';
  var PHONE_LANDSCAPE =
    '(max-width: 1024px) and (max-height: 520px) and (orientation: landscape)';

  /**
   * Distance between two tray cells, in cells.
   *
   * A piece is drawn on a canvas 1.6 cells wide, so tray neighbours overlap at
   * anything below that. They are left to overlap on purpose: spreading them
   * far enough apart to clear every tab would shrink the 25-piece tray on a
   * 360px phone below a finger-sized target, which matters far more than a
   * tidy grid - and a heap of pieces with their tabs interleaved is what a real
   * puzzle box looks like anyway. Presses are resolved against the pieces'
   * painted pixels (see pieceAt), so the overlap never costs the child a grab.
   */
  var TRAY_PITCH = 1.28;

  /**
   * Picks the tray grid that leaves the pieces as large as possible.
   *
   * One fixed row count cannot serve both a wide desktop tray and the narrow,
   * tall tray of a phone. Trying every row count is a couple of dozen
   * divisions once per layout, and it is what keeps a 25-piece tray at a
   * finger-sized scale on a 360px screen.
   */
  function fitTray(count, trayW, trayH, pieceW, pieceH) {
    var best = { rows: 1, cols: count, scale: 0 };
    for (var rows = 1; rows <= count; rows++) {
      var cols = Math.ceil(count / rows);
      var scale = Math.min(
        trayW / (cols * pieceW * TRAY_PITCH),
        trayH / (rows * pieceH * TRAY_PITCH)
      );
      if (scale > best.scale) best = { rows: rows, cols: cols, scale: scale };
    }
    return best;
  }

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    var paintPicture = KP.art.picturePainter(level.scene, callbacks.image);
    var cols = level.cols;
    var rows = level.rows;
    var count = cols * rows;

    var stage = util.el('div', 'stage stage--ltr', { role: 'group', 'data-i18n-aria': 'jigsaw.board' });
    var board = util.el('div', 'jig-board');
    /* Sits inside the board, so pieces already placed stay on top of it: a peek
       then shows the child exactly the part still missing. */
    var peekCanvas = util.el('canvas', 'jig-board__peek');
    board.appendChild(peekCanvas);
    stage.appendChild(board);

    var peekButton = util.el('button', 'btn btn--icon jig-peek', {
      type: 'button', 'data-i18n-aria': 'jigsaw.peek'
    });
    peekButton.innerHTML = KP.art.icon('eye');
    stage.appendChild(peekButton);
    mount.appendChild(stage);

    var geo = { stageW: 0, stageH: 0, boardX: 0, boardY: 0, boardW: 0, boardH: 0,
      pieceW: 0, pieceH: 0, trayX: PAD, trayTop: 0, trayW: 0, trayH: 0,
      trayCols: 1, trayRows: 1, trayScale: 1 };

    var pieces = [];
    var draggingPiece = null;
    var mistakes = 0;
    var finished = false;
    var winTimer = null;

    /**
     * Draws the board's tabs and blanks, once.
     *
     * Each inner edge is settled here and then kept on the two pieces that
     * share it, so a relayout - a resize, a device rotation, a language switch -
     * repaints the same shapes instead of re-cutting the puzzle under the
     * child's hand. Outer edges of the board get 0, a straight side.
     */
    function cutEdges() {
      var vertical = [];
      var horizontal = [];
      var r, c;
      for (r = 0; r < rows; r++) {
        vertical[r] = [];
        for (c = 0; c < cols - 1; c++) vertical[r][c] = Math.random() < 0.5 ? 1 : -1;
      }
      for (r = 0; r < rows - 1; r++) {
        horizontal[r] = [];
        for (c = 0; c < cols; c++) horizontal[r][c] = Math.random() < 0.5 ? 1 : -1;
      }
      /* A tab on one piece is the same edge negated on its neighbour, which is
         precisely a blank of the same shape. */
      return function (col, row) {
        return {
          top: row === 0 ? 0 : -horizontal[row - 1][col],
          right: col === cols - 1 ? 0 : vertical[row][col],
          bottom: row === rows - 1 ? 0 : horizontal[row][col],
          left: col === 0 ? 0 : -vertical[row][col - 1]
        };
      };
    }

    var edgesFor = cutEdges();

    /* Tray order is shuffled once so the same piece keeps its resting place
       across resizes; re-shuffling on layout would make pieces jump around. */
    var trayOrder = util.shuffle(
      Array.apply(null, { length: count }).map(function (unused, i) { return i; })
    );

    trayOrder.forEach(function (slotIndex, trayIndex) {
      var node = util.el('div', 'jig-piece', { 'data-i18n-aria': 'jigsaw.piece', role: 'img' });
      var canvas = util.el('canvas');
      node.appendChild(canvas);
      stage.appendChild(node);

      var col = slotIndex % cols;
      var row = Math.floor(slotIndex / cols);
      var piece = {
        slot: slotIndex,
        col: col,
        row: row,
        edges: edgesFor(col, row),
        trayIndex: trayIndex,
        placed: false,
        node: node,
        canvas: canvas,
        left: 0,
        top: 0,
        /* Quarter turns, 0 = upright. Random on rotating levels, and never
           starts solved-by-accident because 0 is excluded there. */
        rot: level.rotate ? 1 + Math.floor(Math.random() * 3) : 0
      };
      pieces.push(piece);
      node.addEventListener('pointerdown', function (ev) { onPointerDown(ev, piece); });
    });

    var slotNodes = [];
    for (var s = 0; s < count; s++) {
      var slotNode = util.el('div', 'jig-slot');
      board.appendChild(slotNode);
      slotNodes.push(slotNode);
    }

    /** Traces one piece's outline, with its cell's top-left corner at (x, y). */
    function tracePiece(ctx, piece, x, y, w, h) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      edgeTo(ctx, x, y, x + w, y, piece.edges.top);
      edgeTo(ctx, x + w, y, x + w, y + h, piece.edges.right);
      edgeTo(ctx, x + w, y + h, x, y + h, piece.edges.bottom);
      edgeTo(ctx, x, y + h, x, y, piece.edges.left);
      ctx.closePath();
    }

    /** Device-pixel-aware sizing keeps the art sharp on retina laptops. */
    function sizeCanvas(canvas, w, h) {
      var dpr = global.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      var ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
      }
      return ctx;
    }

    /** The whole picture, for the hold-to-peek overlay. */
    function paintPeek() {
      if (geo.boardW <= 0 || geo.boardH <= 0) return;
      var ctx = sizeCanvas(peekCanvas, geo.boardW, geo.boardH);
      if (ctx) paintPicture(ctx, geo.boardW, geo.boardH);
    }

    /**
     * Paints one piece: its slice of the picture, clipped to its tab shape.
     *
     * The canvas is bigger than the cell on every side, and the cell's corner
     * sits at (overhang, overhang) inside it, so a tab can carry the pixels of
     * the neighbouring cell it reaches into. The picture is painted in board
     * coordinates under a translation, which is what keeps every piece a slice
     * of one and the same framing.
     */
    function paintPiece(piece) {
      var w = geo.pieceW;
      var h = geo.pieceH;
      if (w <= 0 || h <= 0) return;
      var ox = w * TAB_OVERHANG;
      var oy = h * TAB_OVERHANG;
      var ctx = sizeCanvas(piece.canvas, w + ox * 2, h + oy * 2);
      if (!ctx) return;
      piece.canvas.style.left = -ox + 'px';
      piece.canvas.style.top = -oy + 'px';

      tracePiece(ctx, piece, ox, oy, w, h);
      ctx.save();
      ctx.clip();
      ctx.translate(ox - piece.col * w, oy - piece.row * h);
      paintPicture(ctx, geo.boardW, geo.boardH);
      ctx.restore();

      /* The picture painters begin paths of their own, so the outline has to be
         traced again rather than reusing the one that was clipped with.
         Two strokes: a light one so a piece reads against the picture of the
         pieces around it, a thin dark one so it reads against the empty board. */
      tracePiece(ctx, piece, ox, oy, w, h);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = Math.max(1.5, w * 0.03);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function traySlotPosition(trayIndex) {
      var cellW = geo.trayW / geo.trayCols;
      var cellH = geo.trayH / geo.trayRows;
      var col = trayIndex % geo.trayCols;
      var row = Math.floor(trayIndex / geo.trayCols);
      return {
        left: geo.trayX + cellW * (col + 0.5) - geo.pieceW / 2,
        top: geo.trayTop + cellH * (row + 0.5) - geo.pieceH / 2
      };
    }

    function slotPosition(piece) {
      return {
        left: geo.boardX + piece.col * geo.pieceW,
        top: geo.boardY + piece.row * geo.pieceH
      };
    }

    /* Piece positions are the position of the piece's *cell*, never of its
       wider canvas: snapping, the tray grid and the drop distance all stay in
       whole cells, and the tabs are purely something the canvas draws around
       that cell. */
    function moveTo(piece, left, top) {
      piece.left = left;
      piece.top = top;
      piece.node.style.left = left + 'px';
      piece.node.style.top = top + 'px';
    }

    /** Scale (tray pieces shrink) combined with the piece's quarter turn. */
    function transformFor(piece, dragging) {
      var scale = (dragging || piece.placed) ? 1 : geo.trayScale;
      return 'scale(' + scale + ') rotate(' + (piece.rot * 90) + 'deg)';
    }

    function restPiece(piece) {
      var pos = piece.placed ? slotPosition(piece) : traySlotPosition(piece.trayIndex);
      moveTo(piece, pos.left, pos.top);
      piece.node.style.transform = transformFor(piece, false);
    }

    /**
     * Recomputes board and tray geometry and repaints every piece.
     * Called on creation, on window resize and after a language switch, since a
     * direction change can alter the available width.
     */
    function layout() {
      var W = stage.clientWidth;
      var H = stage.clientHeight;
      if (W <= 0 || H <= 0) return;
      geo.stageW = W;
      geo.stageH = H;

      var aspect = cols / rows;
      var beside = mediaMatches(PHONE_LANDSCAPE);
      var maxW = beside ? W * BOARD_WIDTH_SHARE - PAD * 2 : W - PAD * 2;
      var maxH = beside ? H - PAD * 2 : H * BOARD_HEIGHT_SHARE - PAD;
      geo.boardW = Math.max(40, Math.min(maxW, maxH * aspect));
      geo.boardH = geo.boardW / aspect;
      geo.pieceW = geo.boardW / cols;
      geo.pieceH = geo.boardH / rows;

      if (beside) {
        geo.boardX = PAD;
        geo.boardY = Math.max(PAD, (H - geo.boardH) / 2);
        geo.trayX = geo.boardX + geo.boardW + PAD;
        geo.trayTop = PAD;
        geo.trayW = Math.max(geo.pieceW, W - geo.trayX - PAD);
        geo.trayH = Math.max(geo.pieceH, H - PAD * 2);
      } else {
        geo.boardX = (W - geo.boardW) / 2;
        geo.boardY = PAD;
        geo.trayX = PAD;
        geo.trayTop = geo.boardY + geo.boardH + PAD;
        geo.trayW = W - PAD * 2;
        geo.trayH = Math.max(geo.pieceH, H - geo.trayTop - PAD);
      }

      if (beside || mediaMatches(PHONE_PORTRAIT)) {
        var fitted = fitTray(count, geo.trayW, geo.trayH, geo.pieceW, geo.pieceH);
        geo.trayRows = fitted.rows;
        geo.trayCols = fitted.cols;
        geo.trayScale = util.clamp(fitted.scale, 0.3, 1);
      } else {
        geo.trayRows = count <= 4 ? 1 : (count <= 12 ? 2 : 3);
        geo.trayCols = Math.ceil(count / geo.trayRows);
        geo.trayScale = util.clamp(
          Math.min(
            geo.trayW / (geo.trayCols * geo.pieceW * TRAY_PITCH),
            geo.trayH / (geo.trayRows * geo.pieceH * TRAY_PITCH)
          ),
          0.3,
          1
        );
      }

      board.style.left = geo.boardX + 'px';
      board.style.top = geo.boardY + 'px';
      board.style.width = geo.boardW + 'px';
      board.style.height = geo.boardH + 'px';
      paintPeek();

      /* Inside the board's top corner: the stage has no margin to spare once
         the board is as wide as it can be, and the corner is the one place
         that is the same in every layout and in both reading directions. */
      peekButton.style.left =
        Math.max(geo.boardX, geo.boardX + geo.boardW - PEEK_SIZE - 8) + 'px';
      peekButton.style.top = (geo.boardY + 8) + 'px';

      slotNodes.forEach(function (node, index) {
        node.style.left = (index % cols) * geo.pieceW + 'px';
        node.style.top = Math.floor(index / cols) * geo.pieceH + 'px';
        node.style.width = geo.pieceW + 'px';
        node.style.height = geo.pieceH + 'px';
      });

      pieces.forEach(function (piece) {
        piece.node.style.width = geo.pieceW + 'px';
        piece.node.style.height = geo.pieceH + 'px';
        paintPiece(piece);
        if (piece !== draggingPiece) restPiece(piece);
      });
    }

    /* ---------- hold to peek ---------- */

    function showPeek() { board.classList.add('is-peeking'); }
    function hidePeek() { board.classList.remove('is-peeking'); }

    peekButton.addEventListener('pointerdown', function (ev) {
      /* Otherwise the press starts a native drag or a text selection, and the
         pointerup that ends the peek never arrives. */
      ev.preventDefault();
      showPeek();
    });
    /* pointerleave covers a mouse that slides off the button still held down;
       blur covers the keyboard losing the button mid-press. */
    ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(function (name) {
      peekButton.addEventListener(name, hidePeek);
    });
    peekButton.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') showPeek();
    });
    peekButton.addEventListener('keyup', hidePeek);

    /* ---------- picking a piece up ---------- */

    /**
     * Where a point on the stage falls on a piece's canvas, or null if it falls
     * outside it. Undoes the piece's scale and quarter turn, both of which the
     * canvas is carried through by the node's transform.
     */
    function toCanvasPoint(piece, x, y) {
      var w = geo.pieceW;
      var h = geo.pieceH;
      /* Only pieces resting in the tray are ever tested, and those are exactly
         the ones drawn at tray scale. */
      var scale = geo.trayScale;
      if (scale <= 0 || w <= 0 || h <= 0) return null;
      var dx = (x - (piece.left + w / 2)) / scale;
      var dy = (y - (piece.top + h / 2)) / scale;
      var turns = ((piece.rot % 4) + 4) % 4;
      var lx = dx;
      var ly = dy;
      if (turns === 1) { lx = dy; ly = -dx; }
      else if (turns === 2) { lx = -dx; ly = -dy; }
      else if (turns === 3) { lx = -dy; ly = dx; }
      var ox = w * TAB_OVERHANG;
      var oy = h * TAB_OVERHANG;
      var px = lx + w / 2 + ox;
      var py = ly + h / 2 + oy;
      if (px < 0 || py < 0 || px > w + ox * 2 || py > h + oy * 2) return null;
      return { x: px, y: py };
    }

    /** True when the piece has actually painted something at that canvas point. */
    function isPaintedAt(piece, point) {
      var ctx = piece.canvas.getContext('2d');
      if (!ctx) return true;
      var dpr = global.devicePixelRatio || 1;
      var x = util.clamp(Math.round(point.x * dpr), 0, piece.canvas.width - 1);
      var y = util.clamp(Math.round(point.y * dpr), 0, piece.canvas.height - 1);
      try {
        return ctx.getImageData(x, y, 1, 1).data[3] > 24;
      } catch (err) {
        /* A browser that refuses the read (a tainted canvas) must not make the
           piece unpickable; fall back to the plain rectangle. */
        return true;
      }
    }

    /**
     * Which piece a press belongs to.
     *
     * A piece's canvas is a rectangle wider than its cell so the tabs fit
     * inside it, and in the tray those rectangles overlap. Without this, a
     * press on a visible tab could land on the transparent corner of whichever
     * piece happens to be stacked above it and pick up the wrong piece - or,
     * on the board, a piece the child cannot even see there. The press goes to
     * the topmost piece with paint under the finger instead.
     */
    function pieceAt(clientX, clientY) {
      var rect = stage.getBoundingClientRect();
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      var found = null;
      /* `pieces` is in DOM order, so the last match is the topmost one. */
      pieces.forEach(function (piece) {
        /* A piece already home cannot be picked up, and one under the other
           hand is drawn at a scale toCanvasPoint does not account for. */
        if (piece.placed || piece === draggingPiece) return;
        var point = toCanvasPoint(piece, x, y);
        if (point && isPaintedAt(piece, point)) found = piece;
      });
      return found;
    }

    function flashRejected(piece) {
      piece.node.classList.remove('is-rejected');
      /* Reading offsetWidth restarts the CSS animation when the same piece is
         rejected twice in a row, which a child will certainly do. */
      void piece.node.offsetWidth;
      piece.node.classList.add('is-rejected');
    }

    function isOverBoard(x, y) {
      return x >= geo.boardX && x <= geo.boardX + geo.boardW &&
        y >= geo.boardY && y <= geo.boardY + geo.boardH;
    }

    function checkComplete() {
      if (finished) return;
      var done = pieces.every(function (piece) { return piece.placed; });
      if (!done) return;
      finished = true;
      winTimer = global.setTimeout(function () {
        winTimer = null;
        callbacks.onComplete(util.starsForMistakes(mistakes));
      }, 350);
    }

    function onPointerDown(ev, piece) {
      if (finished) return;
      var pressed = pieceAt(ev.clientX, ev.clientY);
      if (pressed) piece = pressed;
      if (piece.placed) return;
      var origin = { left: piece.left, top: piece.top };

      var started = KP.drag.begin(ev, piece.node, {
        onStart: function () {
          draggingPiece = piece;
          piece.node.classList.add('is-dragging');
          piece.node.style.transform = transformFor(piece, true);
          KP.audio.play('pickup');
        },
        onMove: function (state) {
          /* Stage size comes from `geo`, refreshed by layout() on every resize:
             reading clientWidth here would force a synchronous relayout on each
             pointer frame, right after the previous frame wrote left/top. */
          moveTo(
            piece,
            util.clamp(origin.left + state.dx, -geo.pieceW / 2, geo.stageW - geo.pieceW / 2),
            util.clamp(origin.top + state.dy, -geo.pieceH / 2, geo.stageH - geo.pieceH / 2)
          );
        },
        onEnd: function (state) {
          draggingPiece = null;
          piece.node.classList.remove('is-dragging');

          if (state.tap) {
            /* A tap is a turn request on rotating levels, and otherwise just a
               stray tap (or half a double-tap) that must not be punished. The
               tap radius is generous because a child's finger always drifts. */
            if (level.rotate) {
              piece.rot = (piece.rot + 1) % 4;
              KP.audio.play('flip');
            }
            restPiece(piece);
            return;
          }

          var centerX = piece.left + geo.pieceW / 2;
          var centerY = piece.top + geo.pieceH / 2;
          var target = slotPosition(piece);
          var distance = Math.hypot(
            centerX - (target.left + geo.pieceW / 2),
            centerY - (target.top + geo.pieceH / 2)
          );

          if (distance <= Math.max(geo.pieceW, geo.pieceH) * SNAP_FACTOR) {
            if (piece.rot !== 0) {
              /* Right place, wrong way up: still a miss, so the child learns
                 the piece has to be turned upright first. */
              mistakes++;
              KP.audio.play('wrong');
              flashRejected(piece);
              restPiece(piece);
              return;
            }
            piece.placed = true;
            piece.node.classList.add('is-placed');
            restPiece(piece);
            KP.audio.play('correct');
            checkComplete();
            return;
          }

          if (isOverBoard(centerX, centerY)) {
            mistakes++;
            KP.audio.play('wrong');
            flashRejected(piece);
          } else {
            KP.audio.play('drop');
          }
          restPiece(piece);
        }
      });

      if (started) ev.preventDefault();
    }

    /* Long-press and native drag would both fire in the middle of a slow drag. */
    KP.drag.harden(stage);

    layout();

    return {
      relayout: layout,
      destroy: function () {
        finished = true;
        if (winTimer !== null) global.clearTimeout(winTimer);
        winTimer = null;
        util.clear(mount);
      }
    };
  }

  KP.games.jigsaw = { id: 'jigsaw', levelCount: LEVELS.length, levels: LEVELS, create: create };
})(window);
