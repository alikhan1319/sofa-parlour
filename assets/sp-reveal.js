/* ============================================================
   Scroll reveal — shared
   ============================================================

   Adds .is-in to any [data-sp-reveal] as it enters the viewport. The CSS
   owns the actual animation; this only decides when.

   Deliberately not a load-time animation: a section below the fold would
   finish animating before anyone scrolled to it, which is the same as
   having no animation at all.
   ============================================================ */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal(el) {
    el.classList.add('is-in');
  }

  function scan() {
    var items = document.querySelectorAll('[data-sp-reveal]:not(.is-in)');
    if (!items.length) return;

    // No observer, or the visitor asked for less motion: show everything now.
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(reveal);
      return;
    }

    var io = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          reveal(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    items.forEach(function (el) {
      // Anything already on screen at load is revealed without waiting
      var box = el.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) reveal(el);
      else io.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // The theme editor re-renders sections outright
  document.addEventListener('shopify:section:load', scan);

  /*  Markup that arrives AFTER load.

      <product-recommendations> fetches its cards and replaces its own
      innerHTML, long after DOMContentLoaded and without firing
      shopify:section:load. Every card in it carries data-sp-reveal and would
      sit at opacity 0 for ever, so the whole section renders as empty space.

      An observer catches that, and anything else added later, without every
      async grid having to know this file exists. Filtered to element nodes
      that actually contain a target, so ordinary DOM churn costs nothing. */
  if ('MutationObserver' in window) {
    var pending = null;

    new MutationObserver(function (records) {
      var hit = false;

      for (var i = 0; i < records.length && !hit; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.matches('[data-sp-reveal]') || node.querySelector('[data-sp-reveal]')) { hit = true; break; }
        }
      }

      if (!hit) return;
      // Coalesce: one innerHTML swap can deliver a dozen records.
      window.clearTimeout(pending);
      pending = window.setTimeout(scan, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }

})();
