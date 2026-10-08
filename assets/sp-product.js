/* ============================================================
   Product page
   ============================================================

   Gallery, option pickers, and keeping the two in step.

   The variant JSON is rendered by Liquid with money already formatted, so
   nothing here reassembles a price from pennies. Every string this file
   writes into the page came from the server.

   Add to cart is NOT handled here — sp-quickadd.js owns the submit, and the
   buy box carries data-sp-quickadd-root so it picks the form up with no new
   code. This file only keeps the form's hidden variant id correct.
   ============================================================ */

(function () {
  'use strict';

  if (window.__spProduct) return;
  window.__spProduct = true;

  function init(root) {
    if (!root || root.dataset.spPdBound) return;
    root.dataset.spPdBound = '1';

    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-sp-pd-slide]'));
    var thumbs = Array.prototype.slice.call(root.querySelectorAll('[data-sp-pd-thumb]'));
    var shown = slides.map(function () { return true; });

    /* ----- Gallery -------------------------------------------------------- */

    function show(i) {
      if (i < 0 || i >= slides.length) return;
      // A thumbnail the shopper can see is a thumbnail that must work, so a
      // direct request re-admits its slide rather than being dropped.
      if (!shown[i]) shown[i] = true;
      slides[i].hidden = false;
      if (thumbs[i]) thumbs[i].hidden = false;
      slides.forEach(function (s, n) {
        var on = n === i;
        s.classList.toggle('is-active', on);
        // Pause a video that scrolls out of view rather than leaving it
        // playing behind another slide.
        if (!on) {
          var vid = s.querySelector('video');
          if (vid && typeof vid.pause === 'function') vid.pause();
        }
      });
      thumbs.forEach(function (t, n) {
        t.classList.toggle('is-active', n === i);
        t.setAttribute('aria-pressed', n === i ? 'true' : 'false');
      });
    }

    function norm(v) { return (v || '').toLowerCase().trim(); }

    /*  Narrow the gallery to one colour: that colour's own images, plus any
        image with no colour of its own — a scale drawing, a fabric close-up,
        the room set. Those belong to every colour, so they always stay.

        Hidden outright rather than dimmed: a half-visible thumbnail of the
        wrong fabric still reads as something you can pick. */
    function filter(colour) {
      var want = norm(colour);
      var matched = 0;

      if (want) {
        slides.forEach(function (s) {
          if (norm(s.getAttribute('data-colour')) === want) matched++;
        });
      }

      // No image resolved to this colour: show everything rather than
      // leaving the shopper with nothing but the shared shots.
      var narrow = want && matched > 0;
      var first = -1;

      slides.forEach(function (s, n) {
        var on = !narrow
          || s.getAttribute('data-shared') === 'true'
          || norm(s.getAttribute('data-colour')) === want;

        shown[n] = on;
        s.hidden = !on;
        if (thumbs[n]) thumbs[n].hidden = !on;
        if (on && first === -1) first = n;
      });

      return first;
    }

    /*  The colour currently on screen. Tracked here rather than re-read from
        the section's data-selected-colour, which describes the variant the
        PAGE loaded with and goes stale the moment anything is picked. */
    var currentColour = root.getAttribute('data-selected-colour') || '';

    function toColour(colour, preferMediaId) {
      currentColour = colour || '';

      var first = filter(currentColour);
      var want = norm(currentColour);
      var byMedia = -1;
      var byColour = -1;

      slides.forEach(function (s, n) {
        if (!shown[n]) return;
        if (byMedia === -1 && preferMediaId && s.getAttribute('data-media-id') === String(preferMediaId)) byMedia = n;
        // The first image that is genuinely THIS colour, not a shared shot
        if (byColour === -1 && want && norm(s.getAttribute('data-colour')) === want) byColour = n;
      });

      var target = byMedia;
      if (target === -1) target = byColour;
      if (target === -1) target = first;

      /*  Always move. The previous version only moved when the variant had a
          featured image or the active slide had been filtered away — so on a
          shop that has not linked variants to images in the admin, picking a
          colour narrowed the gallery and then sat on whatever shared shot was
          already showing. Nothing appeared to happen, which is the whole
          point of picking a colour. */
      if (target > -1) show(target);
    }

    thumbs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
    });

    if (root.querySelector('[data-sp-pd-colour-group]')) {
      var firstShown = filter(root.getAttribute('data-selected-colour'));
      // Liquid marks slide 0 active; the filter may just have hidden it.
      var active = slides.findIndex(function (s) { return s.classList.contains('is-active'); });
      if (firstShown > -1 && (active === -1 || !shown[active])) show(firstShown);
    }

    /* ----- Quantity ------------------------------------------------------- */

    var qty = root.querySelector('.sp-pd__qty-input');
    root.querySelectorAll('[data-sp-pd-qty]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!qty) return;
        var next = (parseInt(qty.value, 10) || 1) + parseInt(btn.getAttribute('data-sp-pd-qty'), 10);
        qty.value = Math.max(1, next);
      });
    });

    /* ----- Variants ------------------------------------------------------- */

    var json = root.querySelector('[data-sp-pd-variants]');
    if (!json) return;

    var variants;
    try { variants = JSON.parse(json.textContent); } catch (e) { return; }

    var groups = Array.prototype.slice.call(root.querySelectorAll('[data-sp-pd-option]'));
    var idInput = root.querySelector('[data-sp-pd-id]');
    var priceEl = root.querySelector('[data-sp-pd-price]');
    var wasEl = root.querySelector('[data-sp-pd-was]');
    var skuEl = root.querySelector('[data-sp-pd-sku]');
    var addBtn = root.querySelector('[data-sp-pd-add]');
    var addLabel = root.querySelector('[data-sp-pd-add-label]');
    var addPrice = root.querySelector('[data-sp-pd-add-price]');
    var soldOut = addLabel ? addLabel.getAttribute('data-soldout') : null;
    // Captured before anything overwrites it, so an in-stock variant chosen
    // after a sold-out one gets its own label back rather than keeping
    // "Sold out" on a button that now works.
    var inStock = addLabel ? addLabel.textContent.trim() : '';

    var chosen = {};
    groups.forEach(function (g) {
      var active = g.querySelector('.is-active');
      chosen[g.getAttribute('data-sp-pd-option')] = active ? active.getAttribute('data-value') : null;
    });

    function find() {
      // Build the option array BY INDEX. DOM order is not option order.
      var want = new Array(groups.length).fill(null);
      groups.forEach(function (g, domIndex) {
        var i = parseInt(g.getAttribute('data-sp-pd-index'), 10);
        if (isNaN(i) || i < 0 || i >= groups.length) i = domIndex;
        want[i] = chosen[g.getAttribute('data-sp-pd-option')];
      });

      for (var n = 0; n < variants.length; n++) {
        var ok = true;
        for (var k = 0; k < want.length; k++) {
          if (want[k] !== null && variants[n].options[k] !== want[k]) { ok = false; break; }
        }
        if (ok) return variants[n];
      }
      return null;
    }

    function paint(variant) {
      if (!variant) {
        if (addBtn) addBtn.disabled = true;
        if (addLabel) addLabel.textContent = addLabel.getAttribute('data-unavailable') || 'Unavailable';
        if (addPrice) addPrice.hidden = true;
        return;
      }

      if (idInput) idInput.value = variant.id;
      if (priceEl) priceEl.textContent = variant.price;

      if (wasEl) {
        wasEl.hidden = !variant.on_sale;
        if (variant.on_sale) wasEl.textContent = variant.compare_at;
      }

      if (skuEl) {
        skuEl.textContent = variant.sku || '';
        skuEl.hidden = !variant.sku;
      }

      if (addBtn) addBtn.disabled = !variant.available;

      if (addLabel) {
        if (!variant.available) addLabel.textContent = soldOut || 'Sold out';
        else addLabel.textContent = inStock;
      }
      if (addPrice) {
        addPrice.hidden = !variant.available;
        addPrice.textContent = variant.price;
      }

      /*  Keep the address bar honest. replaceState rather than pushState:
          picking a fabric is not a page the shopper wants to press Back
          through one swatch at a time. */
      var url = root.getAttribute('data-url');
      if (url && window.history && window.history.replaceState) {
        window.history.replaceState({}, '', url + '?variant=' + variant.id);
      }
    }

    groups.forEach(function (g) {
      var name = g.getAttribute('data-sp-pd-option');
      var label = g.querySelector('[data-sp-pd-option-value]');
      var isColour = g.hasAttribute('data-sp-pd-colour-group');

      g.querySelectorAll('[data-value]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          g.querySelectorAll('[data-value]').forEach(function (b) {
            b.classList.remove('is-active');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('is-active');
          btn.setAttribute('aria-pressed', 'true');

          chosen[name] = btn.getAttribute('data-value');
          if (label) label.textContent = chosen[name];

          var next = find();

          // Colour first: the gallery has to be narrowed before anything
          // tries to jump to a slide inside it.
          if (isColour) toColour(chosen[name], next ? next.media_id : null);
          else if (next && next.media_id) toColour(currentColour, next.media_id);

          paint(next);
        });
      });
    });
  }

  function scan() {
    document.querySelectorAll('[data-sp-pd]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // The theme editor re-renders sections outright
  document.addEventListener('shopify:section:load', scan);
})();
