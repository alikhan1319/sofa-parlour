/* ============================================================
   Header — dropdown panels, drawer, scroll behaviour
   ============================================================

   The search field needs no JS of its own: it is always visible, and when
   predictive search is enabled Dawn's <predictive-search> element owns the
   input and its results.

   Nothing here touches the cart. Dawn's cart-drawer.js owns
   #cart-icon-bubble and re-renders it from sections/cart-icon-bubble.liquid
   on every cart change; handling the count here would fight it.
   ============================================================ */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(root) {
    if (!root || root.dataset.spInit === 'true') return;
    root.dataset.spInit = 'true';

    var panels = Array.prototype.slice.call(root.querySelectorAll('[data-sp-hd-panel]'));
    var opener = root.querySelector('[data-sp-hd-drawer-open]');

    // The drawer lives outside <header> so a sticky transform cannot become
    // its containing block, so resolve it from the document by its id.
    var drawerId = opener ? opener.getAttribute('aria-controls') : null;
    var drawer = drawerId ? document.getElementById(drawerId) : null;

    /* ----- Dropdown panels ------------------------------------------------ */

    function closePanels(except) {
      panels.forEach(function (panel) {
        if (panel === except || panel.hidden) return;
        panel.hidden = true;
        var btn = panel.parentElement && panel.parentElement.querySelector('[data-sp-hd-panel-toggle]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }

    /*  Keep an open panel on screen.

        CSS alone cannot do this: it would have to know how much room is left
        to the right of a given menu item, which depends on the label widths,
        the viewport and the font that actually loaded. Flipping by position
        in the list is the usual guess, and it is wrong — the second of three
        items is not necessarily near an edge, and right-aligning its panel
        shoves it off the OTHER side.

        So measure. The panel opens flush with its own link, and is nudged
        back only by however much it actually overhangs. */
    var EDGE = 16;

    function place(panel) {
      panel.style.left = '0px';

      var box = panel.getBoundingClientRect();
      var shift = 0;

      if (box.right > window.innerWidth - EDGE) {
        shift = window.innerWidth - EDGE - box.right;
      }
      // Never let the correction push it off the near side instead
      if (box.left + shift < EDGE) {
        shift = EDGE - box.left;
      }

      if (shift) panel.style.left = Math.round(shift) + 'px';
    }

    function openPanel(panel, btn) {
      closePanels(panel);
      panel.hidden = false;
      place(panel);
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    function closePanel(panel, btn) {
      panel.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    /*  Hover opens on a mouse, click opens everywhere.

        The hover binding is gated on a fine pointer that can actually hover.
        On a touch screen the first tap would otherwise fire a synthetic
        mouseenter AND the click, opening and immediately closing the panel —
        the classic reason a menu works on a laptop and not on a phone.

        Click is kept regardless, because it is what a keyboard sends when
        Enter or Space lands on the button. */
    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    root.querySelectorAll('[data-sp-hd-panel-toggle]').forEach(function (btn) {
      var item = btn.closest('.sp-hd__item');
      var panel = item && item.querySelector('[data-sp-hd-panel]');
      if (!panel) return;

      btn.addEventListener('click', function () {
        if (panel.hidden) openPanel(panel, btn);
        else closePanel(panel, btn);
      });

      if (!canHover || !item) return;

      item.addEventListener('mouseenter', function () {
        if (panel.hidden) openPanel(panel, btn);
      });

      item.addEventListener('mouseleave', function () {
        if (!panel.hidden) closePanel(panel, btn);
      });

      /*  Tab out of the group and it should close, but only once focus has
          actually landed somewhere else — relatedTarget is null while it is
          still in flight, and closing then would fight the click above. */
      item.addEventListener('focusout', function (e) {
        if (!e.relatedTarget) return;
        if (item.contains(e.relatedTarget)) return;
        if (!panel.hidden) closePanel(panel, btn);
      });
    });

    root.addEventListener('mouseleave', function () { closePanels(null); });

    // A resize while a panel is open invalidates the measurement above
    window.addEventListener('resize', function () {
      panels.forEach(function (panel) {
        if (!panel.hidden) place(panel);
      });
    });

    /* ----- Drawer ---------------------------------------------------------- */

    function setDrawer(open) {
      if (!drawer || open === drawer.classList.contains('is-open')) return;

      if (open) {
        drawer.hidden = false;
        // Paint it present-but-offscreen before transitioning in
        window.requestAnimationFrame(function () { drawer.classList.add('is-open'); });
        document.documentElement.style.overflow = 'hidden';
        if (opener) opener.setAttribute('aria-expanded', 'true');
        var first = drawer.querySelector('a, button');
        if (first) first.focus();
      } else {
        drawer.classList.remove('is-open');
        document.documentElement.style.overflow = '';
        if (opener) {
          opener.setAttribute('aria-expanded', 'false');
          opener.focus();
        }
        var done = function () {
          if (!drawer.classList.contains('is-open')) drawer.hidden = true;
          drawer.removeEventListener('transitionend', done);
        };
        if (reduced) done();
        else {
          drawer.addEventListener('transitionend', done);
          // transitionend never fires if the panel was never painted
          window.setTimeout(done, 450);
        }
      }
    }

    if (opener) {
      opener.addEventListener('click', function () {
        setDrawer(!drawer || !drawer.classList.contains('is-open'));
      });
    }

    if (drawer) {
      drawer.querySelectorAll('[data-sp-hd-drawer-close]').forEach(function (btn) {
        btn.addEventListener('click', function () { setDrawer(false); });
      });

      drawer.querySelectorAll('[data-sp-hd-acc-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var item = btn.closest('.sp-hd__drawer-item');
          if (!item) return;
          var open = !item.classList.contains('is-open');
          item.classList.toggle('is-open', open);
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      });
    }

    /* ----- Escape closes the topmost thing --------------------------------- */

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (drawer && drawer.classList.contains('is-open')) { setDrawer(false); return; }
      closePanels(null);
    });

    /* ----- Focus trap inside the drawer ------------------------------------ */

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      if (!drawer || !drawer.classList.contains('is-open')) return;

      var panel = drawer.querySelector('.sp-hd__drawer-panel');
      if (!panel) return;

      var focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    /* ----- Scroll ----------------------------------------------------------
       Condense past the first screenful, hide on the way down, return on the
       first upward move. Never while something here is open, or the control
       that opened it would vanish from under the cursor.                    */

    if (!root.classList.contains('sp-hd--sticky')) return;

    var lastY = window.pageYOffset || 0;
    var ticking = false;
    var CONDENSE_AT = 60;
    var HIDE_AFTER = 260;

    function anythingOpen() {
      if (drawer && drawer.classList.contains('is-open')) return true;
      if (panels.some(function (p) { return !p.hidden; })) return true;
      // Do not slide away while someone is typing a search
      var active = document.activeElement;
      return Boolean(active && root.contains(active) && active.matches('input, select, textarea'));
    }

    function onScroll() {
      var y = Math.max(0, window.pageYOffset || 0);
      root.classList.toggle('is-condensed', y > CONDENSE_AT);

      if (anythingOpen()) {
        root.classList.remove('is-hidden');
      } else if (y > HIDE_AFTER && y > lastY + 4) {
        root.classList.add('is-hidden');
      } else if (y < lastY - 4 || y <= CONDENSE_AT) {
        root.classList.remove('is-hidden');
      }

      lastY = y;
      ticking = false;
    }

    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(onScroll);
      },
      { passive: true }
    );

    onScroll();
  }

  function scan() {
    document.querySelectorAll('[data-sp-hd]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  document.addEventListener('shopify:section:load', scan);
})();
