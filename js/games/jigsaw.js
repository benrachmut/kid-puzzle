/**
 * Jigsaw: drag pieces of a drawn scene onto the board.
 *
 * Geometry is recomputed from the stage size on every layout instead of being
 * fixed at build time, because the window can be resized mid-puzzle and the
 * pieces must follow. Piece positions are therefore stored as state (placed or
 * tray-slot) rather than as pixel values that would go stale.
 *
 * The picture is either the level's drawn scene or, when the shell passes
 * `callbacks.image`, a photo from the phone. Both are painted through one
 * painter that fills the whole board box, so the ghost and every piece keep
 * showing slices of the same framing - including after a relayout, which
 * repaints them all from that painter again.
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
  var BOARD_HEIGHT_SHARE = 0.6;
  /** A drop counts as "close enough" within this fraction of a piece. */
  var SNAP_FACTOR = 0.7;

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    var paintPicture = KP.art.picturePainter(level.scene, callbacks.image);
    var cols = level.cols;
    var rows = level.rows;
    var count = cols * rows;

    var stage = util.el('div', 'stage stage--ltr', { role: 'group', 'data-i18n-aria': 'jigsaw.board' });
    var board = util.el('div', 'jig-board');
    var ghost = util.el('canvas', 'jig-board__ghost');
    board.appendChild(ghost);
    stage.appendChild(board);
    mount.appendChild(stage);

    var geo = { stageW: 0, stageH: 0, boardX: 0, boardY: 0, boardW: 0, boardH: 0,
      pieceW: 0, pieceH: 0, trayTop: 0, trayW: 0, trayH: 0, trayCols: 1,
      trayRows: 1, trayScale: 1 };

    var pieces = [];
    var draggingPiece = null;
    var mistakes = 0;
    var finished = false;
    var winTimer = null;

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

      var piece = {
        slot: slotIndex,
        col: slotIndex % cols,
        row: Math.floor(slotIndex / cols),
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

    /** Device-pixel-aware canvas painting keeps the art sharp on retina laptops. */
    function paintCanvas(canvas, w, h, offsetX, offsetY, fullW, fullH) {
      if (w <= 0 || h <= 0) return;
      var dpr = global.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(-offsetX, -offsetY);
      paintPicture(ctx, fullW, fullH);
      ctx.restore();
    }

    function traySlotPosition(trayIndex) {
      var cellW = geo.trayW / geo.trayCols;
      var cellH = geo.trayH / geo.trayRows;
      var col = trayIndex % geo.trayCols;
      var row = Math.floor(trayIndex / geo.trayCols);
      return {
        left: PAD + cellW * (col + 0.5) - geo.pieceW / 2,
        top: geo.trayTop + cellH * (row + 0.5) - geo.pieceH / 2
      };
    }

    function slotPosition(piece) {
      return {
        left: geo.boardX + piece.col * geo.pieceW,
        top: geo.boardY + piece.row * geo.pieceH
      };
    }

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
      var maxW = W - PAD * 2;
      var maxH = H * BOARD_HEIGHT_SHARE - PAD;
      geo.boardW = Math.max(40, Math.min(maxW, maxH * aspect));
      geo.boardH = geo.boardW / aspect;
      geo.boardX = (W - geo.boardW) / 2;
      geo.boardY = PAD;
      geo.pieceW = geo.boardW / cols;
      geo.pieceH = geo.boardH / rows;

      geo.trayTop = geo.boardY + geo.boardH + PAD;
      geo.trayW = W - PAD * 2;
      geo.trayH = Math.max(geo.pieceH, H - geo.trayTop - PAD);
      geo.trayRows = count <= 4 ? 1 : (count <= 12 ? 2 : 3);
      geo.trayCols = Math.ceil(count / geo.trayRows);
      geo.trayScale = util.clamp(
        Math.min(
          geo.trayW / (geo.trayCols * geo.pieceW * 1.1),
          geo.trayH / (geo.trayRows * geo.pieceH * 1.1)
        ),
        0.3,
        1
      );

      board.style.left = geo.boardX + 'px';
      board.style.top = geo.boardY + 'px';
      board.style.width = geo.boardW + 'px';
      board.style.height = geo.boardH + 'px';
      paintCanvas(ghost, geo.boardW, geo.boardH, 0, 0, geo.boardW, geo.boardH);

      slotNodes.forEach(function (node, index) {
        node.style.left = (index % cols) * geo.pieceW + 'px';
        node.style.top = Math.floor(index / cols) * geo.pieceH + 'px';
        node.style.width = geo.pieceW + 'px';
        node.style.height = geo.pieceH + 'px';
      });

      pieces.forEach(function (piece) {
        piece.node.style.width = geo.pieceW + 'px';
        piece.node.style.height = geo.pieceH + 'px';
        paintCanvas(
          piece.canvas, geo.pieceW, geo.pieceH,
          piece.col * geo.pieceW, piece.row * geo.pieceH,
          geo.boardW, geo.boardH
        );
        if (piece !== draggingPiece) restPiece(piece);
      });
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
      if (finished || piece.placed) return;
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

          if (!state.moved) {
            /* A click is a turn request on rotating levels, and otherwise just
               a stray tap (or half a double-click) that must not be punished. */
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
