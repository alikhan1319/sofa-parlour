/* ============================================================
   Pointer tilt
   ============================================================

   Writes --rx / --ry onto [data-sp-tilt] from the pointer's position within
   it. The CSS owns the transform; this only supplies two numbers.

   Deliberately inert on touch and under reduced motion — the card is
   designed to look right at 0deg, so doing nothing is a complete fallback
   rather than a degraded one.

   Listeners are attached per element on first pointer entry rather than to
   every card up front, so a grid of twenty products does not carry twenty
   idle mousemove handlers.
   ============================================================ */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduced || !fine) return;

  var MAX = 6; // degrees; past about 8 it stops reading as a lift and starts reading as a wobble

  function bind(el) {
    if (el.dataset.spTilt === 'on') return;
    el.dataset.spTilt = 'on';

    var frame = null;

    function move(e) {
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        frame = null;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        // -0.5 .. 0.5 from the centre
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        // Y movement tilts around X, and the sign is inverted so the card
        // leans toward the cursor rather than away from it.
        el.style.setProperty('--rx', (-y * MAX).toFixed(2) + 'deg');
        el.style.setProperty('--ry', (x * MAX).toFixed(2) + 'deg');
      });
    }

    function reset() {
      if (frame) { window.cancelAnimationFrame(frame); frame = null; }
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    }

    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', reset);
    // A card can be left by tabbing as well as by the pointer
    el.addEventListener('focusout', function (e) {
      if (!el.contains(e.relatedTarget)) reset();
    });
  }

  document.addEventListener(
    'mouseover',
    function (e) {
      var el = e.target.closest && e.target.closest('[data-sp-tilt]');
      if (el) bind(el);
    },
    { passive: true }
  );
})();
