/* glassé landing — offer selector, gallery, sticky ATC, cart drawer.
   Runs in two modes: local demo (localStorage, fake checkout) and Shopify
   (window.GLASSE set by the theme → real Ajax cart + /checkout). */
(function () {
  'use strict';

  // Offer config — in Shopify mode prices and variant ids come from window.GLASSE.
  var OFFERS = {
    1: { name: '1 jar', jars: 1, price: 24, compare: null, freebies: [], img: 'assets/jar-800.webp', slide: 0 },
    2: { name: '2 jars', jars: 2, price: 39, compare: 48, freebies: ['headband'], img: 'assets/pack-2-800.webp', slide: 4 },
    3: { name: '3 jars', jars: 3, price: 52, compare: 72, freebies: ['headband', 'shipping'], img: 'assets/pack-3-800.webp', slide: 5 }
  };
  // Line keys: '1' | '2' | '3' (jar bundles) or an add-on id from ITEMS.
  var ITEMS = {
    dots: { name: 'glassé spot dots', meta: '36 hydrocolloid patches', price: 9, img: 'assets/spot-dots-400.webp' },
    pp: { name: 'Jelly Pads, 1 extra jar (−25%)', meta: 'one-time offer', price: 18, img: 'assets/jar-800.webp' }
  };
  var FREE_SHIP = 35;
  var SHIPPING = 4.95;
  var STORAGE_KEY = 'glasse-cart-v3';

  var SHOP = window.GLASSE || null;
  if (SHOP) {
    Object.keys(SHOP.offers || {}).forEach(function (k) {
      var s = SHOP.offers[k];
      if (!OFFERS[k] || !s) return;
      OFFERS[k].price = s.price;
      OFFERS[k].compare = s.compare;
      OFFERS[k].variant = s.id;
      if (s.img) OFFERS[k].img = s.img;
    });
    ['dots', 'pp'].forEach(function (k) {
      var s = SHOP[k];
      if (!s) return;
      ITEMS[k].price = s.price;
      ITEMS[k].variant = s.id;
      if (s.img) ITEMS[k].img = s.img;
    });
    if (SHOP.freeShip != null) FREE_SHIP = SHOP.freeShip;
    if (SHOP.shipping != null) SHIPPING = SHOP.shipping;
  }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (n) { return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); };
  var money2 = function (n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function unitPrice(bundle) { return OFFERS[bundle].price; }
  function shipsFree(bundle, total) { return OFFERS[bundle].freebies.indexOf('shipping') > -1 || total >= FREE_SHIP; }
  function renderShipBar(msgEl, fillEl, total, free) {
    if (!msgEl) return;
    if (free) {
      msgEl.textContent = 'free shipping unlocked. nice.';
      fillEl.style.width = '100%';
    } else {
      msgEl.textContent = "you're " + money2(FREE_SHIP - total) + ' away from free shipping';
      fillEl.style.width = Math.min(100, (total / FREE_SHIP) * 100) + '%';
    }
  }

  /* ---------- Offer selector ---------- */
  var form = $('[data-offer-form]');
  var state = { bundle: 2 };

  function renderOffer() {
    if (!form) return;
    Object.keys(OFFERS).forEach(function (k) {
      var o = OFFERS[k];
      var price = unitPrice(k);
      $('[data-price="' + k + '"]').textContent = money(price);
      var s = $('[data-compare="' + k + '"]');
      if (o.compare) { s.hidden = false; s.textContent = money(o.compare); } else { s.hidden = true; }
      $('[data-per="' + k + '"]').textContent = money2(price / o.jars) + '/jar';
    });
    var total = unitPrice(state.bundle);
    $('[data-atc-price]').textContent = money(total);
    $('[data-sticky-name]').textContent = OFFERS[state.bundle].name;
    $('[data-sticky-price]').textContent = money(total);
    renderShipBar($('[data-ship-msg]'), $('[data-ship-fill]'), total, shipsFree(state.bundle, total));
  }

  if (form) {
    form.addEventListener('change', function (e) {
      if (e.target.name === 'bundle') {
        state.bundle = +e.target.value;
        goToSlide(OFFERS[state.bundle].slide);
      }
      renderOffer();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      add(state.bundle);
    });
  }

  /* ---------- Gallery ---------- */
  var track = $('[data-gallery-track]');
  var thumbs = $$('[data-thumb]');
  var slides = track ? $$('.slide', track) : [];

  function goToSlide(i) {
    if (!track || !slides[i]) return;
    track.scrollTo({ left: slides[i].offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    setActiveThumb(i);
  }
  function setActiveThumb(i) {
    thumbs.forEach(function (t, j) {
      t.classList.toggle('is-active', i === j);
      if (i === j) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    });
  }
  if (track) {
    thumbs.forEach(function (t) {
      t.addEventListener('click', function () { goToSlide(+t.dataset.thumb); });
    });
    var scrollTimer;
    track.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        setActiveThumb(Math.round(track.scrollLeft / track.clientWidth));
      }, 60);
    }, { passive: true });
    track.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = Math.round(track.scrollLeft / track.clientWidth) + (e.key === 'ArrowRight' ? 1 : -1);
      goToSlide(Math.max(0, Math.min(slides.length - 1, i)));
    });
  }

  /* ---------- Cart ---------- */
  var cart = [];
  var drawer = $('[data-drawer]');
  var scrim = $('[data-cart-scrim]');
  var lastFocus = null;
  var busy = false;

  function isBundle(key) { return OFFERS.hasOwnProperty(key); }
  function lineOf(key) { return cart.filter(function (l) { return l.key === key; })[0]; }
  function info(l) {
    if (isBundle(l.key)) return OFFERS[l.key];
    if (ITEMS[l.key]) return ITEMS[l.key];
    // Any other Shopify line item (added outside this page)
    var it = l.item;
    return { name: it.product_title, meta: it.variant_title || '', price: it.final_price / 100, img: it.image || '' };
  }
  function linePrice(l) { return info(l).price; }
  function keyOfVariant(id) {
    var k = Object.keys(OFFERS).filter(function (k) { return OFFERS[k].variant === id; })[0];
    if (k) return k;
    k = Object.keys(ITEMS).filter(function (k) { return ITEMS[k].variant === id; })[0];
    return k || 'v' + id;
  }
  function variantOf(key) { return (OFFERS[key] || ITEMS[key]).variant; }

  // Storage backend: Shopify Ajax cart, or localStorage for the local demo.
  function post(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); });
  }
  function fromShopify(c) {
    cart = (c.items || []).map(function (it) { return { key: keyOfVariant(it.variant_id), qty: it.quantity, item: it }; });
  }
  var api = SHOP ? {
    refresh: function () { return fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(fromShopify); },
    add: function (key, qty) { return post('/cart/add.js', { items: [{ id: variantOf(key), quantity: qty }] }).then(api.refresh); },
    set: function (line, qty) { return post('/cart/change.js', { id: line.item.key, quantity: qty }).then(fromShopify); }
  } : {
    refresh: function () {
      try { cart = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { cart = []; }
      return Promise.resolve();
    },
    add: function (key, qty) {
      var line = lineOf(key);
      if (line) line.qty += qty; else cart.push({ key: key, qty: qty });
      save();
      return Promise.resolve();
    },
    set: function (line, qty) {
      line.qty = qty;
      if (qty < 1) cart.splice(cart.indexOf(line), 1);
      save();
      return Promise.resolve();
    }
  };
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ }
  }
  function mutate(fn) {
    if (busy) return Promise.resolve();
    busy = true;
    drawer.classList.add('is-busy');
    return fn().catch(function () { return api.refresh(); }).then(function () {
      busy = false;
      drawer.classList.remove('is-busy');
      renderCart();
    });
  }

  function add(key, qty, opts) {
    key = String(key);
    return mutate(function () { return api.add(key, qty || 1); }).then(function () {
      if (!(opts && opts.silent)) openDrawer();
      bumpCount();
    });
  }
  function addToCart(bundle) { add(bundle); }
  function bumpCount() {
    var c = $('[data-cart-count]');
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }

  function cartTotals() {
    var subtotal = 0, saving = 0, freeByBundle = false, headbands = 0, count = 0;
    cart.forEach(function (l) {
      subtotal += linePrice(l) * l.qty;
      count += l.qty;
      if (isBundle(l.key)) {
        var o = OFFERS[l.key];
        if (o.compare) saving += (o.compare - o.price) * l.qty;
        if (o.freebies.indexOf('headband') > -1) headbands += l.qty;
        if (o.freebies.indexOf('shipping') > -1) freeByBundle = true;
      }
    });
    var free = freeByBundle || subtotal >= FREE_SHIP;
    var shipping = cart.length && !free ? SHIPPING : 0;
    if (cart.length && free) saving += SHIPPING;
    return { subtotal: subtotal, saving: saving, free: free, shipping: shipping, total: subtotal + shipping, headbands: headbands, count: count };
  }
  function hasBundle() { return !!(lineOf('1') || lineOf('2') || lineOf('3')); }

  // Smallest bundle in the cart that can still move up a tier.
  function upgradeTarget() {
    var keys = ['1', '2'];
    for (var i = 0; i < keys.length; i++) {
      if (lineOf(keys[i])) {
        var from = OFFERS[keys[i]], to = OFFERS[+keys[i] + 1];
        return { from: keys[i], to: String(+keys[i] + 1), delta: to.price - from.price, toOffer: to };
      }
    }
    return null;
  }

  function renderCart() {
    var t = cartTotals();
    var list = $('[data-cart-lines]');
    list.innerHTML = '';
    cart.forEach(function (l, idx) {
      var bundle = isBundle(l.key);
      var o = info(l);
      var title = bundle ? 'Salmon DNA Jelly Pads' : o.name;
      var meta = bundle ? o.name + ' · ' + (o.jars * 70) + ' pads · tongs included' : o.meta;
      var compare = bundle && o.compare ? '<s>' + money2(o.compare * l.qty) + '</s>' : '';
      var li = document.createElement('li');
      li.className = 'cart-line';
      li.innerHTML =
        '<img src="' + o.img + '" alt="" width="72" height="72">' +
        '<div class="cart-line-main"><div class="cart-line-title">' + title + '</div>' +
        '<div class="cart-line-meta">' + meta + '</div>' +
        '<div class="qty" role="group" aria-label="Quantity, ' + title + '">' +
        '<button type="button" data-dec="' + idx + '" aria-label="Decrease quantity">−</button><span aria-live="polite">' + l.qty + '</span>' +
        '<button type="button" data-inc="' + idx + '" aria-label="Increase quantity">+</button></div></div>' +
        '<div class="cart-line-price"><span class="price-stack">' + compare + '<b>' + money2(linePrice(l) * l.qty) + '</b></span>' +
        '<button type="button" class="link-btn" data-rm="' + idx + '" aria-label="Remove ' + title + '">remove</button></div>';
      list.appendChild(li);
    });
    if (t.headbands) {
      var fb = document.createElement('li');
      fb.className = 'cart-line is-free';
      fb.innerHTML = '<span class="free-ico"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h16v8H4zM3 8h18v4H3zM12 8v12M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>' +
        '<div class="cart-line-main"><div class="cart-line-title">Fluffy headband' + (t.headbands > 1 ? ' × ' + t.headbands : '') + '</div><div class="cart-line-meta">free with your bundle</div></div><div class="cart-line-price"><span class="free-label">FREE</span></div>';
      list.appendChild(fb);
    }

    // Upgrade nudge
    var up = upgradeTarget();
    var upEl = $('[data-upgrade]');
    if (up) {
      var perks = up.to === '2' ? 'free headband + free shipping' : 'lowest price: $' + (OFFERS[3].price / 3).toFixed(2) + '/jar';
      upEl.innerHTML =
        '<img src="' + up.toOffer.img + '" alt="" width="56" height="56">' +
        '<div class="upgrade-copy"><b>Make it ' + up.toOffer.name + ' for +' + money(up.delta) + '</b><span>' + perks + '</span></div>' +
        '<button type="button" class="btn-add jelly" data-upgrade-btn aria-label="Upgrade to ' + up.toOffer.name + ' for ' + money(up.delta) + ' more">upgrade</button>';
      upEl.hidden = false;
    } else {
      upEl.hidden = true;
    }

    $('[data-addons]').hidden = !cart.length || !!lineOf('dots') || !!(SHOP && !ITEMS.dots.variant);
    $('[data-perks]').hidden = !cart.length;
    $('[data-cart-empty]').hidden = cart.length > 0;
    $('[data-drawer-foot]').hidden = !cart.length;

    $('[data-cart-subtotal]').textContent = money2(t.subtotal);
    $('[data-cart-shipping]').innerHTML = t.free ? '<b class="free-label">FREE</b>' : money2(SHIPPING);
    $('[data-cart-total]').textContent = money2(t.total);
    $('[data-checkout-total]').textContent = money2(t.total);
    $('[data-cart-save-row]').hidden = t.saving <= 0;
    $('[data-cart-save]').textContent = money2(t.saving);

    var msg = $('[data-cart-ship-msg]'), fill = $('[data-cart-ship-fill]');
    if (!cart.length) {
      msg.textContent = 'free shipping on orders over ' + money(FREE_SHIP);
      fill.style.width = '0%';
    } else if (t.free) {
      msg.innerHTML = '<b>free shipping unlocked.</b> nice.';
      fill.style.width = '100%';
    } else {
      msg.innerHTML = "you're <b>" + money2(FREE_SHIP - t.subtotal) + '</b> away from free shipping';
      fill.style.width = Math.min(100, (t.subtotal / FREE_SHIP) * 100) + '%';
    }

    $('[data-cart-count]').textContent = t.count;
    $('[data-cart-count-pill]').textContent = t.count;
    $('[data-cart-count-pill]').hidden = !t.count;
    $('[data-cart-open]').setAttribute('aria-label', 'Open cart, ' + t.count + ' item' + (t.count === 1 ? '' : 's'));
  }

  drawer.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var l;
    if (b.dataset.inc != null) { l = cart[+b.dataset.inc]; mutate(function () { return api.set(l, l.qty + 1); }); }
    else if (b.dataset.dec != null) { l = cart[+b.dataset.dec]; mutate(function () { return api.set(l, l.qty - 1); }); }
    else if (b.dataset.rm != null) { l = cart[+b.dataset.rm]; mutate(function () { return api.set(l, 0); }); }
    else if (b.hasAttribute('data-upgrade-btn')) {
      var up = upgradeTarget();
      var from = lineOf(up.from);
      mutate(function () {
        return api.set(from, from.qty - 1).then(function () { return api.add(up.to, 1); });
      }).then(bumpCount);
    }
    else if (b.dataset.addItem) { add(b.dataset.addItem, 1, { silent: true }); }
    else return;
    // Re-rendered buttons lose focus; keep keyboard users inside the drawer.
    setTimeout(function () { if (!drawer.contains(document.activeElement)) $('[data-cart-close]').focus(); }, 0);
  });

  /* Views: cart → one-click offer → checkout (Shopify) or demo confirmation (local) */
  var offered = false;
  function showView(name) {
    $$('[data-view]', drawer).forEach(function (v) { v.hidden = v.dataset.view !== name; });
    var f = $('[data-view="' + name + '"] button', drawer);
    if (f && name !== 'cart') f.focus();
  }
  function goCheckout() {
    if (SHOP) { window.location.href = SHOP.checkoutUrl || '/checkout'; return; }
    renderDone(); showView('done');
  }
  var ppAvailable = !SHOP || !!ITEMS.pp.variant;
  $('[data-checkout]').addEventListener('click', function () {
    if (hasBundle() && ppAvailable && !offered && !lineOf('pp')) { offered = true; showView('offer'); }
    else goCheckout();
  });
  $('[data-pp-yes]').addEventListener('click', function () {
    if (SHOP) { api.add('pp', 1).then(goCheckout, goCheckout); return; }
    cart.push({ key: 'pp', qty: 1 });
    goCheckout();
  });
  $('[data-pp-no]').addEventListener('click', goCheckout);
  function renderDone() {
    var t = cartTotals();
    var lines = cart.map(function (l) {
      var bundle = isBundle(l.key);
      return '<li><span>' + (bundle ? 'Jelly Pads, ' + OFFERS[l.key].name : info(l).name) + ' × ' + l.qty + '</span><b>' + money2(linePrice(l) * l.qty) + '</b></li>';
    });
    if (t.headbands) lines.push('<li><span>Fluffy headband × ' + t.headbands + '</span><b>FREE</b></li>');
    $('[data-done-lines]').innerHTML = lines.join('');
    $('[data-done-total]').innerHTML = 'Total paid <b>' + money2(t.total) + '</b>';
    $('[data-done-order]').textContent = 'order #GL-' + (10000 + Math.floor(Math.random() * 89999)) + ' · confirmation sent to your inbox';
    cart = [];
    offered = false;
    save();
    renderCart();
  }
  var doneClose = $('[data-done-close]');
  if (doneClose) doneClose.addEventListener('click', function () { closeDrawer(); });
  $('[data-empty-add]').addEventListener('click', function () { add(2, 1, { silent: true }); });

  function openDrawer() {
    if (!drawer.hidden && drawer.classList.contains('is-open')) return;
    lastFocus = document.activeElement;
    showView('cart');
    drawer.hidden = false; scrim.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add('is-open'); scrim.classList.add('is-open'); });
    document.documentElement.classList.add('is-locked');
    $('[data-cart-close]').focus({ preventScroll: true });
    updateSticky();
  }
  function closeDrawer() {
    drawer.classList.remove('is-open'); scrim.classList.remove('is-open');
    document.documentElement.classList.remove('is-locked');
    setTimeout(function () { drawer.hidden = true; scrim.hidden = true; showView('cart'); updateSticky(); }, reduceMotion ? 0 : 420);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $('[data-cart-open]').addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
  $('[data-cart-close]').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (drawer.hidden) return;
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'Tab') { // focus trap
      var f = $$('button:not([disabled]), a[href]', drawer).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // Swipe down to close (mobile bottom sheet)
  var startY = null;
  $('.drawer-head', drawer).addEventListener('touchstart', function (e) { startY = e.touches[0].clientY; }, { passive: true });
  $('.drawer-head', drawer).addEventListener('touchend', function (e) {
    if (startY !== null && e.changedTouches[0].clientY - startY > 60) closeDrawer();
    startY = null;
  });

  $$('[data-quick-add]').forEach(function (b) {
    b.addEventListener('click', function () { addToCart(+b.dataset.quickAdd); });
  });

  /* ---------- Sticky ATC (mobile) ---------- */
  var sticky = $('[data-sticky]');
  var stickyBtn = $('[data-sticky-btn]');
  var atc = $('[data-atc]');
  var finalSec = $('#get-it');
  var atcPassed = false, finalVisible = false;

  function updateSticky() {
    if (!sticky) return;
    var show = atcPassed && !finalVisible && drawer.hidden;
    sticky.classList.toggle('is-visible', show);
    sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
    stickyBtn.tabIndex = show ? 0 : -1;
  }
  if (sticky && atc && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      atcPassed = !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
      updateSticky();
    }).observe(atc);
    if (finalSec) {
      new IntersectionObserver(function (en) {
        finalVisible = en[0].isIntersecting;
        updateSticky();
      }, { threshold: 0.2 }).observe(finalSec);
    }
  }
  if (stickyBtn) stickyBtn.addEventListener('click', function () { addToCart(state.bundle); });

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add('is-in'); });
  }

  var year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
  renderOffer();
  api.refresh().then(renderCart);
  // Shopify: /cart redirects here with #cart so the drawer opens
  if (SHOP && location.hash === '#cart') openDrawer();
})();
