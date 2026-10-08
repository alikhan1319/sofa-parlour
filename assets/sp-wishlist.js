/* ============================================================
   Saved items — storage, drawer, and header count
   ============================================================

   WHAT IS STORED, AND WHAT IS NOT

   localStorage holds a list of {id, handle} and nothing else. Not the title,
   not the image, and above all not the price. A price cached at save time is
   a price that goes stale: the shopper returns weeks later and the drawer
   quotes a figure the shop no longer honours.

   So the drawer fetches each saved product through Shopify's Section
   Rendering API when it opens:

       /products/{handle}?section_id=sp-wishlist-item

   Price, sale status, availability, money formatting and translation all
   come from the same Liquid the product page uses, at the moment of looking.

   HONEST ABOUT WHAT IT IS

   This list lives in one browser. It is not an account feature and does not
   follow the shopper between devices — for that, a wishlist app backed by
   customer accounts is the right answer. Nothing here is sent anywhere.

   Every storage call is wrapped: localStorage throws outright in some
   contexts (private windows with site data blocked, embedded previews), and
   an uncaught throw would take the rest of the page's JS down with it.
   ============================================================ */

(function () {
  'use strict';

  // A duplicate <script src> would execute this file twice and bind every
  // delegated listener twice. Cheap to guard, expensive to debug.
  if (window.__spWishlist) return;
  window.__spWishlist = true;

  var KEY = 'sp-wishlist';
  var SECTION = 'sp-wishlist-item';

  var drawer, panel, list, body, footer, countEl, lastTrigger = null;

  /* ----- Storage -------------------------------------------------------- */

  function read() {
    var raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      return [];
    }
    if (!raw) return [];

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    /* An earlier version stored bare id strings. A handle cannot be derived
       from an id in the browser, so those entries can never be rendered —
       drop them rather than carry a count the drawer cannot honour. */
    return parsed.filter(function (entry) {
      return entry && typeof entry === 'object' && entry.id && entry.handle;
    });
  }

  function write(list) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      /* Storage unavailable or full. The button still toggles for this page
         view; it simply will not be remembered. */
    }
  }

  function indexOf(saved, id) {
    for (var i = 0; i < saved.length; i++) {
      if (String(saved[i].id) === String(id)) return i;
    }
    return -1;
  }

  /* ----- Painting the triggers ------------------------------------------ */

  function paint() {
    var saved = read();

    document.querySelectorAll('[data-sp-wish]').forEach(function (btn) {
      var on = indexOf(saved, btn.getAttribute('data-sp-wish')) !== -1;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    document.querySelectorAll('[data-sp-wl-count]').forEach(function (el) {
      el.textContent = saved.length;
      el.hidden = saved.length === 0;
    });

    if (countEl) countEl.textContent = label(saved.length);
    if (footer) footer.hidden = saved.length === 0;
  }

  function label(n) {
    return n + (n === 1 ? ' item' : ' items');
  }

  /* ----- Drawer shell --------------------------------------------------- */

  function build() {
    if (drawer) return;

    drawer = document.createElement('div');
    drawer.className = 'sp-wl';
    drawer.innerHTML =
      '<div class="sp-wl__scrim" data-sp-wl-close></div>' +
      '<div class="sp-wl__panel" role="dialog" aria-modal="true" aria-label="Saved items">' +
        '<div class="sp-wl__header">' +
          '<div class="sp-wl__head-copy">' +
            '<h2 class="sp-wl__title">Saved items</h2>' +
            '<p class="sp-wl__count" data-sp-wl-total></p>' +
          '</div>' +
          '<button type="button" class="sp-wl__close" data-sp-wl-close aria-label="Close">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
              'stroke-width="1.7" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="sp-wl__body" data-sp-wl-body data-sp-quickadd-root>' +
          '<ul class="sp-wl__list" data-sp-wl-list role="list"></ul>' +
        '</div>' +
        '<div class="sp-wl__footer" data-sp-wl-footer hidden>' +
          '<p class="sp-wl__note">Saved in this browser only.</p>' +
          '<button type="button" class="sp-wl__clear" data-sp-wl-clear>Clear all</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(drawer);

    panel = drawer.querySelector('.sp-wl__panel');
    body = drawer.querySelector('[data-sp-wl-body]');
    list = drawer.querySelector('[data-sp-wl-list]');
    footer = drawer.querySelector('[data-sp-wl-footer]');
    countEl = drawer.querySelector('[data-sp-wl-total]');

    drawer.querySelectorAll('[data-sp-wl-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });

    drawer.querySelector('[data-sp-wl-clear]').addEventListener('click', function () {
      write([]);
      paint();
      render();
    });
  }

  function open() {
    var fresh = !drawer;
    build();

    /* On the very first open the element was appended and the class added in
       the same task, so the browser never computed a "before" style and the
       slide-in is skipped. Reading a layout property forces that computation.
       Only needed once — after this the styles are already resolved. */
    if (fresh) void drawer.offsetWidth;

    drawer.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    render();
    drawer.querySelector('.sp-wl__close').focus();
  }

  function close() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  /* ----- Rendering the list --------------------------------------------- */

  function state(icon, title, text, cta) {
    return (
      '<div class="sp-wl__state">' +
        '<span class="sp-wl__state-icon">' + icon + '</span>' +
        '<h3 class="sp-wl__state-title">' + title + '</h3>' +
        '<p class="sp-wl__state-text">' + text + '</p>' +
        (cta || '') +
      '</div>'
    );
  }

  var HEART =
    '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.3A4.2 4.2 0 0 1 12 8a4.2 ' +
    '4.2 0 0 1 7 2.7C19 15.4 12 20 12 20Z" stroke-linejoin="round"/></svg>';

  function render() {
    if (!list) return;

    var saved = read();
    paint();

    var url = window.Shopify && window.Shopify.routes && window.Shopify.routes.root ? window.Shopify.routes.root : '/';

    if (!saved.length) {
      list.innerHTML = state(
        HEART,
        'Nothing saved yet',
        'Tap the heart on any piece to keep it here while you decide.',
        '<a class="sp-wl__add" href="' + url + 'collections/all">Browse the collection</a>'
      );
      return;
    }

    list.innerHTML =
      '<li class="sp-wl__state"><p class="sp-wl__state-text" aria-live="polite">Loading…</p></li>';

    /* A 404 means the product is genuinely gone — unpublished, deleted, or
       the handle changed — and the entry should go with it.

       Anything else (offline, 500, a timeout) means we simply could not ask
       right now. Those entries are KEPT. Treating a network blip as proof of
       deletion would quietly empty a shopper's saved list the one time they
       opened it on a bad connection, and there is no undo for that. */
    Promise.all(
      saved.map(function (entry) {
        return fetch(url + 'products/' + encodeURIComponent(entry.handle) + '?section_id=' + SECTION)
          .then(function (r) {
            if (r.status === 404) return { entry: entry, gone: true };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text().then(function (html) {
              var node = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-sp-wl-item]');
              if (!node) throw new Error('row markup not found');
              return { entry: entry, node: node };
            });
          })
          .catch(function () {
            return { entry: entry, failed: true };
          });
      })
    ).then(function (results) {
      var shown = results.filter(function (r) { return r.node; });
      var gone = results.filter(function (r) { return r.gone; });
      var failed = results.filter(function (r) { return r.failed; });

      // Prune only what is provably gone, preserving the saved order.
      if (gone.length) {
        write(
          results
            .filter(function (r) { return !r.gone; })
            .map(function (r) { return r.entry; })
        );
      }

      list.innerHTML = '';

      /* Deliberately NOT a recursive render() call. If a write silently fails
         — Safari private mode lets getItem work while setItem throws — a
         re-render would read the same list back and loop forever. */
      if (!shown.length) {
        list.innerHTML = failed.length
          ? state(
              HEART,
              'Could not load your saved items',
              'The connection dropped. Your list is safe — close this and open it again.',
              '<button type="button" class="sp-wl__add" data-sp-wl-retry>Try again</button>'
            )
          : state(
              HEART,
              'Nothing saved yet',
              'Tap the heart on any piece to keep it here while you decide.',
              '<a class="sp-wl__add" href="' + url + 'collections/all">Browse the collection</a>'
            );
        paint();
        return;
      }

      shown.forEach(function (r) {
        var li = document.createElement('li');
        li.appendChild(r.node);
        list.appendChild(li);
      });

      if (failed.length) {
        var note = document.createElement('li');
        note.className = 'sp-wl__state';
        note.innerHTML =
          '<p class="sp-wl__state-text">' +
          failed.length +
          (failed.length === 1 ? ' saved item could not be loaded.' : ' saved items could not be loaded.') +
          '</p><button type="button" class="sp-wl__add" data-sp-wl-retry>Try again</button>';
        list.appendChild(note);
      }

      paint();
    });
  }

  /* ----- Events --------------------------------------------------------- */

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    // Save / unsave
    var wish = e.target.closest('[data-sp-wish]');
    if (wish) {
      e.preventDefault();

      var id = wish.getAttribute('data-sp-wish');
      var handle = wish.getAttribute('data-sp-wish-handle');
      var saved = read();
      var at = indexOf(saved, id);

      if (at === -1) {
        // Without a handle the entry could never be rendered, so refuse to
        // store something the drawer cannot show.
        if (!handle) return;
        saved.push({ id: id, handle: handle });
      } else {
        saved.splice(at, 1);
      }

      write(saved);
      paint();
      if (drawer && drawer.classList.contains('is-open')) render();
      return;
    }

    // Open the drawer
    var opener = e.target.closest('[data-sp-wishlist-open]');
    if (opener) {
      e.preventDefault();
      lastTrigger = opener;
      open();
      return;
    }

    // Retry after a failed load
    if (e.target.closest('[data-sp-wl-retry]')) {
      e.preventDefault();
      render();
      return;
    }

    // Remove from inside the drawer
    var remove = e.target.closest('[data-sp-wl-remove]');
    if (remove) {
      e.preventDefault();
      var rid = remove.getAttribute('data-sp-wl-remove');
      var cur = read();
      var i = indexOf(cur, rid);
      if (i !== -1) {
        cur.splice(i, 1);
        write(cur);
      }
      paint();
      render();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!drawer || !drawer.classList.contains('is-open')) return;

    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key !== 'Tab') return;

    var focusable = panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  /* Adding to the cart from in here should close this drawer, so the cart
     drawer that opens next is not buried underneath it. */
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, function (payload) {
      // Only when the add came from inside THIS drawer. A quick add from a
      // product grid publishes the same event, and close() would then steal
      // focus back to a wishlist trigger the shopper never touched.
      if (!drawer || !drawer.classList.contains('is-open')) return;
      if (payload && payload.source === 'sp-quickadd') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint);
  } else {
    paint();
  }

  // Cards rendered later — a section re-render in the theme editor
  document.addEventListener('shopify:section:load', paint);

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
          if (node.matches('[data-sp-wish]') || node.querySelector('[data-sp-wish]')) { hit = true; break; }
        }
      }

      if (!hit) return;
      // Coalesce: one innerHTML swap can deliver a dozen records.
      window.clearTimeout(pending);
      pending = window.setTimeout(paint, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }

})();
