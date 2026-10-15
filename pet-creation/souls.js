// Souls (031) — the dashboard side: Shop screen (For sale / My items), putting an
// item on a pet (pick item → render → up to two re-rolls → keep one), and the
// Profile modal with the one-time Solana wallet link (Phantom / MetaMask / WalletConnect).
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

  // ---------- profile + Solana link (Phantom / MetaMask / WalletConnect) ----------
  // Phantom and MetaMask expose Solana through the Wallet Standard (window events), Phantom also
  // through window.phantom.solana. WalletConnect: the vendored EVM provider carries a universal
  // provider (`.signer`) that can open a Solana session; we draw the QR ourselves.
  var SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  var stdWallets = [];
  function registerStd() {
    for (var i = 0; i < arguments.length; i++) if (stdWallets.indexOf(arguments[i]) === -1) stdWallets.push(arguments[i]);
    return function () {};
  }
  window.addEventListener('wallet-standard:register-wallet', function (e) { try { e.detail({ register: registerStd }); } catch (err) {} });
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: registerStd } })); } catch (err) {}

  function stdSolanaWallet(re) {
    return stdWallets.find(function (w) {
      return re.test(w.name || '') && (w.chains || []).some(function (c) { return String(c).indexOf('solana:') === 0; }) &&
        w.features && w.features['standard:connect'] && w.features['solana:signMessage'];
    }) || null;
  }

  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58encode(bytes) {
    var n = 0n; for (var i = 0; i < bytes.length; i++) n = n * 256n + BigInt(bytes[i]);
    var out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
    for (var j = 0; j < bytes.length && bytes[j] === 0; j++) out = '1' + out;
    return out;
  }
  function b58decode(str) {
    var n = 0n; for (var i = 0; i < str.length; i++) { var v = B58.indexOf(str[i]); if (v < 0) throw new Error('Bad signature encoding.'); n = n * 58n + BigInt(v); }
    var bytes = []; while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
    for (var j = 0; j < str.length && str[j] === '1'; j++) bytes.unshift(0);
    return new Uint8Array(bytes);
  }
  function toBase64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }

  var METHODS = {
    phantom: {
      name: 'Phantom', icon: '/assets/wallets/phantom.svg', install: 'https://phantom.app/download',
      available: function () { return !!(stdSolanaWallet(/phantom/i) || (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom)); },
      connect: async function () {
        var w = stdSolanaWallet(/phantom/i);
        if (w) return stdSigner(w);
        var p = window.phantom.solana;
        var r = await p.connect();
        var address = (r && r.publicKey ? r.publicKey : p.publicKey).toString();
        return { address: address, sign: async function (bytes) { var s = await p.signMessage(bytes, 'utf8'); return s && s.signature ? s.signature : s; } };
      },
    },
    metamask: {
      name: 'MetaMask', icon: '/assets/wallets/metamask.svg', install: 'https://metamask.io/download/',
      note: 'Needs Solana turned on in MetaMask',
      available: function () { return !!stdSolanaWallet(/metamask/i); },
      connect: async function () {
        var w = stdSolanaWallet(/metamask/i);
        if (!w) throw new Error('MetaMask with Solana was not found. Turn on Solana in MetaMask and reload the page.');
        return stdSigner(w);
      },
    },
    walletconnect: {
      name: 'WalletConnect', icon: '/assets/wallets/walletconnect.svg',
      note: 'Scan with a Solana wallet on your phone',
      available: function () { return !!window.PETIX_WALLETCONNECT_PROJECT_ID; },
      connect: function () { return walletConnectSigner(); },
    },
  };

  async function stdSigner(wallet) {
    var res = await wallet.features['standard:connect'].connect();
    var accounts = (res && res.accounts) || wallet.accounts || [];
    var account = accounts.find(function (a) { return (a.chains || []).some(function (c) { return String(c).indexOf('solana:') === 0; }); }) || accounts[0];
    if (!account) throw new Error('The wallet returned no Solana account.');
    return {
      address: account.address,
      sign: async function (bytes) {
        var out = await wallet.features['solana:signMessage'].signMessage({ account: account, message: bytes });
        var first = Array.isArray(out) ? out[0] : out;
        return first.signature;
      },
    };
  }

  var wcProvider = null;
  async function walletConnectSigner() {
    if (typeof window.loadWalletConnectBundle === 'function') await window.loadWalletConnectBundle();
    var lib = window.WalletConnectEthereumProvider || window.EthereumProvider;
    var Factory = lib && (lib.EthereumProvider || lib);
    if (!Factory || typeof Factory.init !== 'function') throw new Error('WalletConnect failed to load.');
    if (!wcProvider) {
      wcProvider = await Factory.init({
        projectId: window.PETIX_WALLETCONNECT_PROJECT_ID, showQrModal: false, optionalChains: [1],
        metadata: { name: 'PETIX', description: 'Link a Solana wallet to Petix', url: location.origin, icons: [location.origin + '/assets/character/current-pet.jpg'] },
      });
    }
    var signer = wcProvider.signer;
    var cancel;
    var cancelled = new Promise(function (_, reject) { cancel = function () { reject(Object.assign(new Error('Cancelled.'), { code: 4001 })); }; });
    var onUri = function (uri) { showWalletConnectQr(uri, cancel); };
    signer.on('display_uri', onUri);
    var session;
    try {
      // Closing the QR window cancels the wait; the pending pairing just expires on the relay.
      session = await Promise.race([
        signer.connect({ optionalNamespaces: { solana: { methods: ['solana_signMessage'], chains: [SOLANA_MAINNET], events: [] } } }),
        cancelled,
      ]);
    } finally {
      if (signer.off) signer.off('display_uri', onUri); else if (signer.removeListener) signer.removeListener('display_uri', onUri);
    }
    var acc = ((session && session.namespaces && session.namespaces.solana && session.namespaces.solana.accounts) || [])[0];
    if (!acc) throw new Error('This wallet did not share a Solana account. Try a Solana wallet like Phantom or Solflare.');
    var address = acc.split(':').pop();
    return {
      address: address,
      sign: async function (bytes) {
        var r = await signer.request({ method: 'solana_signMessage', params: { message: b58encode(bytes), pubkey: address } }, SOLANA_MAINNET);
        return b58decode(r && r.signature ? r.signature : r);
      },
    };
  }

  function showWalletConnectQr(uri, onCancel) {
    var svg = '';
    try { var qr = window.qrcode(0, 'M'); qr.addData(uri); qr.make(); svg = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true }); } catch (e) { svg = ''; }
    var body = openModal(
      '<div class="sol-qr-head"><img src="/assets/wallets/walletconnect.svg" alt="" width="32" height="32"><h2 class="souls-title">Scan with your Solana wallet</h2></div>' +
      '<p class="souls-text">Open Phantom, Solflare or another Solana wallet on your phone and scan the code.</p>' +
      '<div class="sol-qr">' + (svg || '<p class="souls-text">Could not draw the QR code — copy the link below.</p>') + '</div>' +
      '<div class="souls-actions"><button class="souls-btn souls-btn--ghost" type="button" data-copy-wc>Copy link</button></div>', 'souls-modal--qr');
    modal.__onClose = function () { if (onCancel) onCancel(); };
    body.querySelector('[data-copy-wc]').addEventListener('click', function () {
      try { navigator.clipboard.writeText(uri); toast('Link copied.'); } catch (e) {}
    });
  }

  function solReward() { return Math.max(0, Math.floor(Number(st().soulsSolanaReward) || 0)); }

  function short(a) { a = String(a || ''); return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a; }

  function openProfile() {
    var s = st();
    var sol = s.solana;
    var solBlock;
    if (sol) {
      // Linked: the same row as the main wallet. The link is permanent, nothing else to say.
      solBlock = '<div class="profile-row"><span class="profile-label">Solana wallet</span><span class="profile-value" title="' + esc(sol.address) + '">' + esc(short(sol.address)) + '</span></div>';
    } else {
      solBlock =
        '<div class="sol-card">' +
          '<div class="sol-card-head"><span class="sol-card-title">Link a Solana wallet</span>' +
            (solReward() > 0 ? '<span class="sol-reward">+' + fmt(solReward()) + '<img src="' + SOUL_ICON + '" alt="souls" width="16" height="16"></span>' : '') +
          '</div>' +
          '<p class="souls-note">Link your Solana wallet to your Petix profile' + (solReward() > 0 ? ' and get ' + fmt(solReward()) + ' souls' : '') + '. It’s a one-time link: <b>you won’t be able to change it later</b>.</p>' +
          '<div class="sol-options">' + Object.keys(METHODS).map(function (key) {
            var m = METHODS[key];
            var ok = m.available();
            var badge = key === 'walletconnect' ? (ok ? '<span class="sol-badge">QR code</span>' : '<span class="sol-badge is-off">Unavailable</span>')
              : ok ? '<span class="wallet-detected">Detected</span>' : '<span class="sol-badge is-off">Not found</span>';
            return '<button type="button" class="sol-option" data-sol-method="' + key + '">' +
              '<img src="' + m.icon + '" alt="" width="28" height="28">' +
              '<span class="sol-option-text"><b>' + m.name + '</b>' + (m.note ? '<em>' + m.note + '</em>' : '') + '</span>' + badge +
            '</button>';
          }).join('') + '</div>' +
        '</div>';
    }
    var body = openModal(
      '<h2 class="souls-title">Profile</h2>' +
      '<div class="profile-rows"><div class="profile-row"><span class="profile-label">Main wallet</span><span class="profile-value">' + esc(short(s.walletAddress)) + '</span></div>' +
      (sol ? solBlock + '</div>' : '</div>' + solBlock), 'souls-modal--profile');
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sol-method]');
      if (b) linkSolana(b.getAttribute('data-sol-method'));
    });
  }

  function signingModal(method, text) {
    openModal('<div class="souls-confirm-art souls-confirm-art--wallet"><img src="' + method.icon + '" alt=""></div>' +
      '<h2 class="souls-title">' + text + '</h2><div class="fit-loader fit-loader--inline"><i></i></div>', 'souls-modal--confirm');
  }

  async function linkSolana(key) {
    var method = METHODS[key];
    if (!method || busy) return;
    if (!method.available()) {
      if (method.install) { toast(method.name + (key === 'metamask' ? ' with Solana was not found. Turn on Solana in MetaMask.' : ' is not installed in this browser.')); window.open(method.install, '_blank', 'noopener'); }
      else toast('WalletConnect is not configured.');
      return;
    }
    var signer;
    if (key !== 'walletconnect') { busy = true; signingModal(method, 'Connect ' + method.name); }
    try {
      signer = await method.connect();
    } catch (err) {
      busy = false;
      toast(err && err.code === 4001 ? 'Cancelled.' : (err.message || 'Could not connect the wallet.'));
      openProfile();
      return;
    }
    busy = false;

    var yes = await askConfirm({
      art: '<img src="' + method.icon + '" alt="">',
      title: 'Link this Solana wallet?',
      html: '<div class="souls-confirm-address">' + esc(signer.address) + '</div>' +
        '<p><b>This is permanent.</b> You won’t be able to change it, unlink it or link another Solana wallet to this profile. Signing in stays with your main wallet.</p>' +
        (solReward() > 0 ? '<p class="souls-confirm-reward">You get ' + soulPrice(solReward()) + ' souls.</p>' : '') +
        '<p class="souls-confirm-hint">' + esc(method.name) + ' will ask you to sign a message. It’s free: no transaction, no fee.</p>',
      confirm: 'Link wallet',
      primaryClass: 'souls-btn--dark',
    });
    if (!yes) { openProfile(); return; }

    busy = true;
    signingModal(method, 'Sign the message in ' + method.name);
    try {
      var wallet = String(st().walletAddress || '').toLowerCase();
      var message = [
        'Petix: link this Solana wallet to my Petix profile.',
        'Petix profile: ' + wallet,
        'Solana wallet: ' + signer.address,
        "This is a one-time link and can't be changed later.",
        'Nonce: ' + Math.random().toString(36).slice(2, 10),
        'Issued At: ' + new Date().toISOString(),
      ].join('\n');
      var sig = await signer.sign(new TextEncoder().encode(message));
      var r = await app().apiRequest('/api/profile/solana-link', { address: signer.address, message: message, signature: toBase64(sig) });
      app().setSolana(r.solana);
      if (r.souls) app().setSouls(r.souls);
      busy = false;
      toast(r.soulsGained ? 'Solana wallet linked · +' + fmt(r.soulsGained) + ' souls.' : 'Solana wallet linked.');
      openProfile();
    } catch (err) {
      busy = false;
      toast(err && err.code === 4001 ? 'Cancelled in the wallet.' : (err.message || 'Could not link the wallet.'));
      openProfile();
    }
  }

  window.PetixSouls = {
    renderShop: renderShop,
    refresh: function () { if (shopHost && !shopHost.classList.contains('hidden')) renderShop(); },
    openPutOn: openPutOn,
    openProfile: openProfile,
  };
})();
