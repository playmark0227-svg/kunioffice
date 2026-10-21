/* ============================================================
   KUNI OFFICE 管理画面 — ページの編集
   1ページ = 1つの PageEditor。プレビュー（iframe）の中で文章をそのまま
   書き換えたり、写真・一覧・実績を操作したりして、その変更を覚えておきます。
   公開するときは buildSource() で「元の HTML に最小限の書き換えをしたもの」を作ります。
   ============================================================ */
(function () {
    'use strict';

    const C = window.CMSCore;
    const { h, icon, toast, confirmDialog } = window.CMSUI;

    // プレビューの中だけに入れる編集用の見た目（レイアウトは変えない: outline / box-shadow のみ）
    const PREVIEW_CSS = `
html { scroll-behavior: auto !important; }
/* プレビューの端までスクロールしても、管理画面ごと引っぱって「再読み込み」にならないように */
html, body { overscroll-behavior-y: contain !important; }
[data-cms-text] { cursor: text; }
/* 空のままでよい文章（実績の説明など）: タップできる高さと「説明を追加」の目印 */
[data-cms-text][data-cms-empty] { min-height: 1.7em; }
[data-cms-text][data-cms-empty]:not([contenteditable])::before {
  content: attr(data-cms-empty); color: #cc0000; font-size: 13px; font-weight: 700; opacity: 0.8;
}
@media (hover: hover) {
  [data-cms-text]:hover { outline: 2px dashed rgba(204, 0, 0, 0.7) !important; outline-offset: 3px; }
  [data-cms-img]:hover { outline: 3px solid #cc0000 !important; outline-offset: -3px; }
  [data-cms-item]:hover { outline: 2px solid rgba(204, 0, 0, 0.35); outline-offset: 6px; }
}
html.cms-show [data-cms-text] { outline: 1px dashed rgba(204, 0, 0, 0.55); outline-offset: 3px; }
html.cms-show [data-cms-img] { outline: 2px dashed rgba(204, 0, 0, 0.6); outline-offset: -2px; }
[data-cms-img] { cursor: pointer; }
[data-cms-img]:focus-visible, [data-cms-img].cms-img-on { outline: 3px solid #cc0000 !important; outline-offset: -3px; }
[data-cms-text][contenteditable] {
  outline: 2px solid #cc0000 !important; outline-offset: 3px;
  background-color: rgba(255, 214, 0, 0.18) !important;
  caret-color: #cc0000; -webkit-user-select: text !important; user-select: text !important;
}
[data-cms-text][data-cms-changed]:not([contenteditable]) {
  text-decoration-line: underline !important; text-decoration-color: #f2b800 !important;
  text-decoration-thickness: 3px !important; text-underline-offset: 5px !important; text-decoration-skip-ink: none !important;
}
[data-cms-img][data-cms-changed] { outline: 3px solid #f2b800 !important; outline-offset: -3px; }
[data-cms-item].cms-active { outline: 2px solid #cc0000 !important; outline-offset: 6px; }
[data-cms-new] { box-shadow: 0 0 0 3px #f2b800; }
@keyframes cms-flash { from { box-shadow: 0 0 0 12px rgba(242, 184, 0, 0.9); } to { box-shadow: 0 0 0 3px #f2b800; } }
.cms-flash { animation: cms-flash 1.2s ease-out 1; }

.cms-layer div, .cms-layer span, .cms-layer button, .cms-layer select, .cms-layer option, .cms-layer label, .cms-layer strong {
  all: unset; box-sizing: border-box;
}
html .cms-layer {
  all: unset; position: absolute; top: 0; left: 0; width: 0; height: 0; display: block;
  z-index: 2147483000; pointer-events: none;
  font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', system-ui, sans-serif;
  font-size: 14px; line-height: 1.4; color: #111; -webkit-font-smoothing: antialiased; letter-spacing: 0;
}
html .cms-layer .cms-float { position: absolute; display: none; pointer-events: auto; white-space: nowrap; }
html .cms-layer .cms-float.is-on { display: flex; }
html .cms-layer svg { display: block; width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; }
html .cms-layer .cms-chip {
  align-items: center; gap: 8px; height: 46px; padding: 0 20px 0 16px; border-radius: 999px;
  background: #cc0000; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer;
  box-shadow: 0 10px 28px -8px rgba(0, 0, 0, 0.55), 0 0 0 2px #fff;
}
html .cms-layer .cms-chip:hover { background: #a80000; }
html .cms-layer .cms-chip:focus-visible { box-shadow: 0 0 0 3px #fff, 0 0 0 6px #cc0000; }
html .cms-layer .cms-bar {
  align-items: center; gap: 2px; padding: 4px; border-radius: 10px; background: #0b0b0b; color: #fff;
  box-shadow: 0 14px 30px -12px rgba(0, 0, 0, 0.6);
  /* 狭い画面では2段にして、右端の「削除」が画面の外に出ないように */
  /* （浮かぶ層は幅0なので、幅は中身に合わせて明示する） */
  flex-wrap: wrap; width: max-content; max-width: calc(100vw - 16px);
}
html .cms-layer .cms-b {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 40px; height: 40px;
  padding: 0 10px; border-radius: 7px; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer;
}
html .cms-layer .cms-b:hover { background: rgba(255, 255, 255, 0.14); }
html .cms-layer .cms-b:focus-visible { box-shadow: inset 0 0 0 2px #fff; }
html .cms-layer .cms-b[disabled] { opacity: 0.3; cursor: default; background: none; }
html .cms-layer .cms-b--danger { color: #ff9a9a; }
html .cms-layer .cms-sep { width: 1px; height: 24px; margin: 0 3px; background: rgba(255, 255, 255, 0.2); }
html .cms-layer .cms-selwrap {
  position: relative; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 8px 0 10px;
  border-radius: 7px; color: #fff; cursor: pointer;
}
html .cms-layer .cms-selwrap:hover { background: rgba(255, 255, 255, 0.14); }
html .cms-layer .cms-sel {
  position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px;
}
html .cms-layer .cms-sel option { color: #111; background: #fff; }
html .cms-layer .cms-selval { font-weight: 700; font-size: 13px; }
html .cms-layer .cms-tip {
  align-items: center; gap: 10px; width: max-content; max-width: min(340px, calc(100vw - 16px)); white-space: normal;
  padding: 8px 8px 8px 14px; border-radius: 10px; background: #fff; color: #111; font-size: 13px;
  box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.12);
}
html .cms-layer .cms-tip__text { display: block; line-height: 1.6; }
html .cms-layer .cms-tip__btn {
  display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 7px;
  background: #0b0b0b; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer; flex: none;
}
html .cms-layer .cms-tip__btn:hover { background: #cc0000; }
@media (pointer: coarse) {
  html .cms-layer .cms-b, html .cms-layer .cms-selwrap { min-width: 44px; height: 44px; }
  html .cms-layer .cms-tip__btn { height: 44px; }
}
`;

    let newKeySeq = 0;

    function elOf(node) {
        if (!node) return null;
        return node.nodeType === 1 ? node : node.parentElement;
    }

    function idOf(el) {
        const raw = el && el.getAttribute ? el.getAttribute('data-cms-id') : null;
        return raw !== null && /^[0-9]+$/.test(raw) ? Number(raw) : null;
    }

    function hasVisibleText(el) {
        return /[^\s ]/.test(el.textContent || '');
    }

    // HTML の空白（半角スペース・改行・タブ）だけをまとめる。全角スペース・&nbsp; はそのまま残す
    function collapse(text) {
        return String(text || '').replace(/[ \t\n\f\r]+/g, ' ').replace(/^ | $/g, '');
    }

    const EMPTY_LABEL = '＋ 説明を追加（タップして入力）';

    // 元のソースの開始タグから data-cms-* と id を除いたもの（新しい項目のひな形に使う）
    function cleanOpenTag(src, node) {
        let s = src.slice(node.start, node.openEnd);
        const cut = node.attrs.filter((a) => a.name.startsWith('data-cms-') || a.name === 'id');
        for (let k = cut.length - 1; k >= 0; k--) {
            let from = cut[k].start - node.start;
            while (from > 0 && /\s/.test(s[from - 1])) from--;
            s = s.slice(0, from) + s.slice(cut[k].end - node.start);
        }
        return s;
    }

    // {name} を値で置き換える（値はあらかじめエスケープ済み）。1回で置き換えるので値の中の {…} は残る
    function fillTemplate(template, values) {
        return template.replace(/\{([a-zA-Z]+)\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m));
    }

    function categoryLabel(cfg, value) {
        const found = (cfg.categories || []).find((c) => c.value === value);
        return found ? found.label : value;
    }

    class PageEditor {
        constructor(app, page, source, blobSha) {
            this.app = app;
            this.page = page;
            this.path = page.path;
            this.src = source;
            this.blobSha = blobSha;
            this.doc = C.parse(source);
            this.cls = C.classify(this.doc, { pagePath: this.path, collections: app.cfg.collections });
            this.lookup = (id) => this.doc.nodes[id];
            this.collections = new Map(this.cls.collections.map((c) => [c.id, c]));
            this.originalMeta = C.getPageMeta(source, this.doc);
            this.container = null;
            this.frame = null;
            this.fdoc = null;
            this.fwin = null;
            this.ready = false;
            this.visible = false;
            this.restoreY = 0;
            this.resetState();
        }

        resetState() {
            this.baseline = new Map();   // id → 読み込み直後の serializeInline
            this.textEdits = new Map();  // id → 新しい中身（baseline と違うものだけ）
            this.alts = new Map();       // img id → 新しい alt
            this.categories = new Map(); // 実績 id → 新しい分類
            this.orders = new Map();     // 一覧の id → { kind, type, original:[id], entries:[{id}|{key}] }
            this.newItems = new Map();   // key → 追加した項目
            this.meta = null;            // { title, description }（元と違うときだけ）
            this.editing = null;
            this.activeItem = null;
            this.hoverItem = null;
            this.chipImg = null;
            this.chipHow = 'center';
            this.chipPinned = false;
            this.barLock = null;
            this.imgPaths = new WeakMap();
        }

        get hasCollections() {
            return this.collections.size > 0;
        }

        /* ---------- プレビューの読み込み ---------- */

        mount(container) {
            this.container = container;
            this.load();
        }

        // iframe は毎回作り直す（前の文書と取り違えないように）
        load() {
            const old = this.frame;
            if (old && this.fwin) this.restoreY = this.fwin.scrollY || 0;
            this.ready = false;
            this.fdoc = null;
            this.fwin = null;
            const frame = h('iframe', { class: 'preview-frame', title: this.page.label + 'のプレビュー（クリックして編集できます）' });
            frame.hidden = !this.visible;
            this.frame = frame;
            if (old) old.replaceWith(frame);
            else this.container.appendChild(frame);
            const preview = this.previewSource();
            frame.srcdoc = C.buildPreview(preview.src, preview.doc, this.cls, {
                baseHref: this.app.pageUrl(this.path),
                headInject: '<style id="cms-edit-style">' + PREVIEW_CSS + '</style>'
            });
            const check = () => {
                if (this.frame !== frame || this.ready) return;
                const d = frame.contentDocument;
                if (d && d.URL === 'about:srcdoc' && d.readyState !== 'loading' && d.body) {
                    this.init(d);
                    return;
                }
                setTimeout(check, 30);
            };
            frame.addEventListener('load', check);
            setTimeout(check, 30);
        }

        // プレビュー用のソース。未公開・反映待ちの写真は最初から新しい写真の URL にしておく
        // （公開した直後は、新しい写真がまだサイトにないので、元の場所を読みに行くと 404 になる）。
        // 変えるのは属性の値だけなので、要素の番号（data-cms-id）は元のソースと同じ。
        previewSource() {
            const attrs = {};
            for (const id of this.doc.byTag.img || []) {
                const repoPath = C.resolvePath(this.path, C.getAttr(this.doc.nodes[id], 'src'));
                const url = repoPath ? this.app.imageUrlFor(repoPath) : null;
                if (url) attrs[id] = { src: url };
            }
            if (!Object.keys(attrs).length) return { src: this.src, doc: this.doc };
            const src = C.applyEdits(this.src, this.doc, { attrs });
            return { src, doc: C.parse(src) };
        }

        reload() {
            this.hideFloats();
            this.resetState();
            this.load();
        }

        destroy() {
            if (this.frame) this.frame.remove();
            this.frame = null;
            this.ready = false;
        }

        init(d) {
            this.fdoc = d;
            this.fwin = d.defaultView;
            this.ready = true;
            d.documentElement.classList.toggle('cms-show', !!this.app.showTargets);
            // 開閉する部分（よくある質問など）は開いたままにして、中の文章も編集できるようにする
            d.querySelectorAll('details').forEach((el) => { el.open = true; });
            // リンクや写真をドラッグすると文字を選べないので、ドラッグを止める
            d.querySelectorAll('a[href], img').forEach((el) => el.setAttribute('draggable', 'false'));
            d.querySelectorAll('[data-cms-img]').forEach((el) => {
                el.setAttribute('tabindex', '0');
                el.setAttribute('role', 'button');
                el.setAttribute('aria-label', '写真を変更: ' + (el.getAttribute('alt') || ''));
            });
            d.querySelectorAll('[data-cms-text]').forEach((el) => {
                const id = idOf(el);
                if (id !== null) this.baseline.set(id, C.serializeInline(el, this.lookup));
                this.markEmpty(el);
            });
            for (const id of this.cls.lists) {
                const kids = this.doc.nodes[id].children;
                this.orders.set(id, { kind: 'list', original: kids.slice(), entries: kids.map((c) => ({ id: c })) });
            }
            for (const c of this.cls.collections) {
                this.orders.set(c.id, { kind: 'collection', type: c.type, original: c.items.slice(), entries: c.items.map((id) => ({ id })) });
            }
            this.buildLayer();
            this.bindEvents();
            this.app.applyImagesTo(this);
            if (this.restoreY) {
                const y = this.restoreY;
                this.fwin.scrollTo(0, y);
                this.fwin.addEventListener('load', () => this.fwin && this.fwin.scrollTo(0, y), { once: true });
            }
            this.app.onEditorReady(this);
        }

        setVisible(on) {
            this.visible = on;
            if (this.frame) this.frame.hidden = !on;
            if (!on) {
                this.stopEditing();
                this.hideFloats();
            }
        }

        setShowTargets(on) {
            if (this.fdoc) this.fdoc.documentElement.classList.toggle('cms-show', !!on);
        }

        byId(id) {
            return this.fdoc ? this.fdoc.querySelector('[data-cms-id="' + id + '"]') : null;
        }

        isAlive(id) {
            return !!this.byId(id);
        }

        /* ---------- 編集用の浮かぶボタン（プレビューの中に重ねる） ---------- */

        buildLayer() {
            const d = this.fdoc;
            const H = (tag, props, ...kids) => h(tag, Object.assign({ doc: d }, props), ...kids);
            const keepFocus = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());
            const button = (cls, label, iconName, onClick, showText) => {
                const b = H('button', { class: cls, type: 'button', title: label, 'aria-label': label },
                    iconName ? icon(iconName, d) : null, showText ? H('span', { text: label }) : null);
                keepFocus(b);
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                });
                return b;
            };

            this.layer = H('div', { class: 'cms-layer' });

            // 写真の上に出す「写真を変更」
            this.chip = button('cms-float cms-chip', '写真を変更', 'camera', () => {
                if (this.chipImg) this.openImage(this.chipImg);
            }, true);

            // 一覧（箇条書き）の項目を編集中に出すバー
            this.listBtns = {
                add: button('cms-b', '下に追加', 'plus', () => this.addListItemAfter(this.editing), true),
                up: button('cms-b', '上へ', 'up', () => this.moveEntry(this.editing, -1)),
                down: button('cms-b', '下へ', 'down', () => this.moveEntry(this.editing, 1)),
                del: button('cms-b cms-b--danger', '削除', 'trash', () => this.removeEntry(this.editing))
            };
            this.listBar = H('div', { class: 'cms-float cms-bar', role: 'toolbar', 'aria-label': '項目の操作' },
                this.listBtns.add, H('span', { class: 'cms-sep' }), this.listBtns.up, this.listBtns.down, this.listBtns.del);

            // 実績などのまとまりに出すバー
            this.catValue = H('span', { class: 'cms-selval' });
            this.catSelect = H('select', { class: 'cms-sel', 'aria-label': '分類' });
            this.catSelect.addEventListener('change', () => {
                if (this.barItem) this.setCategory(this.barItem, this.catSelect.value);
            });
            this.catWrap = H('label', { class: 'cms-selwrap', title: '分類を変える' }, icon('tag', d), this.catValue, icon('down', d), this.catSelect);
            this.itemBtns = {
                photo: button('cms-b', '写真', 'camera', () => {
                    const img = this.barItem && this.itemImage(this.barItem);
                    if (img) this.openImage(img);
                }, true),
                up: button('cms-b', '前へ', 'up', () => this.moveEntry(this.barItem, -1)),
                down: button('cms-b', '後ろへ', 'down', () => this.moveEntry(this.barItem, 1)),
                del: button('cms-b cms-b--danger', '削除', 'trash', () => this.removeEntry(this.barItem))
            };
            this.itemBar = H('div', { class: 'cms-float cms-bar', role: 'toolbar', 'aria-label': '実績の操作' },
                this.itemBtns.photo, this.catWrap, H('span', { class: 'cms-sep' }), this.itemBtns.up, this.itemBtns.down, this.itemBtns.del);

            // リンクや変更できない部分の説明
            this.tipText = H('span', { class: 'cms-tip__text' });
            this.tipBtn = H('button', { class: 'cms-tip__btn', type: 'button' });
            this.tipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const go = this.tipAction;
                this.hideTip();
                if (go) go();
            });
            this.tip = H('div', { class: 'cms-float cms-tip', role: 'status' }, this.tipText, this.tipBtn);

            this.layer.append(this.chip, this.listBar, this.itemBar, this.tip);
            d.documentElement.appendChild(this.layer);
        }

        // 浮かぶ要素を、ページ上の要素の位置に合わせて置く（文書の座標なのでスクロールしてもずれない）
        place(float, anchor, how) {
            if (!anchor || !anchor.isConnected || !this.fwin) {
                float.classList.remove('is-on');
                return;
            }
            float.classList.add('is-on');
            const r = anchor.getBoundingClientRect();
            const sx = this.fwin.scrollX;
            const sy = this.fwin.scrollY;
            const vw = this.fdoc.documentElement.clientWidth;
            const w = float.offsetWidth;
            const fh = float.offsetHeight;
            const topLimit = this.stickyTop() + 6; // サイトの固定ヘッダーに隠れないように
            let left;
            let top;
            if (how === 'center') {
                // 写真の「見えている部分」の真ん中に置く
                const vh = this.fwin.innerHeight;
                const visTop = Math.max(r.top, topLimit);
                const visBottom = Math.min(r.bottom, vh);
                const mid = visBottom > visTop ? (visTop + visBottom) / 2 : r.top + r.height / 2;
                left = r.left + r.width / 2 - w / 2;
                top = mid - fh / 2;
            } else if (how === 'inside-top') {
                left = r.right - w - 10;
                top = r.top + 10;
                if (top < topLimit) top = Math.max(r.top + 10, Math.min(topLimit, r.bottom - fh - 10));
            } else if (how === 'above') {
                left = r.left;
                top = r.top - fh - 10;
                if (top < topLimit) top = r.bottom + 10;
            } else { // below
                left = r.left;
                top = r.bottom + 8;
            }
            left = Math.max(8, Math.min(left, vw - w - 8));
            float.style.left = Math.round(left + sx) + 'px';
            float.style.top = Math.round(top + sy) + 'px';
        }

        // 画面の上に固定されている要素（サイトのヘッダー）の下端
        stickyTop() {
            const w = this.fwin;
            const seen = new Set();
            let bottom = 0;
            for (const x of [w.innerWidth / 2, 12]) {
                for (const hit of this.fdoc.elementsFromPoint(x, 2)) {
                    for (let n = hit; n && n.nodeType === 1 && n !== this.fdoc.body && !seen.has(n); n = n.parentElement) {
                        seen.add(n);
                        const pos = w.getComputedStyle(n).position;
                        if (pos !== 'fixed' && pos !== 'sticky') continue;
                        const r = n.getBoundingClientRect();
                        if (r.top <= 2 && r.bottom < w.innerHeight / 2) bottom = Math.max(bottom, r.bottom);
                    }
                }
            }
            return bottom;
        }

        reposition() {
            if (!this.ready) return;
            if (this.chip.classList.contains('is-on')) this.place(this.chip, this.chipImg, this.chipHow);
            if (this.listBar.classList.contains('is-on')) this.place(this.listBar, this.editing, 'above');
            if (this.itemBar.classList.contains('is-on')) this.place(this.itemBar, this.barItem, 'inside-top');
            if (this.tip.classList.contains('is-on')) this.place(this.tip, this.tipAnchor, 'below');
        }

        hideFloats() {
            if (!this.layer) return;
            this.hideImageChip(true);
            this.hideTip();
            this.listBar.classList.remove('is-on');
            this.setActiveItem(null);
            this.itemBar.classList.remove('is-on');
        }

        // covered: 写真の上に文字などが重なっているので、真ん中ではなく右上に出す（文字をふさがないように）
        showImageChip(img, pin, covered) {
            if (this.chipImg && this.chipImg !== img) this.chipImg.classList.remove('cms-img-on');
            this.chipImg = img;
            this.chipHow = covered ? 'inside-top' : 'center';
            if (pin) this.chipPinned = true;
            img.classList.toggle('cms-img-on', !!covered);
            this.place(this.chip, img, this.chipHow);
        }

        hideImageChip(force) {
            if (this.chipPinned && !force) return;
            if (this.chipImg) this.chipImg.classList.remove('cms-img-on');
            this.chipPinned = false;
            this.chipImg = null;
            this.chip.classList.remove('is-on');
        }

        // 指の下の写真。グラデーションの飾り・リンクの枠・再生ボタンなどが上に重なっていても下の写真を選ぶ
        // （ホームの大きな写真や実績のタイルは、写真の上に飾りが重なっている）。
        // 文字・変更できない部分・ページ本文の外（サイトの固定ヘッダーなど）が上にあれば、そちらが優先。
        imageAt(t, x, y) {
            const direct = t.closest('[data-cms-img]');
            if (direct) return { img: direct, covered: false };
            if (typeof x !== 'number' || !this.fdoc.elementsFromPoint) return null;
            for (const el of this.fdoc.elementsFromPoint(x, y)) {
                if (el.matches('[data-cms-img]')) return { img: el, covered: true };
                if (!el.closest('main') || el.matches('[data-cms-text], [data-cms-lock]')) return null;
            }
            return null;
        }

        showTip(anchor, text, buttonLabel, action) {
            this.tipAnchor = anchor;
            this.tipText.textContent = text;
            this.tipBtn.textContent = buttonLabel || '';
            this.tipBtn.style.display = buttonLabel ? '' : 'none';
            this.tipAction = action || null;
            this.place(this.tip, anchor, 'below');
        }

        hideTip() {
            if (!this.tip) return;
            this.tip.classList.remove('is-on');
            this.tipAnchor = null;
            this.tipAction = null;
        }

        /* ---------- イベント ---------- */

        bindEvents() {
            const d = this.fdoc;
            const on = (type, fn) => d.addEventListener(type, fn, true);
            on('pointerdown', (e) => {
                this.lastPointer = e.pointerType || 'mouse';
                this.lastDown = { x: e.clientX, y: e.clientY };
            });
            // 並べ替えたあとは、マウスを動かすまでバーをその項目に付けたままにする
            on('pointermove', (e) => {
                // 指で操作したあとは、マウスを実際に動かすまでマウスの位置（画面の動きで出る見かけの移動）を使わない
                if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) this.lastPointer = 'mouse';
                if (this.barLock && Math.hypot(e.clientX - this.barLock.x, e.clientY - this.barLock.y) > 6) {
                    this.barLock = null;
                    this.onPointerOver(e); // いまマウスの下にある項目にバーを移す
                }
            });
            on('click', (e) => this.onClick(e));
            on('auxclick', (e) => { if (elOf(e.target) && elOf(e.target).closest('a')) e.preventDefault(); });
            on('submit', (e) => e.preventDefault());
            on('keydown', (e) => this.onKeyDown(e));
            on('beforeinput', (e) => this.onBeforeInput(e));
            on('input', () => this.scheduleUpdate());
            on('paste', (e) => this.onPaste(e));
            on('dragover', (e) => e.preventDefault()); // ファイルを落としてもページが切り替わらないように
            on('drop', (e) => this.onDrop(e));
            on('focusout', (e) => this.onFocusOut(e));
            on('focusin', (e) => this.onFocusIn(e));
            on('pointerover', (e) => this.onPointerOver(e));
            on('toggle', (e) => {
                if (e.target && e.target.tagName === 'DETAILS' && !e.target.open) e.target.open = true;
            });
            let frame = 0;
            const soon = () => {
                if (!frame) frame = requestAnimationFrame(() => { frame = 0; this.reposition(); });
            };
            this.fwin.addEventListener('resize', soon);
            this.fwin.addEventListener('scroll', soon, { passive: true });
            this.fwin.addEventListener('load', soon);
        }

        onClick(e) {
            const t = elOf(e.target);
            if (!t || (this.layer && this.layer.contains(t))) return;
            const link = t.closest('a[href], area[href]');
            if (link) e.preventDefault(); // 編集画面ではページを移動しない
            if (t.closest('summary')) e.preventDefault();
            const text = t.closest('[data-cms-text]');
            const hit = text ? null : this.imageAt(t, e.clientX, e.clientY);
            const img = hit && hit.img;
            // 指でタップした項目を優先する（マウスが別の項目の上に残っていても、そちらにバーを出さない）
            if (this.lastPointer !== 'mouse' && this.hoverItem) {
                this.hoverItem = null;
                this.updateItemBar();
            }
            this.setActiveItem(t.closest('[data-cms-item]') || (img && img.closest('[data-cms-item]')));

            if (text) {
                this.hideTip();
                this.hideImageChip(true);
                this.startEditing(text, e.clientX, e.clientY);
                // 電話番号・メールのリンクは、見える文字を変えてもリンク先（tel: / mailto:）は変わらない
                const contact = t.closest('a[href^="tel:"], a[href^="mailto:"]');
                if (contact && text.contains(contact)) {
                    this.showTip(contact, '電話番号・メールアドレスは「≡ → 共通情報」で変えると、リンク先もサイト全体も一緒に変わります。');
                }
                return;
            }
            if (img) {
                this.hideTip();
                if (this.lastPointer === 'mouse' && e.detail > 0) this.openImage(img);
                else this.showImageChip(img, true, hit.covered);
                return;
            }
            this.hideImageChip(true);
            const locked = t.closest('[data-cms-lock]');
            if (locked && t.closest('main')) {
                const item = locked.closest('[data-cms-item]');
                const root = item && this.rootOf(item);
                const cfg = root && this.collectionCfg(root.id);
                if (cfg && cfg.categoryLabelSelector && locked.matches(cfg.categoryLabelSelector)) {
                    this.showTip(locked, '分類は、上に出ているバーの「分類」で変えられます。');
                } else {
                    this.showTip(locked, 'ここ（価格など）は、この画面では変更できません。変更が必要なときはViFightにご連絡ください。');
                }
                return;
            }
            if (link) {
                const target = this.app.editablePageFor(this.path, link.getAttribute('href'));
                if (target && target.path !== this.path) {
                    this.showTip(link, '「' + target.label + '」へのリンクです。', 'このページを編集する', () => this.app.switchPage(target.path));
                    return;
                }
            }
            // サイトのメニューのボタン（スマホの ≡）は、編集画面では開かない
            const siteButton = !t.closest('main') && t.closest('header button, nav button, header [role="button"]');
            if (siteButton) {
                this.showTip(siteButton, 'これはサイトのメニューです（編集画面では開きません）。ほかのページを編集するときは、いちばん上の欄でページを選んでください。');
                return;
            }
            this.hideTip();
        }

        onPointerOver(e) {
            if (e.pointerType === 'touch' || this.barLock || this.lastPointer === 'touch') return;
            const t = elOf(e.target);
            if (!t || (this.layer && this.layer.contains(t))) return;
            const hit = t.closest('[data-cms-text]') ? null : this.imageAt(t, e.clientX, e.clientY);
            if (hit) this.showImageChip(hit.img, false, hit.covered);
            else this.hideImageChip();
            const item = t.closest('[data-cms-item]');
            this.hoverItem = item;
            this.updateItemBar();
        }

        // キーボードで写真に移ったときも「写真を変更」を出す
        onFocusIn(e) {
            const t = elOf(e.target);
            if (!t || !t.matches) return;
            if (t.matches('[data-cms-img]') && t.matches(':focus-visible')) this.showImageChip(t, true);
            const item = t.closest('[data-cms-item]');
            if (item) this.setActiveItem(item);
        }

        onFocusOut(e) {
            const t = elOf(e.target);
            if (t && t.matches && t.matches('[data-cms-img]') && e.relatedTarget !== this.chip) this.hideImageChip(true);
            const host = this.editing;
            if (!host || e.target !== host) return;
            const next = e.relatedTarget;
            if (next && (host.contains(next) || (this.layer && this.layer.contains(next)))) return;
            this.stopEditing();
        }

        onKeyDown(e) {
            const t = elOf(e.target);
            const host = this.editing;
            if (host && t && host.contains(t)) {
                // 太字・斜体・下線のショートカットは使わない
                if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[biu]$/i.test(e.key)) e.preventDefault();
                // よくある質問の見出し（summary）では Space・Enter が「開く・閉じる」に使われて文字が入らないので、自分で入れる
                const typing = !e.isComposing && e.keyCode !== 229 && !e.ctrlKey && !e.metaKey && !e.altKey;
                if (typing && (e.key === ' ' || e.key === 'Enter') && t.closest('summary')) {
                    e.preventDefault();
                    if (e.key === 'Enter') this.insertBreak();
                    else this.insertText(' ');
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    host.blur();
                }
                return;
            }
            if ((e.key === 'Enter' || e.key === ' ') && t && t.matches && t.matches('[data-cms-img]')) {
                e.preventDefault();
                this.openImage(t);
            }
        }

        // Enter は <br>、書式の変更はさせない、貼り付けは文字だけ
        onBeforeInput(e) {
            const host = this.editing;
            const t = elOf(e.target);
            if (!host || !t || !host.contains(t) || this.inExec) return;
            const type = e.inputType || '';
            if (type === 'insertParagraph' || type === 'insertLineBreak') {
                e.preventDefault();
                this.insertBreak();
            } else if (/^format/.test(type) || /^insert(Ordered|Unordered)List$|^insertHorizontalRule$|^insertLink$/.test(type)) {
                e.preventDefault();
            } else if (type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertFromPasteAsQuotation') {
                e.preventDefault();
                const text = e.dataTransfer ? e.dataTransfer.getData('text/plain') : e.data;
                if (text) this.insertText(text);
            }
        }

        onPaste(e) {
            const host = this.editing;
            const t = elOf(e.target);
            if (!host || !t || !host.contains(t)) return;
            e.preventDefault();
            const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
            if (text) this.insertText(text);
        }

        onDrop(e) {
            e.preventDefault();
            const t = elOf(e.target);
            const dt = e.dataTransfer;
            if (!t || !dt) return;
            if (dt.files && dt.files.length) {
                const hit = t.closest('[data-cms-text]') ? null : this.imageAt(t, e.clientX, e.clientY);
                if (hit) this.openImage(hit.img, dt.files[0]);
                return;
            }
            const host = this.editing;
            if (host && host.contains(t)) {
                const range = this.rangeFromPoint(e.clientX, e.clientY);
                if (range && host.contains(range.startContainer)) this.select(range);
                const text = dt.getData('text/plain');
                if (text) this.insertText(text);
            }
        }

        /* ---------- 文章の編集 ---------- */

        startEditing(el, x, y) {
            if (!el || this.editing === el) return;
            this.stopEditing();
            this.editing = el;
            this.editStartHtml = el.innerHTML; // 空にされたら元に戻すため（この iframe 自身の DOM の内容）
            el.setAttribute('contenteditable', 'true');
            el.setAttribute('spellcheck', 'false');
            try {
                el.focus({ preventScroll: true });
            } catch (err) {
                el.focus();
            }
            let range = x !== undefined ? this.rangeFromPoint(x, y) : null;
            if (!range || !el.contains(range.startContainer)) {
                range = this.fdoc.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
            }
            this.select(range);
            this.updateListBar();
            this.app.onEditing(this, el);
            if (this.lastPointer === 'touch') this.revealOnKeyboard(el);
        }

        // iPhone では focus({ preventScroll }) のため、キーボードが出ても書き換え中の文字が下に隠れたままになる
        // （iOS が自分でスクロールしない）。キーボードで狭くなった表示（visualViewport）に合わせて、プレビューを動かす。
        revealOnKeyboard(el) {
            const vv = window.visualViewport;
            if (!vv) return;
            const run = () => {
                if (this.editing === el) this.revealEditing();
            };
            vv.addEventListener('resize', run, { once: true });
            setTimeout(run, 650); // キーボードが出終わったころ（resize が来ないブラウザ向け）
        }

        revealEditing() {
            const el = this.editing;
            const vv = window.visualViewport;
            if (!el || !vv || !this.fwin || !this.frame) return;
            const frameRect = this.frame.getBoundingClientRect();
            // プレビューの中の座標で、キーボードに隠れずに見えている下端
            const limit = Math.min(vv.offsetTop + vv.height, frameRect.bottom) - frameRect.top - 12;
            const range = this.currentRange();
            let r = range ? range.getBoundingClientRect() : null;
            if (!r || (!r.top && !r.bottom)) r = el.getBoundingClientRect();
            if (r.bottom <= limit) return;
            const top = this.stickyTop() + 8;
            const elTop = el.getBoundingClientRect().top;
            // 下端が見えるところまで。ただし書き換え中の文章の上端がサイトのヘッダーに隠れない範囲で
            const by = Math.min(r.bottom - limit, Math.max(0, Math.max(r.top, elTop) - top));
            if (by > 0) this.fwin.scrollBy(0, by);
        }

        stopEditing() {
            const el = this.editing;
            if (!el) return;
            this.editing = null;
            el.removeAttribute('contenteditable');
            el.removeAttribute('spellcheck');
            clearTimeout(this.updateTimer);
            const newKey = el.getAttribute('data-cms-new');
            if (!hasVisibleText(el)) {
                const root = newKey && this.newItems.has(newKey) && this.newItems.get(newKey).kind === 'li' ? this.rootOf(el) : null;
                if (root && root.order.entries.length > 1) {
                    this.dropEntry(el); // 追加しただけで空のままの項目は消す
                } else if (!root && this.isOptionalText(el)) {
                    el.textContent = ''; // 実績の説明などは空でもよい（あとからまた書き込める）
                } else {
                    // 一覧の最後の1つ（ほかの項目はすべて削除した）も、空にして消すことはできない
                    el.innerHTML = this.editStartHtml;
                    toast(root ? '最後の1つは消せません。元の文字に戻しました。' : '文字をすべて消すことはできません。元の文章に戻しました。', { type: 'error' });
                }
            }
            if (el.isConnected) this.markEmpty(el);
            this.updateText(el);
            if (this.listBar) this.listBar.classList.remove('is-on');
            if (this.tipAnchor && el.contains(this.tipAnchor)) this.hideTip();
            try {
                const sel = this.fwin.getSelection();
                if (sel && sel.rangeCount && el.contains(sel.anchorNode)) sel.removeAllRanges();
            } catch (err) { /* ignore */ }
            this.app.onEditing(this, null);
        }

        rangeFromPoint(x, y) {
            const d = this.fdoc;
            if (d.caretPositionFromPoint) {
                const p = d.caretPositionFromPoint(x, y);
                if (!p || !p.offsetNode) return null;
                const r = d.createRange();
                r.setStart(p.offsetNode, p.offset);
                r.collapse(true);
                return r;
            }
            return d.caretRangeFromPoint ? d.caretRangeFromPoint(x, y) : null;
        }

        select(range) {
            const sel = this.fwin.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        currentRange() {
            const sel = this.fwin.getSelection();
            if (!sel || !sel.rangeCount || !this.editing) return null;
            const range = sel.getRangeAt(0);
            return this.editing.contains(range.commonAncestorContainer) ? range : null;
        }

        // 後ろに見える文字がないか（行末で改行したときは、カーソル用の <br> がもう1つ要る）
        isAtEnd(node) {
            for (let n = node; n && n !== this.editing; n = n.parentNode) {
                for (let s = n.nextSibling; s; s = s.nextSibling) {
                    if (s.nodeType === 1) return false;
                    if (s.nodeType === 3 && /[^ \t\n\r\f]/.test(s.nodeValue)) return false;
                }
            }
            return true;
        }

        // ブラウザの編集コマンドで入れる（Ctrl+Z で元に戻せるように）。使えなければ false
        exec(command, value) {
            this.inExec = true; // コマンドが beforeinput を出すブラウザでも、ここへ戻ってこないように
            try {
                return this.fdoc.queryCommandSupported(command) && this.fdoc.execCommand(command, false, value);
            } catch (err) {
                return false;
            } finally {
                this.inExec = false;
            }
        }

        insertBreak() {
            const range = this.currentRange();
            if (!range) return;
            if (!this.exec('insertLineBreak')) {
                range.deleteContents();
                const br = this.fdoc.createElement('br');
                range.insertNode(br);
                if (this.isAtEnd(br)) br.parentNode.insertBefore(this.fdoc.createElement('br'), br.nextSibling);
                range.setStartAfter(br);
                range.collapse(true);
                this.select(range);
            }
            this.scheduleUpdate();
        }

        // 貼り付け・ドロップした文字を、書式なしで入れる（改行は <br>）
        insertText(text) {
            const range = this.currentRange();
            if (!range) return;
            const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
            if (!lines.join('') && lines.length === 1) return;
            const done = lines.length === 1
                ? this.exec('insertText', lines[0])
                : this.exec('insertHTML', lines.map((line) => C.escapeText(line)).join('<br>'));
            if (!done) {
                range.deleteContents();
                const frag = this.fdoc.createDocumentFragment();
                let last = null;
                lines.forEach((line, i) => {
                    if (i) frag.appendChild(last = this.fdoc.createElement('br'));
                    if (line) frag.appendChild(last = this.fdoc.createTextNode(line));
                });
                range.insertNode(frag);
                if (last.nodeName === 'BR' && this.isAtEnd(last)) last.parentNode.insertBefore(this.fdoc.createElement('br'), last.nextSibling);
                range.setStartAfter(last);
                range.collapse(true);
                this.select(range);
            }
            this.scheduleUpdate();
        }

        scheduleUpdate() {
            clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => {
                if (this.editing) this.updateText(this.editing);
                this.reposition();
            }, 250);
        }

        // 変わったかどうかを、読み込み直後の中身（baseline）と比べて記録する
        updateText(el) {
            const id = idOf(el);
            if (id === null) {
                this.app.changed(this);
                return;
            }
            const html = C.serializeInline(el, this.lookup);
            if (html !== this.baseline.get(id)) {
                this.textEdits.set(id, html);
                el.setAttribute('data-cms-changed', '');
            } else {
                this.textEdits.delete(id);
                el.removeAttribute('data-cms-changed');
            }
            this.app.changed(this);
        }

        // 空のままでよい文章か（実績の説明。追加したばかりの実績の説明も）
        isOptionalText(el) {
            const id = idOf(el);
            if (id !== null && this.cls.optional && this.cls.optional.has(id)) return true;
            const item = this.newItemOf(el);
            return !!(item && item.kind === 'collection' && item.descEl === el);
        }

        // 空の「説明」に目印（「＋ 説明を追加」）を出す
        markEmpty(el) {
            if (!hasVisibleText(el) && this.isOptionalText(el)) el.setAttribute('data-cms-empty', EMPTY_LABEL);
            else el.removeAttribute('data-cms-empty');
        }

        /* ---------- 写真 ---------- */

        repoPathOf(img) {
            if (this.imgPaths.has(img)) return this.imgPaths.get(img);
            const id = idOf(img);
            const path = id === null ? null : C.resolvePath(this.path, C.getAttr(this.doc.nodes[id], 'src'));
            this.imgPaths.set(img, path);
            return path;
        }

        originalSrc(img) {
            const id = idOf(img);
            return id === null ? null : C.getAttr(this.doc.nodes[id], 'src');
        }

        // repoPath の写真を url（未公開の写真）に差し替える。url が null なら元に戻す
        applyImage(repoPath, url, pending) {
            if (!this.ready) return;
            this.fdoc.querySelectorAll('img').forEach((img) => {
                if (this.repoPathOf(img) !== repoPath) return;
                if (url) {
                    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
                    img.removeAttribute('srcset');
                } else {
                    const orig = this.originalSrc(img);
                    if (orig !== null) img.setAttribute('src', orig);
                }
                if (pending && img.hasAttribute('data-cms-img')) img.setAttribute('data-cms-changed', '');
                else img.removeAttribute('data-cms-changed');
            });
            setTimeout(() => this.reposition(), 50);
        }

        openImage(img, file) {
            const id = idOf(img);
            const repoPath = this.repoPathOf(img);
            if (!repoPath) return;
            this.hideImageChip(true);
            const newItem = this.newItemOf(img);
            const currentAlt = id !== null && this.alts.has(id) ? this.alts.get(id) : (img.getAttribute('alt') || '');
            this.app.openImageDialog({
                editor: this,
                repoPath,
                currentUrl: img.currentSrc || img.src,
                alt: currentAlt,
                altEditable: !newItem,
                file,
                onAlt: (alt) => this.setAlt(img, alt)
            });
        }

        setAlt(img, alt) {
            const id = idOf(img);
            if (id === null) return;
            const orig = C.getAttr(this.doc.nodes[id], 'alt');
            if (alt === (orig === null ? '' : orig) || (orig === null && alt === '')) this.alts.delete(id);
            else this.alts.set(id, alt);
            img.setAttribute('alt', alt);
            this.app.changed(this);
        }

        /* ---------- 一覧（箇条書き・実績）の追加・移動・削除 ---------- */

        rootOf(el) {
            const root = el && el.parentElement;
            if (!root) return null;
            const id = idOf(root);
            return id !== null && this.orders.has(id) ? { el: root, id, order: this.orders.get(id) } : null;
        }

        entryIndex(order, el) {
            const id = idOf(el);
            const key = el.getAttribute('data-cms-new');
            return order.entries.findIndex((e) => (key ? e.key === key : e.id === id));
        }

        elementOf(entry) {
            return entry.key ? (this.newItems.get(entry.key) || {}).el || null : this.byId(entry.id);
        }

        newItemOf(el) {
            const holder = el && el.closest('[data-cms-new]');
            return holder ? this.newItems.get(holder.getAttribute('data-cms-new')) || null : null;
        }

        updateListBar() {
            const el = this.editing;
            const root = el && el.tagName === 'LI' ? this.rootOf(el) : null;
            if (!root || root.order.kind !== 'list') {
                this.listBar.classList.remove('is-on');
                return;
            }
            const i = this.entryIndex(root.order, el);
            this.listBtns.up.disabled = i <= 0;
            this.listBtns.down.disabled = i >= root.order.entries.length - 1;
            this.listBtns.del.disabled = root.order.entries.length <= 1;
            this.place(this.listBar, el, 'above');
        }

        addListItemAfter(li) {
            const root = this.rootOf(li);
            if (!root) return;
            const order = root.order;
            const i = this.entryIndex(order, li);
            const refNode = idOf(li) !== null ? this.doc.nodes[idOf(li)] : this.doc.nodes[order.original[0]];
            const key = 'n' + (++newKeySeq);
            const el = this.fdoc.createElement('li');
            refNode.attrs.forEach((a) => {
                if (!a.name.startsWith('data-cms-') && a.name !== 'id' && !a.name.startsWith('on')) el.setAttribute(a.name, a.value);
            });
            el.setAttribute('data-cms-text', '');
            el.setAttribute('data-cms-new', key);
            el.textContent = '新しい項目';
            root.el.insertBefore(el, li.nextSibling);
            order.entries.splice(i + 1, 0, { key });
            this.newItems.set(key, { kind: 'li', el, rootId: root.id, openTag: cleanOpenTag(this.src, refNode), closeTag: '</li>' });
            this.stopEditing();
            this.startEditing(el);
            const range = this.fdoc.createRange();
            range.selectNodeContents(el); // そのまま打てば置き換わるように全体を選んでおく
            this.select(range);
            this.app.changed(this);
        }

        moveEntry(el, delta) {
            const root = el && this.rootOf(el);
            if (!root) return;
            const entries = root.order.entries;
            const i = this.entryIndex(root.order, el);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= entries.length) return;
            const other = this.elementOf(entries[j]);
            const wasEditing = this.editing && el.contains(this.editing) ? this.editing : null;
            if (wasEditing) this.stopEditing();
            [entries[i], entries[j]] = [entries[j], entries[i]];
            if (delta < 0) root.el.insertBefore(el, other);
            else root.el.insertBefore(el, other.nextSibling);
            if (root.order.kind === 'collection') {
                // 動いた項目がマウスの下からずれても、続けて「前へ」「後ろへ」を押せるように
                this.hoverItem = el;
                this.setActiveItem(el);
                if (this.lastPointer === 'mouse' && this.lastDown) this.barLock = { x: this.lastDown.x, y: this.lastDown.y };
            }
            if (wasEditing) this.startEditing(wasEditing);
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            this.app.changed(this);
            setTimeout(() => {
                this.updateItemBar();
                this.updateListBar();
                this.reposition();
            }, 30);
        }

        async removeEntry(el) {
            const root = el && this.rootOf(el);
            if (!root) return;
            const isItem = root.order.kind === 'collection';
            if (!isItem && root.order.entries.length <= 1) {
                toast('最後の1つは削除できません。', { type: 'error' });
                return;
            }
            const title = isItem ? collapse((this.itemTitle(el) || {}).textContent) : collapse(el.textContent);
            const short = title.length > 40 ? title.slice(0, 40) + '…' : title;
            const editingEl = this.editing;
            if (editingEl) this.stopEditing();
            const others = isItem ? await this.otherPagesWithPhoto(el) : [];
            const ok = await confirmDialog({
                title: isItem ? 'この実績を削除しますか？' : 'この項目を削除しますか？',
                message: h('div', null,
                    h('p', { class: 'modal__text', text: '「' + short + '」を削除します。「公開する」を押すまでサイトには反映されません。' }),
                    others.length ? h('p', { class: 'modal__text', style: { marginTop: '10px' },
                        text: 'この実績の写真は「' + others.join('」「') + '」のページにも出ています。そちらは自動では消えないので、必要ならそのページを開いて、写真や文字をタップして変えてください。' }) : null),
                ok: '削除する',
                danger: true
            });
            if (!ok) {
                if (editingEl && editingEl.isConnected) this.startEditing(editingEl);
                return;
            }
            const root2 = this.rootOf(el);
            const index = root2 ? this.entryIndex(root2.order, el) : -1;
            const entry = index >= 0 ? root2.order.entries[index] : null;
            this.dropEntry(el);
            // 元からあった項目は、すぐに「元に戻す」で戻せる
            if (entry && !entry.key) {
                toast('「' + short + '」を削除しました。', { action: { label: '元に戻す', onClick: () => this.restoreEntry(root2, entry, index, el) } });
            }
        }

        // 削除した項目を、元の位置に戻す（同じプレビューが開いたままのときだけ）
        restoreEntry(root, entry, index, el) {
            if (!this.ready || !root.el.isConnected || el.isConnected || root.order !== this.orders.get(root.id)) return;
            const entries = root.order.entries;
            if (entries.some((e) => !e.key && e.id === entry.id)) return;
            const at = Math.min(index, entries.length);
            const next = at < entries.length ? this.elementOf(entries[at]) : null;
            root.el.insertBefore(el, next && next.parentNode === root.el ? next : null);
            entries.splice(at, 0, entry);
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            this.app.changed(this);
            setTimeout(() => {
                this.updateItemBar();
                this.reposition();
            }, 30);
        }

        // 実績の写真が、ほかのページ（ホームの「これまでの仕事」など）でも使われているか → ページ名の一覧
        async otherPagesWithPhoto(item) {
            const img = this.itemImage(item);
            const repoPath = img && !this.newItemOf(item) ? this.repoPathOf(img) : null;
            if (!repoPath || !this.app.findImageUsages) return [];
            try {
                const list = await Promise.race([
                    this.app.findImageUsages(repoPath),
                    new Promise((resolve) => setTimeout(() => resolve(null), 5000))
                ]);
                return (list || []).filter((u) => u.pagePath !== this.path).map((u) => this.app.describePath(u.pagePath));
            } catch (err) {
                return [];
            }
        }

        dropEntry(el) {
            const root = this.rootOf(el);
            if (!root) return;
            const i = this.entryIndex(root.order, el);
            if (i < 0) return;
            const [entry] = root.order.entries.splice(i, 1);
            if (this.editing && el.contains(this.editing)) this.stopEditing();
            el.remove();
            if (entry.key) {
                const item = this.newItems.get(entry.key);
                this.newItems.delete(entry.key);
                if (item && item.imagePath) this.app.dropImage(item.imagePath);
            }
            if (this.barItem === el) this.setActiveItem(null);
            this.hoverItem = null;
            this.updateItemBar();
            this.hideImageChip(true);
            this.app.changed(this);
        }

        /* ---------- 実績（コレクション） ---------- */

        collectionCfg(rootId) {
            const c = this.collections.get(rootId);
            return c ? this.app.cfg.collections[c.type] : null;
        }

        itemImage(item) {
            const root = this.rootOf(item);
            const cfg = root && this.collectionCfg(root.id);
            return cfg ? item.querySelector(cfg.imageSelector) : null;
        }

        itemTitle(item) {
            const root = this.rootOf(item);
            const cfg = root && this.collectionCfg(root.id);
            return cfg ? item.querySelector(cfg.titleSelector) : null;
        }

        itemCategory(item, cfg) {
            const id = idOf(item);
            if (id !== null && this.categories.has(id)) return this.categories.get(id);
            const fresh = this.newItemOf(item);
            if (fresh && fresh.el === item) return fresh.category;
            return id !== null ? C.getAttr(this.doc.nodes[id], cfg.categoryAttr) : item.getAttribute(cfg.categoryAttr);
        }

        setActiveItem(item) {
            if (this.activeItem === item) return;
            if (this.activeItem) this.activeItem.classList.remove('cms-active');
            this.activeItem = item || null;
            if (this.activeItem) this.activeItem.classList.add('cms-active');
            this.updateItemBar();
        }

        updateItemBar() {
            if (!this.itemBar) return;
            const item = this.hoverItem || this.activeItem;
            const root = item && this.rootOf(item);
            const cfg = root && this.collectionCfg(root.id);
            if (!cfg) {
                this.barItem = null;
                this.itemBar.classList.remove('is-on');
                return;
            }
            if (this.barItem !== item) {
                this.barItem = item;
                const current = this.itemCategory(item, cfg);
                const d = this.fdoc;
                while (this.catSelect.firstChild) this.catSelect.removeChild(this.catSelect.firstChild);
                (cfg.categories || []).forEach((c) => this.catSelect.appendChild(h('option', { doc: d, value: c.value, text: c.label })));
                if (current && !(cfg.categories || []).some((c) => c.value === current)) {
                    this.catSelect.appendChild(h('option', { doc: d, value: current, text: current }));
                }
                this.catSelect.value = current || '';
                this.catValue.textContent = categoryLabel(cfg, current);
                this.itemBtns.photo.style.display = this.itemImage(item) ? '' : 'none';
            }
            const i = this.entryIndex(root.order, item);
            this.itemBtns.up.disabled = i <= 0;
            this.itemBtns.down.disabled = i >= root.order.entries.length - 1;
            this.place(this.itemBar, item, 'inside-top');
        }

        setCategory(item, value) {
            const root = this.rootOf(item);
            const cfg = root && this.collectionCfg(root.id);
            if (!cfg) return;
            const label = categoryLabel(cfg, value);
            const fresh = this.newItemOf(item);
            if (fresh && fresh.el === item) {
                fresh.category = value;
            } else {
                const id = idOf(item);
                const orig = C.getAttr(this.doc.nodes[id], cfg.categoryAttr);
                if (value === orig) this.categories.delete(id);
                else this.categories.set(id, value);
            }
            item.setAttribute(cfg.categoryAttr, value);
            const span = item.querySelector(cfg.categoryLabelSelector);
            if (span) span.textContent = label;
            this.catValue.textContent = label;
            this.app.changed(this);
            this.reposition();
        }

        // 実績を追加する: 同じ分類の先頭（なければ最後）に入れる
        addCollectionItem(rootId, data) {
            const order = this.orders.get(rootId);
            const cfg = this.collectionCfg(rootId);
            const rootEl = this.byId(rootId);
            if (!order || !cfg || !rootEl) return null;
            const key = 'n' + (++newKeySeq);
            const html = fillTemplate(cfg.template, {
                category: C.escapeAttr(data.category),
                image: C.escapeAttr(data.imageSrc),
                alt: C.escapeAttr(data.title),
                categoryLabel: C.escapeText(categoryLabel(cfg, data.category)),
                title: C.textToInlineHtml(data.title),
                desc: C.textToInlineHtml(data.desc)
            });
            // 値はすべて CMSCore でエスケープ済みなので、そのまま HTML として組み立てられる
            const tpl = this.fdoc.createElement('template');
            tpl.innerHTML = html;
            const el = tpl.content.firstElementChild;
            el.setAttribute('data-cms-item', '');
            el.setAttribute('data-cms-new', key);
            const titleEl = el.querySelector(cfg.titleSelector);
            const descEl = el.querySelector(cfg.descSelector);
            const img = el.querySelector(cfg.imageSelector);
            [titleEl, descEl].forEach((t) => t && t.setAttribute('data-cms-text', ''));
            if (descEl && !hasVisibleText(descEl)) descEl.setAttribute('data-cms-empty', EMPTY_LABEL);
            if (img) {
                img.setAttribute('data-cms-img', '');
                img.setAttribute('tabindex', '0');
                img.setAttribute('draggable', 'false');
                img.setAttribute('src', data.blobUrl);
                this.imgPaths.set(img, data.imagePath);
            }
            const at = order.entries.findIndex((e) => {
                const other = this.elementOf(e);
                return other && this.itemCategory(other, cfg) === data.category;
            });
            const before = at >= 0 ? this.elementOf(order.entries[at]) : null;
            rootEl.insertBefore(el, before);
            order.entries.splice(at >= 0 ? at : order.entries.length, 0, { key });
            this.newItems.set(key, {
                kind: 'collection', el, rootId, category: data.category,
                imagePath: data.imagePath, imageSrc: data.imageSrc, titleEl, descEl
            });
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el.classList.add('cms-flash');
            setTimeout(() => el.classList.remove('cms-flash'), 1300);
            this.app.changed(this);
            return el;
        }

        newItemHtml(key) {
            const item = this.newItems.get(key);
            if (!item) return null;
            if (item.kind === 'li') {
                if (!hasVisibleText(item.el)) return null;
                return item.openTag + C.serializeInline(item.el, this.lookup) + item.closeTag;
            }
            const cfg = this.collectionCfg(item.rootId);
            const title = item.titleEl ? C.serializeInline(item.titleEl, this.lookup) : '';
            const desc = item.descEl ? C.serializeInline(item.descEl, this.lookup) : '';
            return fillTemplate(cfg.template, {
                category: C.escapeAttr(item.category),
                image: C.escapeAttr(item.imageSrc),
                alt: C.escapeAttr(collapse(item.titleEl ? item.titleEl.textContent : '')),
                categoryLabel: C.escapeText(categoryLabel(cfg, item.category)),
                title,
                desc
            });
        }

        /* ---------- ページ設定（タイトル・説明文） ---------- */

        currentMeta() {
            return this.meta ? Object.assign({}, this.meta) : Object.assign({}, this.originalMeta);
        }

        setMeta(meta) {
            const clean = (s) => collapse(String(s || '').replace(/[\r\n]+/g, ' '));
            const next = { title: clean(meta.title), description: clean(meta.description) };
            const same = next.title === this.originalMeta.title && next.description === this.originalMeta.description;
            this.meta = same ? null : next;
            this.app.changed(this);
        }

        /* ---------- 変更のまとめ・公開用のソース ---------- */

        // 画面に出す件数と内訳
        summary() {
            if (this.editing) this.updateTextSilently(this.editing);
            let texts = 0;
            for (const id of this.textEdits.keys()) if (this.isAlive(id)) texts++;
            let added = 0;
            let removed = 0;
            let moved = 0;
            for (const o of this.orders.values()) {
                const ids = o.entries.filter((e) => !e.key).map((e) => e.id);
                added += o.entries.length - ids.length;
                removed += o.original.length - ids.length;
                const kept = o.original.filter((id) => ids.indexOf(id) >= 0);
                if (kept.some((id, k) => id !== ids[k])) moved++;
            }
            let categories = 0;
            for (const id of this.categories.keys()) if (this.isAlive(id)) categories++;
            // 写真の差し替えと説明（alt）の変更は、同じ写真なら1枚と数える
            const photoPaths = new Set(this.app.pendingImagesFrom(this.path));
            for (const id of this.alts.keys()) {
                const img = this.byId(id);
                if (img && !photoPaths.has(this.repoPathOf(img))) photoPaths.add('alt:' + id);
            }
            const photos = photoPaths.size;
            const meta = this.meta ? 1 : 0;
            return { texts, photos, added, removed, moved, categories, meta, total: texts + photos + added + removed + moved + categories + meta };
        }

        updateTextSilently(el) {
            const id = idOf(el);
            if (id === null) return;
            const html = C.serializeInline(el, this.lookup);
            if (html !== this.baseline.get(id)) this.textEdits.set(id, html);
            else this.textEdits.delete(id);
        }

        // 「文章2か所・写真1枚」のような短い説明
        describe(s) {
            const sum = s || this.summary();
            const parts = [];
            if (sum.texts) parts.push('文章' + sum.texts + 'か所');
            if (sum.photos) parts.push('写真' + sum.photos + '枚');
            if (sum.added) parts.push(sum.added + '件追加');
            if (sum.removed) parts.push(sum.removed + '件削除');
            if (sum.moved) parts.push('並べ替え');
            if (sum.categories) parts.push('分類' + sum.categories + '件');
            if (sum.meta) parts.push('タイトル・説明文');
            return parts;
        }

        hasChanges() {
            return this.summary().total > 0;
        }

        buildEdits() {
            if (this.editing) this.updateTextSilently(this.editing);
            const texts = {};
            const attrs = {};
            const lists = {};
            const attrOf = (id) => attrs[id] || (attrs[id] = {});
            for (const [id, html] of this.textEdits) if (this.isAlive(id)) texts[id] = html;
            for (const [id, alt] of this.alts) if (this.isAlive(id)) attrOf(id).alt = alt;
            for (const [id, value] of this.categories) {
                const item = this.byId(id);
                const root = item && this.rootOf(item);
                const cfg = root && this.collectionCfg(root.id);
                if (!cfg) continue;
                attrOf(id)[cfg.categoryAttr] = value;
                const span = C.select(this.doc, id, cfg.categoryLabelSelector)[0];
                if (span !== undefined) texts[span] = C.escapeText(categoryLabel(cfg, value));
            }
            for (const [rootId, o] of this.orders) {
                const entries = [];
                for (const e of o.entries) {
                    if (!e.key) entries.push({ id: e.id });
                    else {
                        const html = this.newItemHtml(e.key);
                        if (html) entries.push({ html });
                    }
                }
                const same = entries.length === o.original.length && entries.every((e, k) => e.id === o.original[k]);
                if (!same) lists[rootId] = entries;
            }
            const edits = {};
            if (Object.keys(texts).length) edits.texts = texts;
            if (Object.keys(attrs).length) edits.attrs = attrs;
            if (Object.keys(lists).length) edits.lists = lists;
            if (this.meta) edits.meta = this.meta;
            return edits;
        }

        // extraAttrs: { id: { name: value } }（差し替えた写真の src に付ける「?v=…」など）
        buildSource(extraAttrs) {
            const edits = this.buildEdits();
            if (extraAttrs && Object.keys(extraAttrs).length) {
                edits.attrs = edits.attrs || {};
                for (const id of Object.keys(extraAttrs)) edits.attrs[id] = Object.assign({}, edits.attrs[id], extraAttrs[id]);
            }
            return C.applyEdits(this.src, this.doc, edits);
        }
    }

    window.CMSEditor = { PageEditor, cleanOpenTag, fillTemplate, categoryLabel };
}());
