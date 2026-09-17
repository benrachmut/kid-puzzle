/**
 * Sliding picture puzzle: tiles of a drawn scene with one gap, click a tile
 * next to the gap to slide it in.
 *
 * The board is only ever shuffled by replaying legal moves from the solved
 * state, which is what guarantees it is solvable - a random permutation of a
 * 15-puzzle is unsolvable half the time, and an unsolvable board is an
 * unwinnable game for a child who cannot be told why.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});
  KP.games = KP.games || {};

  var util = KP.util;

  var LEVELS = [
    { cols: 3, rows: 3, scene: 'meadow' },
    { cols: 4, rows: 4, scene: 'space' }
  ];

  var TILE_PIXELS = 180;
  var SHUFFLE_MOVES = 200;

  function create(mount, levelIndex, callbacks) {
    var level = LEVELS[util.clamp(levelIndex, 0, LEVELS.length - 1)];
    var cols = level.cols;
    var rows = level.rows;
    var size = cols * rows;

    var root = util.el('div', 'board');
    var hud = util.el('div', 'hud', { 'data-i18n-aria': 'memory.moves' });
    var hudIcon = util.el('span', 'hud__icon');
    hudIcon.innerHTML = KP.art.icon('replay');
    var hudValue = util.el('span', 'hud__value');
    hud.appendChild(hudIcon);
    hud.appendChild(hudValue);
    root.appendChild(hud);

    var grid = util.el('div', 'slide', { role: 'group', 'data-i18n-aria': 'slide.board' });
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', rows);
    root.appendChild(grid);
    mount.appendChild(root);

    /* board[position] = tile id, or null for the gap. Tile id equals the
       position the tile belongs in, so "solved" is simply id === position. */
    var board = [];
    var gap = size - 1;
    var moves = 0;
    var finished = false;
    var winTimer = null;
    var tileCanvases = [];

    for (var i = 0; i < size; i++) board.push(i === gap ? null : i);

    /** Pre-renders each tile once; CSS scales them, so resizing needs no redraw. */
    function buildTiles() {
      for (var id = 0; id < size - 1; id++) {
        var canvas = util.el('canvas');
        canvas.width = TILE_PIXELS;
        canvas.height = TILE_PIXELS;
        var ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(-(id % cols) * TILE_PIXELS, -Math.floor(id / cols) * TILE_PIXELS);
          KP.art.paintScene(level.scene, ctx, TILE_PIXELS * cols, TILE_PIXELS * rows);
        }
        tileCanvases.push(canvas);
      }
    }

    function neighbours(position) {
      var col = position % cols;
      var row = Math.floor(position / cols);
      var list = [];
      if (col > 0) list.push(position - 1);
      if (col < cols - 1) list.push(position + 1);
      if (row > 0) list.push(position - cols);
      if (row < rows - 1) list.push(position + cols);
      return list;
    }

    function slide(position) {
      board[gap] = board[position];
      board[position] = null;
      gap = position;
    }

    /**
     * Walks the gap randomly, never immediately undoing the previous step so
     * the board actually travels, and re-runs if it lands back on solved.
     */
    function shuffle() {
      var previous = -1;
      for (var step = 0; step < SHUFFLE_MOVES; step++) {
        var options = neighbours(gap).filter(function (position) { return position !== previous; });
        var chosen = options[Math.floor(Math.random() * options.length)];
        previous = gap;
        slide(chosen);
      }
      if (isSolved()) shuffle();
    }

    function isSolved() {
      for (var position = 0; position < size - 1; position++) {
        if (board[position] !== position) return false;
      }
      return true;
    }

    /**
     * Rated on moves against the board size: a child who nudges tiles at random
     * still finishes, but a tidy solve is worth more.
     *
     * The thresholds have to clear the *optimal* solution length, which for a
     * shuffled board averages well above one move per tile - about 22 moves for
     * the 3x3 and about 50 for the 4x4 - so `size * 2` would put three stars out
     * of reach even for perfect play.
     */
    function starsForMoves() {
      if (moves <= size * 6) return 3;
      if (moves <= size * 12) return 2;
      return 1;
    }

    function render() {
      util.clear(grid);
      hudValue.textContent = String(moves);
      board.forEach(function (id, position) {
        if (id === null) {
          grid.appendChild(util.el('div', 'slide__gap'));
          return;
        }
        var cell = util.el('button', 'btn slide__tile', {
          type: 'button', 'data-i18n-aria': 'slide.tile'
        });
        cell.appendChild(tileCanvases[id]);
        cell.addEventListener('click', function () { onTileClick(position); });
        grid.appendChild(cell);
      });
      /* Every move rebuilds the tiles, long after the shell applied the
         translations, so this subtree has to be labelled again. */
      KP.i18n.apply(grid);
    }

    /**
     * Sizes the board in pixels so that every tile stays square.
     *
     * `aspect-ratio` alone is not enough: as a flex item the grid is stretched
     * to the column's full width, so on a screen that is narrower than it is
     * tall the tiles come out as tall rectangles and the sliced picture is
     * visibly squashed. Here the grid instead takes the largest box with square
     * cells that fits the room the HUD leaves it.
     */
    function relayout() {
      /* Measure with the grid collapsed: at its natural size it is as wide as
         the pre-rendered tiles, which pushes the parent wider than the screen
         and would make the board grow a little more on every resize. */
      grid.style.width = '0';
      grid.style.height = '0';
      var rootStyle = global.getComputedStyle(root);
      var gridStyle = global.getComputedStyle(grid);
      var paddingX = parseFloat(gridStyle.paddingLeft) + parseFloat(gridStyle.paddingRight);
      var paddingY = parseFloat(gridStyle.paddingTop) + parseFloat(gridStyle.paddingBottom);
      var gapX = (parseFloat(gridStyle.columnGap) || 0) * (cols - 1);
      var gapY = (parseFloat(gridStyle.rowGap) || 0) * (rows - 1);
      var availableWidth = root.clientWidth
        - parseFloat(rootStyle.paddingLeft) - parseFloat(rootStyle.paddingRight);
      var availableHeight = root.clientHeight
        - parseFloat(rootStyle.paddingTop) - parseFloat(rootStyle.paddingBottom)
        - hud.offsetHeight - (parseFloat(rootStyle.rowGap) || 0);
      var cell = Math.min((availableWidth - paddingX - gapX) / cols,
                          (availableHeight - paddingY - gapY) / rows);
      /* Reads as zero while the game screen is still hidden - keep whatever the
         stylesheet gave us rather than collapsing the board to nothing. */
      if (!(cell > 0)) return;
      grid.style.width = Math.floor(cell * cols + paddingX + gapX) + 'px';
      grid.style.height = Math.floor(cell * rows + paddingY + gapY) + 'px';
    }

    function onTileClick(position) {
      if (finished) return;
      if (neighbours(gap).indexOf(position) === -1) {
        /* Not next to the gap: a miss, not a mistake worth a harsh sound. */
        KP.audio.play('drop');
        return;
      }
      slide(position);
      moves++;
      KP.audio.play('flip');
      render();
      if (!isSolved()) return;
      finished = true;
      KP.audio.play('correct');
      winTimer = global.setTimeout(function () {
        winTimer = null;
        callbacks.onComplete(starsForMoves());
      }, 350);
    }

    buildTiles();
    shuffle();
    render();
    relayout();

    return {
      relayout: relayout,
      destroy: function () {
        finished = true;
        if (winTimer !== null) global.clearTimeout(winTimer);
        winTimer = null;
        util.clear(mount);
      }
    };
  }

  KP.games.slide = { id: 'slide', levelCount: LEVELS.length, levels: LEVELS, create: create };
})(window);
