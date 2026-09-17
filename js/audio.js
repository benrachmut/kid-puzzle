/**
 * All sound is synthesised with WebAudio: the brief forbids downloaded assets,
 * and generated tones also mean no loading delay between a click and its cue,
 * which is what makes the feedback feel responsive to a small child.
 */
(function (global) {
  'use strict';

  var KP = (global.KP = global.KP || {});

  var ctx = null;
  var master = null;
  var enabled = true;

  /**
   * Creates or resumes the AudioContext.
   * Browsers only allow this from inside a user gesture, so it is called from
   * the first pointer/key handler rather than at load time; failures are
   * swallowed because a silent game is still a playable game.
   */
  function unlock() {
    try {
      if (!ctx) {
        var Ctor = global.AudioContext || global.webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (err) {
      ctx = null;
    }
  }

  /**
   * Plays one shaped tone. The short attack/release envelope avoids the click
   * that a bare gain switch produces, which is unpleasant at child volume.
   */
  function tone(opts) {
    if (!enabled || !ctx || !master) return;
    try {
      var start = ctx.currentTime + (opts.delay || 0);
      var duration = opts.duration || 0.15;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.from, start);
      if (opts.to && opts.to !== opts.from) {
        osc.frequency.exponentialRampToValueAtTime(opts.to, start + duration);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(opts.volume || 0.6, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch (err) {
      /* A failed cue must never interrupt play. */
    }
  }

  function melody(notes, type) {
    notes.forEach(function (note, index) {
      tone({ from: note, to: note, type: type || 'triangle', duration: 0.18, delay: index * 0.12 });
    });
  }

  var CUES = {
    pickup: function () { tone({ from: 440, to: 720, type: 'sine', duration: 0.1 }); },
    drop: function () { tone({ from: 300, to: 180, type: 'sine', duration: 0.12 }); },
    correct: function () { melody([660, 880], 'triangle'); },
    wrong: function () { tone({ from: 220, to: 150, type: 'sawtooth', duration: 0.22, volume: 0.28 }); },
    flip: function () { tone({ from: 520, to: 660, type: 'square', duration: 0.07, volume: 0.25 }); },
    win: function () { melody([523, 659, 784, 1046, 1318], 'triangle'); },
    click: function () { tone({ from: 600, to: 600, type: 'sine', duration: 0.06, volume: 0.3 }); }
  };

  function play(name) {
    unlock();
    var cue = CUES[name];
    if (cue) cue();
  }

  function setEnabled(value) {
    enabled = !!value;
    /* Deliberately does not create the context: constructing one outside a user
       gesture starts it suspended and makes the browser log an autoplay
       warning. An existing context is still resumed when sound is switched back
       on; the first one is built by the gesture handler in the app shell. */
    if (enabled && ctx) unlock();
  }

  KP.audio = { play: play, unlock: unlock, setEnabled: setEnabled, isEnabled: function () { return enabled; } };
})(window);
