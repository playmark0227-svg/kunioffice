/* ============================================================
   若葉のしずく — カート & 共通UI
   ============================================================ */
(function () {
    'use strict';

    var C = window.WAKABA;
    var KEY = 'wakaba_cart_v1';

    function storageGet(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function storageSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* private mode etc. */ }
    }

    function yen(n) {
        return Number(n).toLocaleString('ja-JP') + '円';
    }

    function clampQty(product, qty) {
        var q = Math.floor(Number(qty));
        if (!(q > 0)) q = 1;
        return Math.min(product.maxQty, q);
    }

    /* ---------------- Cart model ---------------- */
    var Cart = {
        read: function () {
            var parsed;
            try { parsed = JSON.parse(storageGet(KEY)); } catch (e) { parsed = null; }
            if (!Array.isArray(parsed)) return [];
            var merged = {};
            parsed.forEach(function (item) {
                var product = item && C.products[item.id];
                var q = Math.floor(Number(item && item.qty));
                if (!product || !(q > 0)) return;
                merged[item.id] = Math.min(product.maxQty, (merged[item.id] || 0) + q);
            });
            // keep catalog order so every page lists items the same way
            return Object.keys(C.products)
                .filter(function (id) { return merged[id]; })
                .map(function (id) { return { id: id, qty: merged[id] }; });
        },

        write: function (items) {
            storageSet(KEY, JSON.stringify(items));
            document.dispatchEvent(new CustomEvent('wakaba:cart'));
        },

        add: function (id, qty) {
            var product = C.products[id];
            if (!product) return;
            var items = Cart.read();
            var found = items.filter(function (i) { return i.id === id; })[0];
            if (found) {
                found.qty = Math.min(product.maxQty, found.qty + clampQty(product, qty));
            } else {
                items.push({ id: id, qty: clampQty(product, qty) });
            }
            Cart.write(items);
        },

        setQty: function (id, qty) {
            var product = C.products[id];
            if (!product) return;
            Cart.write(Cart.read().map(function (i) {
                return i.id === id ? { id: id, qty: clampQty(product, qty) } : i;
            }));
        },

        remove: function (id) {
            Cart.write(Cart.read().filter(function (i) { return i.id !== id; }));
        },

        clear: function () {
            Cart.write([]);
        },

        totals: function () {
            var lines = Cart.read().map(function (i) {
                var p = C.products[i.id];
                return { id: i.id, qty: i.qty, product: p, lineTotal: p.price * i.qty };
            });
            var onetime = 0, sub = 0, count = 0, needsShippingFee = false;
            lines.forEach(function (l) {
                count += l.qty;
                if (l.product.type === 'subscription') {
                    sub += l.lineTotal;
                } else {
                    onetime += l.lineTotal;
                    if (!l.product.freeShipping) needsShippingFee = true;
                }
            });
            var shipping = (onetime > 0 && needsShippingFee && onetime < C.shipping.freeThreshold)
                ? C.shipping.fee : 0;
            return {
                lines: lines,
                count: count,
                onetime: onetime,
                sub: sub,
                shipping: shipping,
                total: onetime + sub + shipping,
                hasSub: sub > 0,
                hasOnetime: onetime > 0,
                toFreeShipping: (needsShippingFee && onetime > 0 && onetime < C.shipping.freeThreshold)
                    ? C.shipping.freeThreshold - onetime : 0
            };
        }
    };

    /* ---------------- Rendering helpers ---------------- */
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k];
            else if (k === 'className') node.className = attrs[k];
            else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) { if (c) node.appendChild(c); });
        return node;
    }

    function stepper(line) {
        var input = el('input', {
            type: 'number', min: '1', max: String(line.product.maxQty), value: String(line.qty),
            inputmode: 'numeric', 'aria-label': line.product.name + 'の数量', 'data-line-qty': line.id
        });
        return el('div', { className: 'qty qty--sm' }, [
            el('button', { type: 'button', 'data-line-step': '-1', 'data-id': line.id, 'aria-label': '1つ減らす', text: '−' }),
            input,
            el('button', { type: 'button', 'data-line-step': '1', 'data-id': line.id, 'aria-label': '1つ増やす', text: '+' })
        ]);
    }

    function renderLines(container, t, opts) {
        container.innerHTML = '';
        if (!t.lines.length) {
            container.appendChild(el('p', { className: 'cart-empty', text: 'カートに商品はありません。' }));
            return;
        }
        t.lines.forEach(function (l) {
            var meta = el('div', { className: 'cart-line__meta' }, [
                l.product.type === 'subscription' ? el('span', { className: 'tag tag--pink', text: '定期便' }) : null,
                el('p', { className: 'cart-line__name', text: l.product.name }),
                el('p', { className: 'cart-line__spec', text: l.product.spec }),
                el('p', { className: 'cart-line__price', text: yen(l.product.price) + '（税込）' + (l.product.type === 'subscription' ? '／回' : '') })
            ]);
            var controls = opts && opts.readonly
                ? el('p', { className: 'cart-line__qty', text: '数量：' + l.qty })
                : el('div', { className: 'cart-line__controls' }, [
                    stepper(l),
                    el('button', { type: 'button', className: 'link-btn', 'data-remove': l.id, text: '削除' })
                ]);
            container.appendChild(el('div', { className: 'cart-line' }, [
                el('img', { src: l.product.image, alt: '', width: '88', height: '62', loading: 'lazy' }),
                meta,
                el('div', { className: 'cart-line__right' }, [
                    controls,
                    el('p', { className: 'cart-line__total', text: yen(l.lineTotal) })
                ])
            ]));
        });
    }

    function renderTotals(container, t) {
        container.innerHTML = '';
        if (!t.lines.length) return;
        var rows = [];
        if (t.hasOnetime) rows.push(['商品代金（通常購入）', yen(t.onetime)]);
        if (t.hasSub) rows.push(['定期便（初回分）', yen(t.sub)]);
        rows.push(['送料', t.shipping ? yen(t.shipping) : '無料']);
        var dl = el('dl', { className: 'totals' });
        rows.forEach(function (r) {
            dl.appendChild(el('dt', { text: r[0] }));
            dl.appendChild(el('dd', { text: r[1] }));
        });
        dl.appendChild(el('dt', { className: 'totals__sum', text: '今回のお支払い合計（税込）' }));
        dl.appendChild(el('dd', { className: 'totals__sum', text: yen(t.total) }));
        container.appendChild(dl);
        if (t.toFreeShipping) {
            container.appendChild(el('p', { className: 'note note--leaf', text: 'あと ' + yen(t.toFreeShipping) + '（通常購入）で送料無料になります。' }));
        }
        if (t.hasSub) {
            container.appendChild(el('p', { className: 'note', text: '定期便は2回目以降も毎回 ' + yen(t.sub) + '（税込・送料無料）でお届けします。' }));
        }
    }

    /* ---------------- Header badge / drawer ---------------- */
    function refreshBadges() {
        var t = Cart.totals();
        document.querySelectorAll('[data-cart-count]').forEach(function (b) {
            b.textContent = t.count;
            b.hidden = t.count === 0;
        });
        document.querySelectorAll('[data-cart-label]').forEach(function (b) {
            b.setAttribute('aria-label', 'カートを開く（' + t.count + '点）');
        });
        var drawerLines = document.querySelector('[data-drawer-lines]');
        var drawerTotals = document.querySelector('[data-drawer-totals]');
        if (drawerLines) renderLines(drawerLines, t);
        if (drawerTotals) renderTotals(drawerTotals, t);
        document.querySelectorAll('[data-needs-items]').forEach(function (n) {
            if (n.tagName === 'A') n.classList.toggle('is-disabled', !t.count);
            else n.disabled = !t.count;
            n.setAttribute('aria-disabled', String(!t.count));
        });
        var page = document.querySelector('[data-cart-page]');
        if (page) {
            renderLines(page.querySelector('[data-page-lines]'), t);
            renderTotals(page.querySelector('[data-page-totals]'), t);
        }
    }

    var lastFocus = null;
    function openDrawer() {
        var drawer = document.getElementById('cartDrawer');
        if (!drawer) { window.location.href = 'cart.html'; return; }
        lastFocus = document.activeElement;
        document.body.classList.add('drawer-open');
        drawer.setAttribute('aria-hidden', 'false');
        var closeBtn = drawer.querySelector('[data-close-cart]');
        if (closeBtn) closeBtn.focus();
    }
    function closeDrawer() {
        var drawer = document.getElementById('cartDrawer');
        if (!drawer) return;
        document.body.classList.remove('drawer-open');
        drawer.setAttribute('aria-hidden', 'true');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    var toastTimer;
    function toast(message) {
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = message;
        t.classList.add('is-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('is-show'); }, 2400);
    }

    /* ---------------- Events ---------------- */
    document.addEventListener('click', function (e) {
        var target = e.target.closest('button, a');
        if (!target) return;

        // product gallery thumbnails
        if (target.hasAttribute('data-gallery-src')) {
            var main = document.getElementById('galleryMain');
            if (main) {
                main.src = target.getAttribute('data-gallery-src');
                main.alt = target.getAttribute('data-gallery-alt') || '';
            }
            target.parentNode.querySelectorAll('[data-gallery-src]').forEach(function (b) {
                b.setAttribute('aria-pressed', String(b === target));
            });
            return;
        }

        // product-card steppers
        if (target.hasAttribute('data-step')) {
            var box = target.closest('.qty');
            var input = box && box.querySelector('input');
            if (input) {
                var max = Number(input.max) || 99;
                var next = Math.min(max, Math.max(1, (Math.floor(Number(input.value)) || 1) + Number(target.getAttribute('data-step'))));
                input.value = next;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
        }

        // cart line steppers
        if (target.hasAttribute('data-line-step')) {
            var id = target.getAttribute('data-id');
            var current = Cart.read().filter(function (i) { return i.id === id; })[0];
            if (current) Cart.setQty(id, current.qty + Number(target.getAttribute('data-line-step')));
            return;
        }

        if (target.hasAttribute('data-remove')) {
            Cart.remove(target.getAttribute('data-remove'));
            return;
        }

        if (target.hasAttribute('data-add')) {
            var pid = target.getAttribute('data-add');
            var qtyInput = document.querySelector('[data-qty-for="' + pid + '"]');
            Cart.add(pid, qtyInput ? qtyInput.value : 1);
            toast('「' + C.products[pid].label + '」をカートに入れました');
            openDrawer();
            return;
        }

        if (target.hasAttribute('data-open-cart')) {
            e.preventDefault();
            openDrawer();
            return;
        }

        if (target.hasAttribute('data-close-cart')) {
            closeDrawer();
            return;
        }

        if (target.classList.contains('is-disabled')) {
            e.preventDefault();
            return;
        }

        if (target.id === 'navToggle') {
            var open = document.body.classList.toggle('nav-open');
            target.setAttribute('aria-expanded', String(open));
            return;
        }

        if (target.closest('.site-nav') && target.tagName === 'A') {
            document.body.classList.remove('nav-open');
            var toggle = document.getElementById('navToggle');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }
    });

    // typed quantity (cart lines + product cards)
    document.addEventListener('change', function (e) {
        var input = e.target;
        if (input.hasAttribute('data-line-qty')) {
            Cart.setQty(input.getAttribute('data-line-qty'), input.value);
            return;
        }
        if (input.closest && input.closest('.qty') && input.type === 'number') {
            var max = Number(input.max) || 99;
            var v = Math.floor(Number(input.value));
            input.value = Math.min(max, Math.max(1, v || 1));
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeDrawer();
            closeCm();
        }
    });

    document.addEventListener('wakaba:cart', refreshBadges);
    window.addEventListener('storage', function (e) { if (e.key === KEY) refreshBadges(); });

    /* ---------------- CM modal ---------------- */
    function openCm() {
        var modal = document.getElementById('cmModal');
        if (!modal) return;
        modal.hidden = false;
        document.body.classList.add('modal-open');
        var v = modal.querySelector('video');
        if (v) {
            v.currentTime = 0;
            var p = v.play();
            if (p && p.catch) p.catch(function () { /* user can press play */ });
        }
        var close = modal.querySelector('[data-close-cm]');
        if (close) close.focus();
    }
    function closeCm() {
        var modal = document.getElementById('cmModal');
        if (!modal || modal.hidden) return;
        var v = modal.querySelector('video');
        if (v) v.pause();
        modal.hidden = true;
        document.body.classList.remove('modal-open');
    }
    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-play-cm]')) { e.preventDefault(); openCm(); }
        if (e.target.closest('[data-close-cm]') || e.target.classList.contains('cm-modal')) closeCm();
    });

    /* ---------------- Reveal on scroll ---------------- */
    function initReveal() {
        var items = document.querySelectorAll('.rv');
        if (!('IntersectionObserver' in window)) {
            items.forEach(function (n) { n.classList.add('is-in'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        items.forEach(function (n) { io.observe(n); });
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });
        refreshBadges();
        initReveal();
    });

    window.WakabaCart = Cart;
    window.WakabaUI = { yen: yen, renderLines: renderLines, renderTotals: renderTotals, toast: toast };
})();
