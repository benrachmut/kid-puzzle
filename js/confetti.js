/**
 * Canvas confetti for the celebration screen.
 *
 * It runs on its own full-screen canvas rather than as DOM nodes so a few
 * hundred particles cost nothing, and it stops itself after a fixed burst —
 * an animation left running behind the next puzzle would keep the laptop fan
 * spinning for no reason.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  var DURATION_MS = 2600;

  var canvas = null;
  var ctx = null;
  var particles = [];
  var frame = null;
  var endsAt = 0;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  /** Matches the backing store to the viewport; also called on resize mid-burst. */
  function sizeCanvas() {
    if (!canvas) return;
    canvas.width = global.innerWidth;
    canvas.height = global.innerHeight;
  }

  function spawn(count) {
    var w = canvas.width;
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: -20 - Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 2 + Math.random() * 3.5,
        size: 6 + Math.random() * 8,
        spin: (Math.random() - 0.5) * 0.3,
        angle: Math.random() * Math.PI,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  }

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (Date.now() < endsAt) {
      frame = global.requestAnimationFrame(tick);
    } else {
      stop();
    }
  }

  /** Restarting an already-running burst is safe: it simply refills the sky. */
  function start() {
    ensureCanvas();
    sizeCanvas();
    spawn(140);
    endsAt = Date.now() + DURATION_MS;
    canvas.classList.add('is-visible');
    if (frame === null) frame = global.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame !== null) {
      global.cancelAnimationFrame(frame);
      frame = null;
    }
    particles = [];
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvas) canvas.classList.remove('is-visible');
  }

  global.addEventListener('resize', function () {
    if (frame !== null) sizeCanvas();
  });

  KP.confetti = { start: start, stop: stop };
})(window);
