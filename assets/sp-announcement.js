/* ============================================================
   Announcement bar — message rotation
   ============================================================

   Cross-fades the messages on a timer and runs a champagne rule out across
   the interval so the change is expected rather than sudden.

   Rotation stops on hover and on keyboard focus, so a message with a link
   cannot slide away while someone is reaching for it. It also stops when
   the tab is hidden — otherwise a visitor returning after ten minutes gets
   a burst of queued transitions.
   ============================================================ */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(root) {
    if (!root || root.dataset.spInit === 'true') return;
    root.dataset.spInit = 'true';

    var msgs = Array.prototype.slice.call(root.querySelectorAll('[data-sp-ann-msg]'));
    if (msgs.length < 2) return;

    var progress = root.querySelector('[data-sp-ann-progress]');
    var seconds = parseFloat(root.getAttribute('data-interval')) || 5;
    var index = 0;
    var timer = null;
    var paused = false;

    function show(next) {
      msgs[index].classList.remove('is-current');
      index = (next + msgs.length) % msgs.length;
      msgs[index].classList.add('is-current');
    }

    function runProgress() {
      if (!progress || reduced) return;
      // Restart the transition: clear it, force a reflow, then re-arm.
      progress.classList.remove('is-running');
      progress.style.setProperty('--sp-ann-dur', seconds + 's');
      void progress.offsetWidth;
      progress.classList.add('is-running');
    }

    function stopProgress() {
      if (!progress) return;
      progress.classList.remove('is-running');
    }

    function schedule() {
      window.clearTimeout(timer);
      if (paused) return;
      runProgress();
      timer = window.setTimeout(function () {
        show(index + 1);
        schedule();
      }, seconds * 1000);
    }

    function pause() {
      paused = true;
      window.clearTimeout(timer);
      stopProgress();
    }

    function resume() {
      if (!paused) return;
      paused = false;
      schedule();
    }

    root.addEventListener('mouseenter', pause);
    root.addEventListener('mouseleave', resume);
    root.addEventListener('focusin', pause);
    root.addEventListener('focusout', function (e) {
      // Only resume once focus has genuinely left the bar
      if (root.contains(e.relatedTarget)) return;
      resume();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
      else resume();
    });

    schedule();
  }

  function scan() {
    document.querySelectorAll('[data-sp-ann]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  document.addEventListener('shopify:section:load', scan);
})();
