/* ============================================================
   KUNI OFFICE 管理画面 — 画面部品
   DOM の組み立て・ダイアログ・お知らせ（トースト）・保存領域など、
   画面のどこでも使う小さな道具です。文字は必ず textContent で入れます。
   ============================================================ */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // 24×24 の線アイコン（stroke で描く）
    const ICONS = {
        menu: 'M4 7h16M4 12h16M4 17h16',
        close: 'M6 6l12 12M18 6L6 18',
        check: 'M5 12.5l4.5 4.5L19 7.5',
        up: 'M12 19V5M6 11l6-6 6 6',
        down: 'M12 5v14M6 13l6 6 6-6',
        plus: 'M12 5v14M5 12h14',
        trash: 'M4 7h16M10 7V4h4v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
        camera: 'M3 8.5h4l2-3h6l2 3h4V19H3zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
        undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
        eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        eyeOff: 'M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
        external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
        history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4.5h4.5M12 7.5V12l3 2',
        phone: 'M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2z',
        page: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
        help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
        logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
        monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
        mobile: 'M7 2.5h10v19H7zM11 18.5h2',
        alert: 'M12 3l10 18H2zM12 10v4.5M12 18h.01',
        info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
        image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
        wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.6M14.5 10a10 10 0 0 1 4.5 2.5M2 9a15 15 0 0 1 4.3-2.7M10.5 5.1A15 15 0 0 1 22 9M12 20h.01',
        edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
        link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
        tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01'
    };

    function icon(name, doc) {
        const d = doc || document;
        const svg = d.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('class', 'ico');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const path = d.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', ICONS[name] || '');
        svg.appendChild(path);
        return svg;
    }

    /* ---------- DOM の組み立て ----------
       h('button', { class: 'btn', text: '保存', on: { click } }, 子要素…)
       文字列の子要素はテキストとして入るので、HTML として解釈されることはありません。 */
    function h(tag, props, ...children) {
        const doc = (props && props.doc) || document;
        const el = doc.createElement(tag);
        if (props) {
            for (const key of Object.keys(props)) {
                const value = props[key];
                if (value === null || value === undefined || value === false || key === 'doc') continue;
                if (key === 'class') el.className = value;
                else if (key === 'text') el.textContent = value;
                else if (key === 'on') Object.keys(value).forEach((ev) => el.addEventListener(ev, value[ev]));
                else if (key === 'dataset') Object.assign(el.dataset, value);
                else if (key === 'style') Object.assign(el.style, value);
                else if (typeof value !== 'string' && key in el) el[key] = value;
                else el.setAttribute(key, value === true ? '' : String(value));
            }
        }
        append(el, children);
        return el;
    }

    function append(el, children) {
        for (const child of [].concat(...children.map((c) => (Array.isArray(c) ? c.flat(Infinity) : [c])))) {
            if (child === null || child === undefined || child === false) continue;
            el.appendChild(typeof child === 'object' ? child : el.ownerDocument.createTextNode(String(child)));
        }
        return el;
    }

    function clear(el) {
        while (el.firstChild) el.removeChild(el.firstChild);
        return el;
    }

    // 外部のリンクは http(s) だけを許す
    function safeHref(href) {
        return /^https?:\/\//i.test(String(href || '')) ? String(href) : null;
    }

    function spinner(extraClass) {
        return h('span', { class: 'spin' + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true' });
    }

    /* ---------- 保存領域（プライベートモードなどで使えなくても止まらないように） ---------- */
    function storageOf(kind) {
        try {
            return kind === 'session' ? window.sessionStorage : window.localStorage;
        } catch (e) {
            return null;
        }
    }

    const store = {
        get(key, kind) {
            try {
                const s = storageOf(kind || 'local');
                return s ? s.getItem(key) : null;
            } catch (e) {
                return null;
            }
        },
        set(key, value, kind) {
            try {
                const s = storageOf(kind || 'local');
                if (s) s.setItem(key, value);
                return !!s;
            } catch (e) {
                return false;
            }
        },
        remove(key, kind) {
            try {
                const s = storageOf(kind || 'local');
                if (s) s.removeItem(key);
            } catch (e) { /* 使えないときは何もしない */ }
        }
    };

    /* ---------- お知らせ（トースト） ----------
       toast('公開しました', { type: 'success', link: { label: 'サイトで見る', href }, action: { label, onClick }, timeout }) */
    function toast(message, opts) {
        const o = opts || {};
        const type = o.type || 'info';
        const box = document.getElementById('toasts');
        if (!box) return null;
        const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
        const el = h('div', { class: 'toast toast--' + type, role: type === 'error' ? 'alert' : 'status' },
            h('span', { class: 'toast__icon' }, icon(iconName)),
            h('span', { class: 'toast__text', text: message }));
        if (o.link && safeHref(o.link.href)) {
            el.appendChild(h('a', { class: 'toast__action', href: safeHref(o.link.href), target: '_blank', rel: 'noopener', text: o.link.label }));
        }
        if (o.action) {
            el.appendChild(h('button', { class: 'toast__action', type: 'button', text: o.action.label,
                on: { click: () => { dismiss(); o.action.onClick(); } } }));
        }
        const closeBtn = h('button', { class: 'toast__close', type: 'button', 'aria-label': '閉じる', on: { click: () => dismiss() } }, icon('close'));
        el.appendChild(closeBtn);
        box.appendChild(el);
        requestAnimationFrame(() => el.classList.add('is-in'));
        let timer = null;
        const timeout = o.timeout !== undefined ? o.timeout : (o.link || o.action ? 9000 : type === 'error' ? 7000 : 3800);
        if (timeout) timer = setTimeout(dismiss, timeout);
        function dismiss() {
            if (timer) clearTimeout(timer);
            el.classList.remove('is-in');
            setTimeout(() => el.remove(), 250);
        }
        return { el, dismiss };
    }

    /* ---------- ダイアログ ----------
       modal({ title, kicker, body, actions: [{ label, kind, onClick, keepOpen }], size, dismissible, onClose })
       onClick が false を返したとき、または keepOpen のときは閉じません。 */
    const openModals = [];
    let modalSeq = 0;

    function modal(opts) {
        const o = Object.assign({ size: 'md', dismissible: true }, opts);
        const id = 'modal-title-' + (++modalSeq);
        const previousFocus = document.activeElement;
        const titleEl = h('h2', { class: 'modal__title', id, text: o.title || '' });
        const closeBtn = h('button', { class: 'icon-btn modal__close', type: 'button', 'aria-label': '閉じる',
            on: { click: () => ctrl.dismiss() } }, icon('close'));
        const body = h('div', { class: 'modal__body' });
        const foot = h('div', { class: 'modal__foot' });
        const dialog = h('div', { class: 'modal modal--' + o.size + (o.className ? ' ' + o.className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
            h('div', { class: 'modal__head' },
                h('div', { class: 'modal__titles' }, o.kicker ? h('p', { class: 'modal__kicker', text: o.kicker }) : null, titleEl),
                closeBtn),
            body, foot);
        const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
        backdrop.addEventListener('mousedown', (e) => {
            if (e.target === backdrop) ctrl.dismiss();
        });

        let dismissible = o.dismissible;
        let closed = false;
        const ctrl = {
            el: dialog,
            body,
            foot,
            close(result) {
                if (closed) return;
                closed = true;
                openModals.splice(openModals.indexOf(ctrl), 1);
                backdrop.classList.remove('is-in');
                setTimeout(() => backdrop.remove(), 200);
                if (!openModals.length) document.body.classList.remove('has-modal');
                if (previousFocus && previousFocus.focus && document.contains(previousFocus)) {
                    try { previousFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
                }
                if (o.onClose) o.onClose(result);
            },
            dismiss() {
                if (dismissible) ctrl.close(undefined);
            },
            setDismissible(on) {
                dismissible = !!on;
                closeBtn.hidden = !dismissible;
            },
            setTitle(text) {
                titleEl.textContent = text;
            },
            setBody(...nodes) {
                clear(body);
                append(body, nodes);
            },
            setActions(actions) {
                clear(foot);
                foot.hidden = !actions || !actions.length;
                (actions || []).forEach((a) => {
                    if (a.href !== undefined && !safeHref(a.href)) return;
                    const btn = a.href
                        ? h('a', { class: 'btn btn--' + (a.kind || 'secondary'), href: safeHref(a.href), target: '_blank', rel: 'noopener', text: a.label })
                        : h('button', { class: 'btn btn--' + (a.kind || 'secondary'), type: 'button', text: a.label, disabled: !!a.disabled });
                    if (a.id) btn.id = a.id;
                    if (a.icon) btn.insertBefore(icon(a.icon), btn.firstChild);
                    if (!a.href) {
                        btn.addEventListener('click', async () => {
                            const r = a.onClick ? await a.onClick(ctrl, btn) : undefined;
                            if (!a.keepOpen && r !== false) ctrl.close(r === undefined ? a.value : r);
                        });
                    }
                    foot.appendChild(btn);
                });
            },
            button(index) {
                return foot.children[index] || null;
            },
            isOpen() {
                return !closed;
            }
        };
        ctrl.setDismissible(dismissible);
        if (o.body) append(body, [o.body]);
        ctrl.setActions(o.actions);

        document.body.appendChild(backdrop);
        document.body.classList.add('has-modal');
        openModals.push(ctrl);
        requestAnimationFrame(() => backdrop.classList.add('is-in'));
        setTimeout(() => {
            const target = dialog.querySelector('[autofocus]') || dialog.querySelector('input:not([type=hidden]):not([disabled]), textarea, select') ||
                foot.querySelector('.btn--primary, .btn--danger') || closeBtn;
            try { target.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }, 30);
        return ctrl;
    }

    // Esc でいちばん上のダイアログを閉じる／Tab がダイアログの外に出ないようにする
    document.addEventListener('keydown', (e) => {
        const top = openModals[openModals.length - 1];
        if (!top) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            top.dismiss();
        } else if (e.key === 'Tab') {
            const focusables = Array.from(top.el.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'))
                .filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!top.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        }
    });

    // 確認ダイアログ → true / false
    function confirmDialog(opts) {
        const o = opts || {};
        return new Promise((resolve) => {
            const body = typeof o.message === 'string' ? h('p', { class: 'modal__text', text: o.message }) : o.message;
            modal({
                title: o.title || '確認',
                size: 'sm',
                body,
                actions: [
                    { label: o.cancel || 'やめる', kind: 'secondary', value: false },
                    { label: o.ok || 'OK', kind: o.danger ? 'danger' : 'primary', value: true }
                ],
                onClose: (result) => resolve(result === true)
            });
        });
    }

    /* ---------- 日付（日本時間） ---------- */
    const JST_PARTS = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });

    function jstParts(date) {
        const out = {};
        JST_PARTS.formatToParts(date).forEach((p) => { out[p.type] = p.value; });
        return out;
    }

    // '2026-10-17T03:04:05Z' → '2026/10/17 12:04'
    function formatJst(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return '';
        const p = jstParts(date);
        return p.year + '/' + p.month + '/' + p.day + ' ' + p.hour + ':' + p.minute;
    }

    // ファイル名用 → '20261017-120405'
    function jstStamp(date) {
        const p = jstParts(date || new Date());
        return p.year + p.month + p.day + '-' + p.hour + p.minute + p.second;
    }

    window.CMSUI = { h, append, clear, icon, spinner, safeHref, store, toast, modal, confirmDialog, formatJst, jstStamp };
}());
