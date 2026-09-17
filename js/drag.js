/**
 * One pointer-drag implementation shared by the jigsaw and the matching game.
 *
 * Pointer events (not mouse events) are used so a trackpad, a mouse and a touch
 * screen all behave the same, and pointer capture guarantees we still receive
 * the release even when the child lets go outside the window — without it a
 * piece would stay glued to the cursor, which is the classic way these games
 * get stuck.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var active = null;

  /**
   * How far a gesture may wander and still count as a tap.
   *
   * A finger never holds still: what a child means as a tap routinely drifts
   * several pixels, and at a 3px threshold a tap on a phone reads as a drag.
   * This is what lets one tap rotate a jigsaw piece or slide a tile, while a
   * real drag of the same piece is still a drag.
   */
  var TAP_SLOP = 12;

  function swallow(ev) {
    ev.preventDefault();
  }

  /**
   * Starts a drag for one element.
   * Returns false when the gesture is ignored: a second button, or a second
   * pointerdown arriving while a drag is already running (rapid clicking).
   */
  function begin(ev, node, handlers) {
    if (active) return false;
    if (ev.button !== undefined && ev.button !== 0) return false;

    var state = {
      node: node,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      x: ev.clientX,
      y: ev.clientY,
      dx: 0,
      dy: 0,
      /* Sticky: once the child has clearly dragged, bringing the piece back
         past the start must not turn the gesture into a tap again. */
      tap: true
    };
    active = state;

    function onMove(moveEv) {
      if (moveEv.pointerId !== state.pointerId) return;
      state.x = moveEv.clientX;
      state.y = moveEv.clientY;
      state.dx = state.x - state.startX;
      state.dy = state.y - state.startY;
      if (Math.max(Math.abs(state.dx), Math.abs(state.dy)) > TAP_SLOP) state.tap = false;
      if (handlers.onMove) handlers.onMove(state);
    }

    function detach() {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', finish);
      node.removeEventListener('pointercancel', finish);
      try {
        if (node.hasPointerCapture && node.hasPointerCapture(state.pointerId)) {
          node.releasePointerCapture(state.pointerId);
        }
      } catch (err) {
        /* Capture may already be gone if the node was removed mid-drag. */
      }
      active = null;
    }

    function finish(endEv) {
      if (endEv && endEv.pointerId !== state.pointerId) return;
      detach();
      if (handlers.onEnd) handlers.onEnd(state);
    }

    /* Teardown path: the board is being thrown away, so the drop must not be
       scored - but `active` has to be released or every later drag is refused. */
    state.abort = detach;

    try {
      node.setPointerCapture(ev.pointerId);
    } catch (err) {
      /* Capture is an optimisation; the listeners below still work without it. */
    }
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', finish);

    if (handlers.onStart) handlers.onStart(state);
    return true;
  }

  /**
   * Drops any drag in flight without reporting a drop.
   * Called when a board is torn down mid-gesture (a second finger on the back
   * button while a piece is held): the dragged node disappears with the board,
   * so its pointerup never arrives and `active` would otherwise stay set and
   * make `begin` refuse every drag for the rest of the session.
   */
  function cancel() {
    if (active) active.abort();
  }

  /**
   * Stops the browser's own touch gestures on a play surface.
   *
   * A slow drag by a small hand is exactly the gesture Android Chrome reads as
   * a long press: it offers to save the canvas as an image, or starts a native
   * element drag, and either one strands the piece mid-gesture. Both events
   * bubble, so one call with the game's root covers every piece and canvas
   * inside it, including the ones built later.
   *
   * The CSS half of this - which browser gestures the boards give up - lives in
   * the touch section of the stylesheet.
   */
  function harden(root) {
    root.setAttribute('draggable', 'false');
    root.addEventListener('contextmenu', swallow);
    root.addEventListener('dragstart', swallow);
  }

  KP.drag = { begin: begin, cancel: cancel, harden: harden };
})(window);
