/* ============================================================
   Quick view
   ============================================================

   Intercepts "Choose options", fetches the product's quick-view section and
   shows it in a modal instead of navigating.

   The trigger stays a real <a href="{{ product.url }}">. Without JS, or if
   the fetch fails, the click does what it always did and goes to the product
   page — the modal is an enhancement, never the only way through.

   Markup comes from Shopify's Section Rendering API, so prices, money
   format and translations are rendered by the same Liquid as the product
   page rather than reassembled here from JSON.
   ============================================================ */

(function () {
  'use strict';

  // Loaded from more than one place on purpose (globally from the header,
  // and by sections that must work without it). A second execution would
  // bind every delegated listener twice.
  if (window.__spQuickview) return;
  window.__spQuickview = true;

  var SECTION = 'sp-quickview';
  var modal, panel, body, closeBtn, lastTrigger = null;

  /* ----- Shell ---------------------------------------------------------- */

  function build() {
    if (modal) return;

    modal = document.createElement('div');
    modal.className = 'sp-qv-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="sp-qv-modal__scrim" data-sp-qv-close></div>' +
      '<div class="sp-qv-modal__panel" role="dialog" aria-modal="true" aria-label="Product quick view">' +
        '<button type="button" class="sp-qv-modal__close" data-sp-qv-close aria-label="Close">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7">' +
            '<path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<div class="sp-qv-modal__body" data-sp-qv-body>' +
          '<div class="sp-qv-modal__loading" aria-live="polite">Loading…</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    panel = modal.querySelector('.sp-qv-modal__panel');
    body = modal.querySelector('[data-sp-qv-body]');
    closeBtn = modal.querySelector('.sp-qv-modal__close');

    modal.querySelectorAll('[data-sp-qv-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
  }

  function open() {
    build();
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    window.requestAnimationFrame(function () { modal.classList.add('is-open'); });
    closeBtn.focus();
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    document.documentElement.style.overflow = '';

    var done = function () {
      modal.hidden = true;
      body.innerHTML = '<div class="sp-qv-modal__loading" aria-live="polite">Loading…</div>';
      modal.removeEventListener('transitionend', done);
    };
    modal.addEventListener('transitionend', done);
    // transitionend never fires if the panel was never painted
    window.setTimeout(done, 400);

    if (lastTrigger) { lastTrigger.focus(); lastTrigger = null; }
  }

  /* ----- Fetch ---------------------------------------------------------- */

  function load(url) {
    var sep = url.indexOf('?') === -1 ? '?' : '&';

    return fetch(url + sep + 'section_id=' + SECTION)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var content = doc.querySelector('[data-sp-qv-content]');
        if (!content) throw new Error('quick view markup not found');
        body.innerHTML = '';
        body.appendChild(content);
        wire(content);
      });
  }

  /* ----- Gallery and variants ------------------------------------------- */

  function wire(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-sp-qv-slide]'));
    var thumbs = Array.prototype.slice.call(root.querySelectorAll('[data-sp-qv-thumb]'));
    var shown = slides.map(function () { return true; });

    function show(i) {
      if (!shown[i]) return;
      slides.forEach(function (s, n) { s.classList.toggle('is-active', n === i); });
      thumbs.forEach(function (t, n) {
        t.classList.toggle('is-active', n === i);
        t.setAttribute('aria-pressed', n === i ? 'true' : 'false');
      });
    }

    function norm(v) { return (v || '').toLowerCase().trim(); }

    /* Narrow the gallery to one colour: that colour's own images, plus any
       image with no colour of its own — a scale shot, a fabric close-up, the
       room set. Those belong to every colour, so they always stay.

       Hidden outright rather than dimmed. A half-visible thumbnail of the
       wrong colour still reads as something you can pick. */
    function filter(colour) {
      var want = norm(colour);
      var first = -1;
      var matched = 0;

      if (want) {
        slides.forEach(function (s) {
          if (norm(s.getAttribute('data-colour')) === want) matched++;
        });
      }

      // No image resolved to this colour: show the whole gallery rather than
      // leaving the shopper with nothing but the shared shots.
      var narrow = want && matched > 0;

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

    /* Move to a colour, preferring that variant's own image, then the first
       image left showing. */
    function toColour(colour, preferMediaId) {
      var first = filter(colour);
      var target = -1;

      if (preferMediaId) {
        slides.forEach(function (s, n) {
          if (target === -1 && shown[n] && s.getAttribute('data-media-id') === String(preferMediaId)) target = n;
        });
      }

      if (target === -1) target = first;

      // Only jump if the slide on screen is now hidden or is the wrong colour
      var active = slides.findIndex(function (s) { return s.classList.contains('is-active'); });
      if (active === -1 || !shown[active] || (preferMediaId && target !== -1 && target !== active)) {
        if (target > -1) show(target);
      }
    }

    thumbs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
    });

    var colourGroup = root.querySelector('[data-sp-qv-colour-group]');
    if (colourGroup) filter(root.getAttribute('data-selected-colour'));

    // --- quantity ---
    var qty = root.querySelector('.sp-qv__qty-input');
    root.querySelectorAll('[data-sp-qv-qty]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!qty) return;
        var next = (parseInt(qty.value, 10) || 1) + parseInt(btn.getAttribute('data-sp-qv-qty'), 10);
        qty.value = Math.max(1, next);
      });
    });

    // --- variants ---
    var json = root.querySelector('[data-sp-qv-variants]');
    if (!json) return;

    var variants;
    try { variants = JSON.parse(json.textContent); } catch (e) { return; }

    var groups = Array.prototype.slice.call(root.querySelectorAll('[data-sp-qv-option]'));
    var idInput = root.querySelector('[data-sp-qv-id]');
    var priceEl = root.querySelector('[data-sp-qv-price]');
    var wasEl = root.querySelector('[data-sp-qv-was]');
    var addBtn = root.querySelector('[data-sp-qv-add]');
    var addLabel = root.querySelector('[data-sp-qv-add-label]');

    var chosen = {};
    groups.forEach(function (g) {
      var active = g.querySelector('.is-active');
      chosen[g.getAttribute('data-sp-qv-option')] = active ? active.getAttribute('data-value') : null;
    });

    function find() {
      // Build the option array BY INDEX. DOM order is not option order.
      var want = new Array(groups.length).fill(null);
      groups.forEach(function (g, domIndex) {
        var i = parseInt(g.getAttribute('data-sp-qv-index'), 10);
        if (isNaN(i) || i < 0 || i >= groups.length) i = domIndex;
        want[i] = chosen[g.getAttribute('data-sp-qv-option')];
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
        if (addLabel) addLabel.textContent = 'Unavailable';
        return;
      }

      if (idInput) idInput.value = variant.id;
      if (priceEl) priceEl.textContent = variant.price;

      if (wasEl) {
        wasEl.hidden = !variant.on_sale;
        if (variant.on_sale) wasEl.textContent = variant.compare_at;
      }

      if (addBtn) addBtn.disabled = !variant.available;
      if (addLabel) addLabel.textContent = variant.available ? 'Add to cart' : 'Sold out';

      if (variant.media_id) {
        var i = slides.findIndex(function (s, n) {
          return shown[n] && s.getAttribute('data-media-id') === String(variant.media_id);
        });
        if (i > -1) show(i);
      }
    }

    groups.forEach(function (g) {
      var name = g.getAttribute('data-sp-qv-option');
      var label = g.querySelector('[data-sp-qv-option-value]');

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
          if (g.hasAttribute('data-sp-qv-colour-group')) {
            toColour(chosen[name], next ? next.media_id : null);
          }

          paint(next);
        });
      });
    });
  }

  /* ----- Triggers ------------------------------------------------------- */

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-sp-quickview]');
    if (!trigger) return;

    var url = trigger.getAttribute('href');
    if (!url) return;

    e.preventDefault();
    lastTrigger = trigger;
    open();

    load(url).catch(function (err) {
      // Anything at all goes wrong: do what the link was always going to do
      console.error(err);
      window.location.href = url;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (!modal || modal.hidden) return;

    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;

    var focusable = panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Adding from inside the modal should close it, so the cart drawer is seen
  document.addEventListener('cart:refresh', close);
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, function (payload) {
      if (payload && payload.source === 'sp-quickadd') close();
    });
  }
})();
