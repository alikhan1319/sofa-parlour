/* ============================================================
   Quick add
   ============================================================

   Intercepts the product form inside a grid card and posts it to the cart
   API instead of navigating away — the point of quick add is not leaving
   the page.

   Delegated from document and scoped to [data-sp-quickadd-root], so cards
   rendered later (a paginated grid, a section re-render) work without
   rebinding, and no other section's forms are touched.

   Falls through to a normal form submit if fetch fails, so the shopper
   still ends up with the item rather than with nothing.
   ============================================================ */

(function () {
  'use strict';

  // Loaded from more than one place on purpose (globally from the header,
  // and by sections that must work without it). A second execution would
  // bind every delegated listener twice.
  if (window.__spQuickadd) return;
  window.__spQuickadd = true;

  var ROOT = '[data-sp-quickadd-root]';

  function cartElement() {
    return document.querySelector('cart-drawer') || document.querySelector('cart-notification');
  }

  /*  Shopify rejections used to go to console.error and nowhere else, so a
      sold-out variant or a stale id looked exactly like a dead button: the
      shopper clicks, nothing happens, and there is nothing to diagnose.
      Written into a live region inside the same root instead. */
  function say(form, message) {
    var root = form.closest(ROOT);
    var box = root && root.querySelector('[data-sp-quickadd-error]');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  // The generic wording lives in the markup, so it is translated with
  // everything else rather than hard-coded in a script.
  function generic(form) {
    var root = form.closest(ROOT);
    var box = root && root.querySelector('[data-sp-quickadd-error]');
    return (box && box.getAttribute('data-generic')) || '';
  }

  function submit(form, button) {
    if (button.classList.contains('is-busy')) return;
    say(form, '');

    var cart = cartElement();
    var data = new FormData(form);

    // Ask the cart to re-render exactly what Dawn would have re-rendered
    if (cart && typeof cart.getSectionsToRender === 'function') {
      data.append('sections', cart.getSectionsToRender().map(function (s) { return s.id; }).join(','));
      data.append('sections_url', window.location.pathname);
      if (typeof cart.setActiveElement === 'function') cart.setActiveElement(button);
    }

    button.classList.add('is-busy');
    button.setAttribute('aria-disabled', 'true');

    var url = (window.routes && window.routes.cart_add_url) || '/cart/add';

    fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
      body: data,
    })
      .then(function (res) { return res.json(); })
      .then(function (response) {
        if (response.status) {
          // A real rejection from Shopify: sold out, or the variant is gone.
          say(form, response.description || response.message || '');
          return;
        }

        if (!cart) {
          window.location = (window.routes && window.routes.cart_url) || '/cart';
          return;
        }

        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'sp-quickadd' });
        }

        /*  From here the item IS in the cart. Anything that goes wrong is a
            rendering fault, and the one thing that must NOT happen is
            navigating away — the previous version let a throw here fall
            through to the catch below, which called form.submit() and sent
            the shopper to /cart. That is exactly the "it opens the cart
            page" symptom, and it looked like the drawer had never worked. */
        try {
          if (typeof cart.renderContents === 'function') cart.renderContents(response);
          else if (typeof cart.open === 'function') cart.open(button);
          cart.classList.remove('is-empty');
        } catch (e) {
          console.error(e);
        }

        /*  renderContents opens the drawer itself, inside a setTimeout. If
            that path is ever missed — a cart element without it, a section
            render that returned nothing, the throw above — the item is in
            the cart and the shopper has been shown nothing at all. */
        window.setTimeout(function () {
          if (typeof cart.open !== 'function') return;
          if (cart.classList.contains('active')) return;
          if (cart.hasAttribute('open')) return;
          cart.open(button);
        }, 120);
      })
      .catch(function (err) {
        /*  Deliberately does NOT fall back to a native submit.

            A native submit posts to /cart/add and Shopify redirects to
            /cart, so the "fallback" threw the shopper out of the page they
            were buying from — and it fired for any fault at all, not just a
            dead network. With no JavaScript there is no listener here and
            the browser submits normally anyway, so nothing is lost by
            staying put and saying so. */
        console.error(err);
        say(form, generic(form));
      })
      .finally(function () {
        button.classList.remove('is-busy');
        button.removeAttribute('aria-disabled');
      });
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches('form')) return;
    if (!form.closest(ROOT)) return;

    var button = form.querySelector('[data-sp-quickadd]');
    if (!button) return;

    e.preventDefault();
    submit(form, button);
  });
})();
