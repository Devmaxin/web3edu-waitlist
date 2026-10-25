/* Web3Edu waitlist: motion + interaction layer. Vanilla JS, no dependencies.
   Every effect has a CSS/no-JS fallback; observers and listeners are released on pagehide. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var cleanups = [];
  function on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); cleanups.push(function () { t.removeEventListener(ev, fn, opt); }); }
  window.addEventListener('pagehide', function () { cleanups.forEach(function (f) { f(); }); cleanups = []; });

  /* ---- feedback: toast ---- */
  var toastT;
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---- sticky header border ---- */
  var nav = $('#nav');
  if (nav) { var sc = function () { nav.classList.toggle('scrolled', window.scrollY > 8); }; sc(); on(window, 'scroll', sc, { passive: true }); }

  /* ---- scroll reveals (one observer, one-shot) ---- */
  var revealEls = $$('.reveal, .tl, .feat, .closer');
  if ('IntersectionObserver' in window && !reduce) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { rio.observe(el); });
    cleanups.push(function () { rio.disconnect(); });
  } else { revealEls.forEach(function (el) { el.classList.add('in'); }); }

  /* ---- idle animations only run while visible (saves battery on phones) ---- */
  var idle = $$('.stage, .closer');
  if ('IntersectionObserver' in window && idle.length) {
    var iio = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('in-view', e.isIntersecting); }); }, { threshold: 0.05 });
    idle.forEach(function (el) { iio.observe(el); });
    cleanups.push(function () { iio.disconnect(); });
  } else { idle.forEach(function (el) { el.classList.add('in-view'); }); }

  /* ---- scattered -> ordered ---- */
  var sw = $('.scatter-wrap');
  if (sw) {
    var settle = function () { sw.setAttribute('data-state', 'ordered'); };
    if (reduce || !('IntersectionObserver' in window)) settle();
    else {
      var sio = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { setTimeout(settle, 650); sio.disconnect(); }   // let the visitor see the mess first
      }, { threshold: 0.62 });
      sio.observe($('.scatter', sw)); cleanups.push(function () { sio.disconnect(); });
    }
  }

  /* ---- FAQ accordion (single open, first open by default) ---- */
  var fqs = $$('.fq');
  fqs.forEach(function (item) {
    var btn = $('.fq-q', item);
    on(btn, 'click', function () {
      var open = !item.classList.contains('open');
      fqs.forEach(function (o) { o.classList.remove('open'); $('.fq-q', o).setAttribute('aria-expanded', 'false'); });
      if (open) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ---- copy: the control itself confirms, plus a toast ---- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = doc.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'hp'; doc.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, 9999);
      try { doc.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } ta.remove();
    });
  }
  function confirmOn(btn, label) {
    var old = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', old);
    if (btn.classList.contains('btn')) { btn.classList.add('is-done'); btn.textContent = label; }
    clearTimeout(btn._t); btn._t = setTimeout(function () { btn.classList.remove('is-done'); if (btn.classList.contains('btn')) btn.textContent = old; }, 1800);
  }
  $$('[data-copy]').forEach(function (b) {
    on(b, 'click', function () {
      var inp = $(b.getAttribute('data-copy')); if (!inp) return;
      copyText(inp.value).then(function () { confirmOn(b, 'Copied'); toast('Link copied'); }, function () { inp.select(); toast('Press and hold to copy'); });
    });
  });
  $$('[data-copy-text]').forEach(function (b) {
    on(b, 'click', function () { copyText(b.getAttribute('data-copy-text')).then(function () { toast('Waitlist ID copied'); }, function () { toast('Couldn’t copy'); }); });
  });
  var sh = $('#share-ref');
  if (sh && navigator.share) {
    sh.hidden = false;
    on(sh, 'click', function () {
      navigator.share({ title: 'Join me on the Web3Edu waitlist', text: 'I just joined the Web3Edu early-access list. Join through my link:', url: sh.getAttribute('data-share-url') }).catch(function () {});
    });
  }

  /* ---- Waitlist ID: letters settle in (text stays one readable string for assistive tech) ---- */
  var idt = $('.idtxt');
  if (idt && !reduce) {
    var txt = idt.textContent; idt.textContent = '';
    for (var i = 0; i < txt.length; i++) {
      var sp = doc.createElement('span'); sp.className = 'ch'; sp.setAttribute('aria-hidden', 'true'); sp.textContent = txt.charAt(i);
      sp.style.animationDelay = (0.7 + i * 0.022) + 's'; idt.appendChild(sp);
    }
  }

  /* ---- pass export (client-side canvas; nothing leaves the browser) ---- */
  var card = $('#pass-card'), saveBtn = $('#save-pass'), shareBtn = $('#share-pass');
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function loadImg(src) { return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function drawPass() {
    return Promise.all([loadImg('/assets/img/logo-mark.png'), loadImg(card.dataset.avatar || '')]).then(function (imgs) {
      return new Promise(function (resolve, reject) {
        var logo = imgs[0], av = imgs[1], W = 1080, H = 1560, cv = doc.createElement('canvas'); cv.width = W; cv.height = H;
        var c = cv.getContext('2d');
        var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#15102a'); g.addColorStop(0.65, '#0b0a10'); g.addColorStop(1, '#0b0a10');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        var rg = c.createRadialGradient(W - 120, 160, 10, W - 120, 160, 520); rg.addColorStop(0, 'rgba(124,77,255,.55)'); rg.addColorStop(1, 'rgba(124,77,255,0)');
        c.fillStyle = rg; c.fillRect(0, 0, W, H);
        if (logo) { c.save(); rr(c, 90, 90, 96, 96, 24); c.clip(); c.drawImage(logo, 90, 90, 96, 96); c.restore(); }
        c.fillStyle = '#fff'; c.font = '800 54px system-ui,Arial,sans-serif'; c.textBaseline = 'middle'; c.fillText('Web3Edu', 210, 138);
        c.font = '700 26px system-ui,Arial,sans-serif'; c.fillStyle = '#cbb8ff'; var tag = 'EARLY ACCESS', tw = c.measureText(tag).width + 48;
        c.strokeStyle = 'rgba(203,184,255,.45)'; c.lineWidth = 2; rr(c, W - 90 - tw, 108, tw, 60, 30); c.stroke(); c.fillText(tag, W - 90 - tw + 24, 139);
        c.fillStyle = '#a79bc9'; c.font = '600 28px system-ui,Arial,sans-serif'; c.fillText('WAITLIST ID', 90, 262);
        c.fillStyle = '#fff'; c.font = '700 86px ui-monospace,Menlo,Consolas,monospace'; c.fillText(card.dataset.wid, 90, 340);
        // member row: avatar (or the cube), name, optional points
        c.save(); rr(c, 90, 410, 132, 132, 36); c.clip(); c.fillStyle = '#1b1530'; c.fillRect(90, 410, 132, 132);
        if (av) c.drawImage(av, 90, 410, 132, 132); else if (logo) c.drawImage(logo, 90 + 20, 410 + 20, 92, 92); c.restore();
        c.strokeStyle = 'rgba(203,184,255,.55)'; c.lineWidth = 3; rr(c, 90, 410, 132, 132, 36); c.stroke();
        c.fillStyle = '#a79bc9'; c.font = '600 26px system-ui,Arial,sans-serif'; c.fillText('MEMBER', 252, 450);
        c.fillStyle = '#fff'; c.font = '800 54px system-ui,Arial,sans-serif'; c.fillText((card.dataset.name || 'Early member').slice(0, 18), 252, 506);
        if (card.dataset.showpoints === '1') {
          c.textAlign = 'right'; c.fillStyle = '#a79bc9'; c.font = '600 26px system-ui,Arial,sans-serif'; c.fillText('POINTS', W - 90, 450);
          c.fillStyle = '#fff'; c.font = '800 54px system-ui,Arial,sans-serif'; c.fillText(card.dataset.points, W - 90, 506); c.textAlign = 'left';
        }
        var bits = card.dataset.qr, n = Math.round(Math.sqrt(bits.length)), tile = 700, tx = (W - tile) / 2, ty = 620;
        c.fillStyle = '#fff'; rr(c, tx, ty, tile, tile, 40); c.fill();
        var m = Math.floor(tile / (n + 8)), off = (tile - m * n) / 2; c.fillStyle = '#0b0b10';   /* 4-module quiet zone per the QR spec */
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (bits.charAt(y * n + x) === '1') c.fillRect(tx + off + x * m, ty + off + y * m, m, m);
        c.textAlign = 'center'; c.fillStyle = '#d9ceff'; c.font = '600 34px system-ui,Arial,sans-serif';
        c.fillText(card.dataset.locked === '1' ? 'Locked until launch' : 'Launch is open', W / 2, 1400);
        c.fillStyle = '#a79bc9'; c.font = '500 26px system-ui,Arial,sans-serif'; c.fillText('Web3Edu early-access pass. Not a financial asset.', W / 2, 1450);
        cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('blob')); }, 'image/png');
      });
    });
  }
  if (card && saveBtn) {
    on(saveBtn, 'click', function () {
      saveBtn.classList.add('is-loading'); saveBtn.setAttribute('aria-busy', 'true');
      drawPass().then(function (blob) {
        var url = URL.createObjectURL(blob), a = doc.createElement('a');
        a.href = url; a.download = 'web3edu-pass.png'; doc.body.appendChild(a); a.click(); a.remove();
        if (/iP(hone|ad|od)/.test(navigator.userAgent)) setTimeout(function () { window.open(url, '_blank'); }, 400);   // iOS may ignore download: open for long-press save
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        toast('Pass image ready');
      }).catch(function () { toast('Couldn’t create the image'); }).then(function () { saveBtn.classList.remove('is-loading'); saveBtn.removeAttribute('aria-busy'); });
    });
    if (shareBtn && navigator.canShare) {
      shareBtn.hidden = false;
      on(shareBtn, 'click', function () {
        drawPass().then(function (blob) {
          var f = new File([blob], 'web3edu-pass.png', { type: 'image/png' });
          if (navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: 'My Web3Edu pass' });
          toast('Sharing images isn’t supported here. Use Save.');
        }).catch(function () {});
      });
    }
  }
})();
