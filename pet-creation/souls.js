// Souls shop (031) — the dashboard side: Shop screen (For sale / My items) and
// putting an item on a pet (pick item → render → up to two re-rolls → keep one).
// Talks to app.js only through window.PetixApp (apiRequest, state, toasts, reload).
(function () {
  'use strict';

  var SOUL_ICON = '/assets/souls/soul.svg';
  var shopTab = 'sale';
  var shopHost = null;
  var busy = false;

  function app() { return window.PetixApp; }
  function st() { return app() ? app().getState() : {}; }
  function esc(v) { return app() ? app().escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v); }
  function fmt(v) { return Number(v || 0).toLocaleString('en-US'); }
  function toast(t) { if (app()) app().showToast(t); }
  function souls() { return (st().souls && st().souls.balance) || 0; }
  function teamClass(item) { return item && item.team === 'bad' ? 'is-bad' : 'is-good'; }
  function soulPrice(n) { return '<span class="soul-price"><img src="' + SOUL_ICON + '" alt="" width="16" height="16">' + fmt(n) + '</span>'; }

  // ---------- modal shell ----------
  var modal = null;
  function closeModal() {
    if (!modal || busy) return;
    var onClose = modal.__onClose;
    modal.remove();
    modal = null;
    document.body.classList.remove('souls-modal-open');
    if (onClose) onClose();
  }
  function openModal(html, cls) {
    // A modal that is already open is swapped in place: the backdrop stays and nothing
    // fades or pops again (owner 2026-10-15: switching steps must not blink).
    var swap = Boolean(modal);
    if (swap) {
      modal.__onClose = null; // replaced, not closed: its onClose doesn't fire
    } else {
      modal = document.createElement('div');
      modal.className = 'souls-backdrop';
      modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target.closest('[data-souls-close]')) closeModal();
      });
      document.body.appendChild(modal);
      document.body.classList.add('souls-modal-open');
    }
    modal.innerHTML = '<section class="souls-modal ' + (cls || '') + (swap ? ' is-swap' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="souls-close" type="button" data-souls-close aria-label="Close"><svg viewBox="0 0 16 16" fill="none" width="16" height="16"><path d="M4 12 12 4M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></button>' + html + '</section>';
    return modal.querySelector('.souls-modal');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal) closeModal(); });

  // In-app confirm (no browser dialogs). Resolves true on confirm, false on cancel / close / Esc.
  function askConfirm(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (settled) return; settled = true; resolve(v); }
      var body = openModal(
        (opts.art ? '<div class="souls-confirm-art">' + opts.art + '</div>' : '') +
        '<h2 class="souls-title">' + opts.title + '</h2>' +
        '<div class="souls-text">' + opts.html + '</div>' +
        '<div class="souls-actions">' +
          (opts.noCancel ? '' : '<button class="souls-btn souls-btn--ghost" type="button" data-confirm-no>' + (opts.cancel || 'Cancel') + '</button>') +
          '<button class="souls-btn ' + (opts.primaryClass || 'souls-btn--dark') + '" type="button" data-confirm-yes>' + opts.confirm + '</button>' +
        '</div>', 'souls-modal--confirm');
      modal.__onClose = function () { done(false); };
      var no = body.querySelector('[data-confirm-no]');
      if (no) no.addEventListener('click', function () { closeModal(); });
      body.querySelector('[data-confirm-yes]').addEventListener('click', function () { modal.__onClose = null; done(true); });
    });
  }

  // ---------- shop ----------
  function catalog() { return st().shopItems || []; }
  function inventory() { return st().items || []; }

  function renderShop(host) {
    if (host) shopHost = host;
    if (!shopHost) return;
    var sale = catalog().map(function (item) {
      var short = souls() < item.price;
      var state = item.bought ? 'bought' : item.soldOut ? 'soldout' : short ? 'short' : 'ok';
      var label = { bought: 'Bought', soldout: 'Sold out', short: 'Not enough souls', ok: 'Buy' }[state];
      var stock = item.supply ? '<span class="shop-stock' + (item.soldOut ? ' is-out' : '') + '">' + (item.soldOut ? 'Sold out' : fmt(item.left) + ' of ' + fmt(item.supply) + ' left') + '</span>' : '';
      return '<article class="shop-card' + (item.soldOut ? ' is-soldout' : '') + '">' + stock +
        '<div class="shop-card-art"><img src="' + esc(item.img) + '" alt=""></div>' +
        '<div class="shop-card-body">' +
          '<h3>' + esc(item.name) + '</h3>' +
          '<p class="shop-card-desc">' + esc(item.description) + '</p>' +
          '<div class="shop-card-foot"><div class="shop-card-price">' + soulPrice(item.price) +
            (item.perWallet ? '<span class="shop-card-limit">One per account</span>' : '') + '</div>' +
            '<button class="souls-btn souls-btn--dark" type="button" data-buy="' + esc(item.id) + '"' + (state === 'ok' ? '' : ' disabled') + '>' + label + '</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('') || '<p class="shop-empty">Nothing on sale right now.</p>';

    var fit = st().tryOn;
    var mine = inventory().map(function (entry) {
      var item = entry.item || {};
      var fitPet = fit && fit.itemUid === entry.uid ? petById(fit.petId) : null;
      return '<article class="shop-card">' +
        '<div class="shop-card-art"><img src="' + esc(item.img) + '" alt=""></div>' +
        '<div class="shop-card-body">' +
          '<h3>' + esc(item.name) + '</h3>' +
          '<p class="shop-card-desc">' + esc(item.description) + '</p>' +
          '<div class="shop-card-foot shop-card-foot--full">' +
            (fitPet
              ? '<button class="souls-btn souls-btn--dark" type="button" data-resume-fit>Continue on ' + esc(fitPet.name || fitPet.displayName) + '</button>'
              : '<button class="souls-btn souls-btn--dark" type="button" data-wear="' + esc(entry.uid) + '">Put on a pet</button>') +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('') ||
      // Empty bag: UI kit px-empty with three item slots as the picture (owner 2026-10-14: no bare line + button).
      '<div class="px-empty shop-empty">' +
        '<div class="shop-empty-art" aria-hidden="true">' +
          '<span class="shop-empty-slot shop-empty-slot--side"></span>' +
          '<span class="shop-empty-slot shop-empty-slot--main"><img src="/assets/souls/hanger.svg" alt="" width="32" height="32"></span>' +
          '<span class="shop-empty-slot shop-empty-slot--side"></span>' +
        '</div>' +
        '<h3 class="px-h3">Your items will show up here</h3>' +
        '<p class="px-body-sm">You haven’t bought or received any items yet. See what’s in the shop.</p>' +
        '<button class="px-btn px-btn--primary px-btn--md" type="button" data-shop-tab="sale">Browse items for sale</button>' +
      '</div>';

    shopHost.innerHTML =
      '<div class="shop">' +
        '<div class="shop-head">' +
          '<div class="shop-head-copy"><h1>Souls shop</h1><p>Spend souls on items for your pets. Get souls by burning pets from Lvl. 2 or exchanging energy.</p></div>' +
          '<div class="shop-tabs" role="tablist">' +
            '<button type="button" role="tab" class="shop-tab' + (shopTab === 'sale' ? ' is-active' : '') + '" data-shop-tab="sale">For sale</button>' +
            '<button type="button" role="tab" class="shop-tab' + (shopTab === 'mine' ? ' is-active' : '') + '" data-shop-tab="mine">My items' + (inventory().length ? ' <span class="shop-count">' + inventory().length + '</span>' : '') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="shop-grid">' + (shopTab === 'sale' ? sale : mine) + '</div>' +
      '</div>';
  }

  document.addEventListener('click', function (e) {
    if (!shopHost || !shopHost.contains(e.target)) return;
    var tab = e.target.closest('[data-shop-tab]');
    if (tab) { shopTab = tab.getAttribute('data-shop-tab'); renderShop(); return; }
    var buyBtn = e.target.closest('[data-buy]');
    if (buyBtn && !buyBtn.disabled) { buy(buyBtn.getAttribute('data-buy'), buyBtn); return; }
    if (e.target.closest('[data-resume-fit]')) { resumeFitting(); return; }
    var wear = e.target.closest('[data-wear]');
    if (wear) { openPetPicker(wear.getAttribute('data-wear')); }
  });

  async function buy(itemId, btn) {
    var item = catalog().find(function (i) { return i.id === itemId; });
    if (!item || busy) return;
    var yes = await askConfirm({
      art: '<img src="' + esc(item.img) + '" alt="">',
      title: 'Buy ' + esc(item.name) + '?',
      html: '<p>' + esc(item.description) + '</p>' +
        '<div class="souls-confirm-sum"><span>Price</span>' + soulPrice(item.price) + '</div>',
      confirm: 'Buy',
      noCancel: true, // the × closes it
    });
    if (!yes) return;
    closeModal();
    busy = true; btn.disabled = true; btn.textContent = 'Buying…';
    try {
      var r = await app().apiRequest('/api/shop/buy', { itemId: itemId });
      app().setSouls(r.souls); app().setItems(r.items); if (r.shop) app().setShop(r.shop);
      // Stay where the player bought it (owner 2026-10-15); the My items tab counter shows the new item.
      toast(item.name + ' is in My items. Put it on a pet from the pet menu.');
    } catch (err) {
      toast(err.message || 'Could not buy the item.');
      try { await app().reloadProfile(); } catch (e) {} // fresh stock after SOLD_OUT / ALREADY_BOUGHT
    } finally {
      busy = false; renderShop();
    }
  }

  function petById(id) { return (st().characters || []).find(function (c) { return String(c.id) === String(id); }) || null; }

  // The fitting in progress (server is the source of truth): reopen it on its pet.
  async function resumeFitting() {
    var open = null;
    try { open = (await app().apiRequest('/api/shop/try-on', {}, 'GET')).tryOn; } catch (e) { open = st().tryOn; }
    app().setTryOn(open);
    var pet = open && petById(open.petId);
    if (pet) showFitting(pet, open); else renderShop();
  }

  // Pick a pet for an item from "My items".
  function openPetPicker(itemUid) {
    var fit = st().tryOn;
    if (fit && fit.itemUid === itemUid) { resumeFitting(); return; } // already being tried on: straight to it
    var pets = (st().characters || []).filter(function (c) { return c && c.status === 'completed'; });
    var body = openModal(
      '<h2 class="souls-title">Who wears it?</h2>' +
      '<div class="souls-pet-list">' + pets.map(function (p) {
        return '<button type="button" class="souls-pet" data-pick-pet="' + esc(p.id) + '"><img src="' + esc(p.imageUrl) + '" alt=""><span>' + esc(p.name || p.displayName) + '</span>' +
          (p.accessory ? '<em>wears ' + esc(p.accessory.name) + '</em>' : '') + '</button>';
      }).join('') + '</div>', 'souls-modal--picker');
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick-pet]');
      if (!b) return;
      var pet = pets.find(function (p) { return String(p.id) === b.getAttribute('data-pick-pet'); });
      if (pet) startFitting(pet, itemUid);
    });
  }

  // ---------- put on item (from the pet card menu) ----------
  async function openPutOn(pet) {
    var open = null;
    try { open = (await app().apiRequest('/api/shop/try-on', {}, 'GET')).tryOn; } catch (e) { open = null; }
    if (open && open.petId === String(pet.id)) { showFitting(pet, open); return; }
    if (open) {
      var other = (st().characters || []).find(function (c) { return String(c.id) === open.petId; });
      openModal('<h2 class="souls-title">Finish your fitting first</h2><p class="souls-text">You started dressing ' + esc(other ? (other.name || other.displayName) : 'another pet') + '. Pick one of its pictures, then this pet can try something on.</p>' +
        '<div class="souls-actions"><button class="souls-btn souls-btn--dark" type="button" data-resume>Continue the fitting</button></div>');
      modal.querySelector('[data-resume]').addEventListener('click', function () { if (other) showFitting(other, open); });
      return;
    }
    var items = inventory();
    if (!items.length) {
      openModal('<h2 class="souls-title">No items yet</h2><p class="souls-text">You don’t have items for your pets yet. Get them in the Souls shop.</p>' +
        '<div class="souls-actions"><button class="souls-btn souls-btn--dark" type="button" data-to-shop>Browse the Souls shop</button></div>');
      modal.querySelector('[data-to-shop]').addEventListener('click', function () { closeModal(); app().moveTo('shop'); });
      return;
    }
    var body = openModal(
      '<h2 class="souls-title">Put an item on ' + esc(pet.name || pet.displayName) + '</h2>' +
      '<p class="souls-text">' + (function () {
        var top = pet.accessory ? pet.accessory.name : String((pet.variables && pet.variables.TOP_ITEM) || '').trim();
        return 'Your pet’s look will change. ' + (top ? 'This item replaces its top item: <b>' + esc(top) + '</b>.' : 'This item becomes its top item.');
      })() + '</p>' +
      '<div class="souls-item-list">' + items.map(function (entry) {
        var item = entry.item || {};
        return '<button type="button" class="souls-item" data-pick-item="' + esc(entry.uid) + '"><img src="' + esc(item.img) + '" alt=""><span><b>' + esc(item.name) + '</b><em>' + esc(item.description) + '</em></span></button>';
      }).join('') + '</div>', 'souls-modal--picker');
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick-item]');
      if (b) startFitting(pet, b.getAttribute('data-pick-item'));
    });
  }

  async function startFitting(pet, itemUid) {
    showFitting(pet, { petId: String(pet.id), itemUid: itemUid, variants: [], rendersLeft: 3, maxRenders: 3 }, { rendering: true });
    await render(pet, itemUid);
  }

  async function render(pet, itemUid) {
    busy = true;
    try {
      var r = await app().apiRequest('/api/shop/try-on', { petId: pet.id, itemUid: itemUid });
      busy = false;
      app().setTryOn(r.tryOn);
      showFitting(pet, r.tryOn);
    } catch (err) {
      busy = false;
      toast(err.message || 'Could not draw the pet.');
      try { var cur = (await app().apiRequest('/api/shop/try-on', {}, 'GET')).tryOn; if (cur) { showFitting(pet, cur); return; } } catch (e) {}
      closeModal();
    }
  }

  var selectedVariant = null;
  var GENERATION_ANIMATION = 'https://cdn.lottielab.com/l/4MgWbT9s44YPvt.html'; // the same one as "Cooking up your pet..."

  // One picture first; variants to choose from appear only after "Try again".
  function showFitting(pet, tryOn, opts) {
    opts = opts || {};
    var entry = inventory().find(function (i) { return i.uid === tryOn.itemUid; });
    var item = (entry && entry.item) || {};
    var petName = pet.name || pet.displayName;
    if (opts.rendering) {
      openModal(
        '<div class="fit-process"><iframe class="fit-lottie" src="' + GENERATION_ANIMATION + '" width="220" height="220" frameborder="0" title="Generation animation"></iframe></div>' +
        '<h2 class="souls-title fit-process-title">Dressing up ' + esc(petName) + '…</h2>' +
        '<p class="souls-text fit-process-text">Please wait, it could take a few seconds</p>', 'souls-modal--fitting souls-modal--rendering');
      return;
    }
    var variants = tryOn.variants || [];
    if (!selectedVariant || !variants.some(function (v) { return v.id === selectedVariant; })) selectedVariant = variants.length ? variants[variants.length - 1].id : null;
    var current = variants.find(function (v) { return v.id === selectedVariant; });
    var left = tryOn.rendersLeft;
    var thumbs = variants.length > 1
      ? '<div class="fit-thumbs">' + variants.map(function (v, i) {
          return '<button type="button" class="fit-thumb' + (v.id === selectedVariant ? ' is-selected' : '') + '" data-variant="' + esc(v.id) + '"><img src="' + esc(v.imageUrl) + '" alt=""><figcaption>' + (i + 1) + '</figcaption></button>';
        }).join('') + '</div>'
      : '';
    var body = openModal(
      '<h2 class="souls-title">' + esc(petName) + ' with ' + esc(item.name || 'the item') + '</h2>' +
      (variants.length > 1 ? '<p class="souls-text">Pick the one you like.</p>' : '') +
      '<div class="fit-stage"><img src="' + esc(current ? current.imageUrl : pet.imageUrl) + '" alt=""></div>' +
      thumbs +
      '<div class="souls-actions">' +
        (left > 0 ? '<button class="souls-btn souls-btn--ghost" type="button" data-reroll>Try again</button>' : '') +
        '<button class="souls-btn souls-btn--dark" type="button" data-keep' + (current ? '' : ' disabled') + '>' + (variants.length > 1 ? 'Keep this one' : 'Keep it') + '</button>' +
      '</div>', 'souls-modal--fitting');
    body.addEventListener('click', function (e) {
      var v = e.target.closest('[data-variant]');
      if (v) {
        // Switch in place: only the big picture and the selected thumb change.
        selectedVariant = v.getAttribute('data-variant');
        current = variants.find(function (x) { return x.id === selectedVariant; }) || current;
        body.querySelector('.fit-stage img').src = current.imageUrl;
        body.querySelectorAll('[data-variant]').forEach(function (b) { b.classList.toggle('is-selected', b === v); });
        return;
      }
      if (e.target.closest('[data-reroll]') && left > 0 && !busy) {
        selectedVariant = null; // show the new picture when it arrives
        showFitting(pet, tryOn, { rendering: true });
        render(pet, tryOn.itemUid);
        return;
      }
      if (e.target.closest('[data-keep]') && current && !busy) keep(pet, item, current.id, e.target.closest('[data-keep]'));
    });
  }

  async function keep(pet, item, variantId, btn) {
    busy = true; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      var r = await app().apiRequest('/api/shop/apply', { variantId: variantId });
      app().setItems(r.items);
      app().setTryOn(null);
      busy = false;
      closeModal();
      // Back to My Pets, scrolled to the pet in its new look (owner 2026-10-14).
      app().moveTo('cabinet');
      await app().reloadProfile();
      var card = document.querySelector('.cabinet-character[data-character-id="' + String(pet.id).replace(/"/g, '') + '"]');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-just-dressed');
        setTimeout(function () { card.classList.remove('is-just-dressed'); }, 1600);
      }
      if (window.confetti) window.confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      toast((pet.name || pet.displayName) + ' now wears ' + (item.name || 'the item') + (r.nftImageUpdated ? ' · NFT picture updated' : ''));
    } catch (err) {
      busy = false; btn.disabled = false; btn.textContent = 'Keep it';
      toast(err.message || 'Could not save the picture.');
    }
  }

  window.PetixSouls = {
    renderShop: renderShop,
    refresh: function () { if (shopHost && !shopHost.classList.contains('hidden')) renderShop(); },
    openPutOn: openPutOn,
  };
})();
