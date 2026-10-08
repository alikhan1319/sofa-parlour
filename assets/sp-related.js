/* ============================================================
   You may also like — rail arrows
   ============================================================

   The rail scrolls natively: by touch, by trackpad, and by keyboard once a
   card inside it has focus. This file only adds the arrows, and only when
   they would do something.

   They start hidden in the markup and are revealed here, so a shopper
   without JavaScript is never shown two dead buttons over a list that
   already works.
   ============================================================ */

(function () {
  'use strict';

  if (window.__spRelated) return;
  window.__spRelated = true;

  function init(rail) {
    if (!rail || rail.dataset.spRlBound) return;

    var section = rail.closest('section');
    var nav = section && section.querySelector('[data-sp-rl-nav]');
    if (!nav) return;

    var prev = nav.querySelector('[data-sp-rl-prev]');
    var next = nav.querySelector('[data-sp-rl-next]');
    if (!prev || !next) return;

    rail.dataset.spRlBound = '1';

    /*  One card plus one gap. Measured rather than assumed, because the card
        width is a percentage of a track whose own width depends on the
        viewport and on the section's "cards in view" setting. */
    function step() {
      var card = rail.querySelector('.sp-bs__item');
      if (!card) return rail.clientWidth;
      var style = window.getComputedStyle(rail);
      var gap = parseFloat(style.columnGap || style.gap) || 0;
      return card.getBoundingClientRect().width + gap;
    }

    function sync() {
      // A rail that does not overflow needs no arrows at all.
      var overflows = rail.scrollWidth - rail.clientWidth > 2;
      nav.hidden = !overflows;
      if (!overflows) return;

      var max = rail.scrollWidth - rail.clientWidth;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max - 2;
    }

    /*  scrollBy honours scroll-behavior: smooth from the stylesheet, which
        is also where prefers-reduced-motion turns it off — so the preference
        is respected without being read twice. */
    prev.addEventListener('click', function () {
      rail.scrollBy({ left: -step(), behavior: 'auto' });
    });

    next.addEventListener('click', function () {
      rail.scrollBy({ left: step(), behavior: 'auto' });
    });

    rail.addEventListener('scroll', function () {
      window.requestAnimationFrame(sync);
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(sync).observe(rail);
    } else {
      window.addEventListener('resize', sync);
    }

    sync();
  }

  function scan() {
    document.querySelectorAll('[data-sp-rl-rail]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  document.addEventListener('shopify:section:load', scan);

  /*  The rail arrives via fetch: <product-recommendations> replaces its own
      innerHTML long after load and without firing shopify:section:load, so
      neither hook above would ever see it. */
  if ('MutationObserver' in window) {
    var pending = null;

    new MutationObserver(function (records) {
      var hit = false;

      for (var i = 0; i < records.length && !hit; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.matches('[data-sp-rl-rail]') || node.querySelector('[data-sp-rl-rail]')) {
            hit = true;
            break;
          }
        }
      }

      if (!hit) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(scan, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
