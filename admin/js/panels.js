/* ============================================================
   KUNI OFFICE 管理画面 — ダイアログ・パネル
   写真の差し替え・実績の追加・ページ設定・共通情報・公開の履歴・
   使い方・公開の確認と進み具合の画面です。
   ============================================================ */
(function () {
    'use strict';

    const C = window.CMSCore;
    const { h, icon, spinner, toast, modal, confirmDialog, formatJst } = window.CMSUI;
    const CMSImage = window.CMSImage;

    let seq = 0;
    const uid = (prefix) => prefix + '-' + (++seq);
    const charCount = (s) => Array.from(String(s || '')).length;
    const fileName = (path) => String(path || '').split('/').pop();

    /* ---------- 入力欄 ---------- */
    function field(labelText, control, opts) {
        const o = opts || {};
        if (!control.id) control.id = uid('field');
        const count = o.max || o.count ? h('span', { class: 'field__count', 'aria-live': 'polite' }) : null;
        const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
        const label = h('label', { class: 'field__label', for: control.id },
            h('span', null, labelText, o.required ? h('span', { class: 'field__req', text: '必須' }) : null), count);
        const el = h('div', { class: 'field' }, label, control, o.hint ? h('p', { class: 'field__hint', text: o.hint }) : null, error);
        const update = () => {
            if (!count) return;
            const n = charCount(control.value);
            count.textContent = o.max ? n + ' / ' + o.max : n + '文字';
            count.classList.toggle('is-over', !!o.max && n > o.max);
        };
        control.addEventListener('input', () => {
            update();
            if (!error.hidden) api.setError('');
        });
        update();
        const api = {
            el,
            control,
            setError(message) {
                error.textContent = message || '';
                error.hidden = !message;
                control.setAttribute('aria-invalid', message ? 'true' : 'false');
            }
        };
        return api;
    }

    function noteBox(kind, iconName, ...content) {
        return h('div', { class: 'note' + (kind ? ' note--' + kind : '') }, icon(iconName), h('div', null, ...content));
    }

    function loadingView(text) {
        return h('div', { class: 'empty' }, spinner('spin--lg'), h('p', { text }));
    }

    function errorView(text, retry) {
        return h('div', { class: 'empty' }, icon('alert'), h('p', { text }),
            retry ? h('button', { class: 'btn btn--secondary', type: 'button', text: 'もう一度読み込む', on: { click: retry } }) : null);
    }

    /* ---------- 写真を選ぶ部品（差し替え・実績の追加で共通） ---------- */
    function photoPicker(targetPath, onChange) {
        const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: uid('photo'), tabindex: '-1' });
        const box = h('div', { class: 'photo-slot__box photo-slot__box--empty dropzone' }, '写真がまだ選ばれていません');
        const info = h('p', { class: 'photo-slot__info' });
        const status = h('p', { class: 'status-line', role: 'status', hidden: true });
        const pick = h('label', { class: 'btn btn--dark', for: input.id, tabindex: '0', role: 'button' }, icon('image'), '写真を選ぶ');
        pick.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                input.click();
            }
        });
        const api = { input, box, info, status, pick, prepared: null, busy: false, kept: false };
        let ticket = 0;

        async function use(file) {
            if (!file) return;
            const mine = ++ticket;
            api.busy = true;
            status.hidden = false;
            status.className = 'status-line';
            status.replaceChildren(spinner(), h('span', { text: '写真を準備しています…' }));
            onChange();
            try {
                const prepared = await CMSImage.prepare(file, targetPath);
                if (mine !== ticket) {
                    URL.revokeObjectURL(prepared.blobUrl);
                    return;
                }
                discard();
                api.prepared = prepared;
                box.className = 'photo-slot__box dropzone';
                box.replaceChildren(h('img', { src: prepared.blobUrl, alt: '新しい写真' }));
                info.textContent = prepared.width + '×' + prepared.height + '・' + CMSImage.formatSize(prepared.size);
                status.hidden = true;
            } catch (err) {
                if (mine !== ticket) return;
                status.className = 'status-line';
                status.replaceChildren(h('span', { class: 'note note--error' }, icon('alert'),
                    h('span', { text: err && err.code ? err.message : CMSImage.MESSAGES.decode })));
            } finally {
                if (mine === ticket) {
                    api.busy = false;
                    onChange();
                }
            }
        }

        function discard() {
            if (api.prepared && !api.kept) URL.revokeObjectURL(api.prepared.blobUrl);
            api.prepared = null;
        }

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.value = ''; // 同じ写真を選び直しても反応するように
            use(file);
        });
        box.addEventListener('dragover', (e) => {
            e.preventDefault();
            box.classList.add('is-drag');
        });
        box.addEventListener('dragleave', () => box.classList.remove('is-drag'));
        box.addEventListener('drop', (e) => {
            e.preventDefault();
            box.classList.remove('is-drag');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            use(file);
        });
        api.use = use;
        api.discard = discard;
        return api;
    }

    function photoSlot(label, box, info) {
        return h('div', { class: 'photo-slot' }, h('span', { class: 'photo-slot__label', text: label }), box, info);
    }

    /* ---------- 写真を変更 ---------- */
    function imageDialog(app, o) {
        const picker = photoPicker(o.repoPath, () => refresh());
        const current = h('div', { class: 'photo-slot__box' }, h('img', { src: o.currentUrl, alt: 'いまの写真' }));
        const altField = o.altEditable
            ? field('写真の説明（alt）', h('input', { class: 'input', type: 'text', value: o.alt, maxlength: '150', autocomplete: 'off' }),
                { hint: '目の不自由な方の読み上げや、検索エンジンで使われます。' })
            : null;
        const usage = h('div', { hidden: true });
        // まだ公開していない差し替えがあれば、元の写真（サイトに出ている写真）に戻せる
        const pending = app.images.get(o.repoPath);
        const restoreBtn = pending && !pending.isNew
            ? h('button', { class: 'btn btn--secondary', type: 'button', on: { click: () => {
                app.dropImage(o.repoPath);
                m.close();
                toast('元の写真に戻しました。', { type: 'success' });
            } } }, icon('undo'), '元の写真に戻す')
            : null;

        const m = modal({
            title: '写真を変更',
            kicker: 'Photo',
            size: 'md',
            body: [
                h('div', { class: 'photo-compare' },
                    photoSlot('いまの写真', current, h('p', { class: 'photo-slot__info', text: fileName(o.repoPath) })),
                    h('span', { class: 'photo-compare__arrow' }, icon('down')),
                    photoSlot('新しい写真', picker.box, picker.info)),
                h('div', { class: 'photo-pick' }, picker.pick, picker.input, restoreBtn,
                    h('span', { class: 'photo-pick__hint', text: 'スマホで撮った写真もそのまま使えます（大きい写真は自動で小さくします）。' })),
                picker.status,
                usage,
                altField ? h('div', { style: { marginTop: '16px' } }, altField.el) : null
            ],
            actions: [
                { label: 'やめる' },
                { label: 'この写真にする', kind: 'primary', onClick: apply }
            ],
            isDirty: () => picker.busy || !!picker.prepared || !!(altField && altField.control.value.trim() !== o.alt),
            onClose: () => picker.discard()
        });
        const applyBtn = m.button(1);
        if (altField) altField.control.addEventListener('input', () => refresh());

        function refresh() {
            const altChanged = altField && altField.control.value.trim() !== o.alt;
            applyBtn.disabled = picker.busy || !(picker.prepared || altChanged);
        }

        function apply() {
            if (picker.busy) return false;
            const altChanged = altField && altField.control.value.trim() !== o.alt;
            if (picker.prepared) {
                picker.kept = true;
                app.setImage(o.repoPath, picker.prepared, o.editor.path, false);
            }
            if (altChanged) o.onAlt(altField.control.value.trim());
            toast(picker.prepared ? '写真を差し替えました。「公開する」でサイトに反映されます。' : '写真の説明を変更しました。', { type: 'success' });
            return undefined;
        }

        // ほかのページでも同じ写真を使っていれば知らせる
        app.findImageUsages(o.repoPath).then((list) => {
            const others = list.filter((u) => u.pagePath !== o.editor.path).map((u) => app.describePath(u.pagePath));
            if (!others.length || !m.isOpen()) return;
            usage.replaceChildren(noteBox('warn', 'alert', 'この写真は ' + others.join('・') + ' のページでも使われています。すべて差し替わります。'));
            usage.hidden = false;
        }).catch(() => { /* 確認できなくても差し替えはできる */ });

        refresh();
        if (o.file) picker.use(o.file);
    }

    /* ---------- 実績を追加 ---------- */
    function addWorkDialog(app, editor, rootId) {
        const cfg = editor.collectionCfg(rootId);
        const picker = photoPicker('work.jpg', () => refresh());
        const title = field('タイトル', h('input', { class: 'input', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: '例: 地域イベント撮影' }),
            { required: true, max: 40 });
        const category = field('分類', h('select', { class: 'select' },
            (cfg.categories || []).map((c) => h('option', { value: c.value, text: c.label }))));
        const desc = field('説明', h('textarea', { class: 'textarea', maxlength: '200', rows: '4', placeholder: '例: 標津町の祭りイベントの記録撮影。躍動感のある瞬間を捉えました。' }),
            { max: 200, hint: '改行もそのまま反映されます。' });
        const photoError = h('p', { class: 'field__error', role: 'alert', hidden: true });

        const m = modal({
            title: '実績を追加',
            kicker: 'Works',
            size: 'lg',
            body: [
                h('div', { class: 'form-grid' },
                    h('div', { class: 'field' },
                        h('span', { class: 'field__label' }, h('span', null, '写真', h('span', { class: 'field__req', text: '必須' }))),
                        picker.box, picker.info, picker.pick, picker.input, picker.status, photoError),
                    h('div', { class: 'form-grid__fields' }, title.el, category.el, desc.el)),
                h('div', { style: { marginTop: '18px' } },
                    noteBox('', 'info', '同じ分類の実績の先頭に追加されます。「公開する」を押すまでサイトには出ません。'))
            ],
            actions: [
                { label: 'やめる' },
                { label: '追加する', kind: 'primary', onClick: apply }
            ],
            isDirty: () => picker.busy || !!picker.prepared || !!title.control.value.trim() || !!desc.control.value.trim(),
            onClose: () => picker.discard()
        });
        const addBtn = m.button(1);

        function refresh() {
            addBtn.disabled = picker.busy;
            if (picker.prepared) photoError.hidden = true;
        }

        function apply() {
            const t = title.control.value.trim();
            const d = desc.control.value.replace(/\r\n?/g, '\n').trim();
            let ok = true;
            if (!picker.prepared) {
                photoError.textContent = '写真を選んでください';
                photoError.hidden = false;
                ok = false;
            }
            if (!t) {
                title.setError('タイトルを入力してください');
                ok = false;
            } else if (charCount(t) > 40) {
                title.setError('40文字以内で入力してください');
                ok = false;
            }
            if (charCount(d) > 200) {
                desc.setError('200文字以内で入力してください');
                ok = false;
            }
            if (!ok) return false;
            const place = app.newImagePath(editor.path, cfg.newImageDir);
            picker.kept = true;
            app.setImage(place.repoPath, picker.prepared, editor.path, true);
            editor.addCollectionItem(rootId, {
                category: category.control.value,
                title: t,
                desc: d,
                imageSrc: place.src,
                imagePath: place.repoPath,
                blobUrl: picker.prepared.blobUrl
            });
            toast('実績を追加しました。「公開する」でサイトに反映されます。', { type: 'success' });
            return undefined;
        }
        refresh();
    }

    /* ---------- ページ設定（タイトル・説明文） ---------- */
    function pageSettings(app, editor) {
        const meta = editor.currentMeta();
        const title = field('ページのタイトル（検索結果に出る）', h('input', { class: 'input', type: 'text', value: meta.title, maxlength: '120', autocomplete: 'off' }),
            { count: true, hint: '30文字前後がおすすめです。' });
        const descInput = h('textarea', { class: 'textarea', rows: '4', maxlength: '300' });
        descInput.value = meta.description;
        const desc = field('ページの説明文（検索結果に出る）', descInput, { count: true, hint: '120文字前後がおすすめです。改行は使えません。' });

        const serpTitle = h('p', { class: 'serp__title' });
        const serpDesc = h('p', { class: 'serp__desc' });
        const serp = h('div', { class: 'serp', 'aria-hidden': 'true' },
            h('p', { class: 'serp__label', text: '検索結果での見え方（目安）' }),
            h('p', { class: 'serp__url', text: app.cfg.siteUrl + editor.path }), serpTitle, serpDesc);
        const sync = () => {
            serpTitle.textContent = title.control.value || '（タイトルなし）';
            serpDesc.textContent = desc.control.value.replace(/[\r\n]+/g, ' ');
        };
        [title.control, desc.control].forEach((c) => c.addEventListener('input', sync));
        sync();

        modal({
            title: 'ページ設定',
            kicker: editor.page.label,
            size: 'md',
            isDirty: () => title.control.value !== meta.title || desc.control.value !== meta.description,
            body: [title.el, desc.el, serp],
            actions: [
                { label: 'やめる' },
                {
                    label: '変更する',
                    kind: 'primary',
                    onClick: () => {
                        if (!title.control.value.trim()) {
                            title.setError('タイトルを入力してください');
                            return false;
                        }
                        const before = editor.meta;
                        editor.setMeta({ title: title.control.value, description: desc.control.value });
                        if (editor.meta || before) {
                            toast(editor.meta ? 'タイトル・説明文を変更しました。「公開する」でサイトに反映されます。' : '元のタイトル・説明文に戻しました。', { type: 'success' });
                        }
                        return undefined;
                    }
                }
            ]
        });
    }

    /* ---------- 共通情報（電話・住所など） ---------- */
    const FORBIDDEN = /[<>"'\\`\r\n]/;
    // 電話番号・郵便番号: 全角の数字やハイフン（ー・－・‐ など）で入力しても、半角に直してから確かめる
    const NUMERIC_FIELD = /^(tel|fax|mobile|zip)$/;
    function cleanValue(key, raw) {
        const v = String(raw || '').trim();
        if (!NUMERIC_FIELD.test(key)) return v;
        return v.normalize('NFKC').replace(/[\u2010-\u2015\u2212\u30fc\uff70\ufe63\uff0d]/g, '-').replace(/\s+/g, '');
    }

    async function globalInfo(app) {
        const m = modal({
            title: '共通情報（電話・住所など）',
            kicker: 'Site info',
            size: 'md',
            body: loadingView('サイト内の内容を確認しています…'),
            actions: [{ label: '閉じる' }]
        });

        if (app.hasUnsaved()) {
            m.setBody(noteBox('warn', 'alert', 'まだ公開していないページの変更があります。共通情報を変えるときは、先に「公開する」でページの変更を公開するか、「元に戻す」で取り消してください。'));
            return;
        }

        let sources;
        let values;
        async function load() {
            m.setBody(loadingView('サイト内の内容を確認しています…'));
            m.setActions([{ label: '閉じる' }]);
            try {
                sources = await app.loadTextSources();
                values = app.readGlobalValues(sources);
            } catch (err) {
                if (app.handleAuthError(err)) {
                    m.close();
                    return;
                }
                m.setBody(errorView(app.errorMessage(err), load));
                return;
            }
            if (m.isOpen()) showForm();
        }

        const rows = new Map();

        function countIn(value) {
            if (!value) return { count: 0, files: 0 };
            let count = 0;
            let files = 0;
            for (const text of sources.values()) {
                const n = text.split(value).length - 1;
                count += n;
                if (n) files++;
            }
            return { count, files };
        }

        function showForm() {
            const list = app.cfg.globalFields.map((f) => {
                // 電話番号の欄も普通のキーボードにする（iPhone の電話用キーボードには「-」がない）
                const input = h('input', { class: 'input', type: f.key === 'email' ? 'email' : 'text', value: rows.has(f.key) ? rows.get(f.key).input.value : values[f.key], autocomplete: 'off' });
                input.id = uid('global');
                const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
                const where = countIn(values[f.key]);
                // いまの値がサイトに見つからない（読み取れなかった）ときは、古い値をもとに書き換えないように止める
                if (!where.count) {
                    input.value = values[f.key];
                    input.disabled = true;
                }
                const row = h('div', { class: 'global-row' },
                    h('label', { class: 'global-row__label', for: input.id, text: f.label }),
                    input,
                    h('span', { class: 'global-row__meta' + (where.count ? '' : ' is-zero'), text: where.count
                        ? 'サイト内 ' + where.count + 'か所（' + where.files + 'ファイル）'
                        : 'いまの値がサイト内に見つからないため、ここでは変更できません（ViFightにご連絡ください）' }),
                    error);
                input.addEventListener('input', () => {
                    input.classList.toggle('is-changed', cleanValue(f.key, input.value) !== values[f.key]);
                    error.hidden = true;
                    input.removeAttribute('aria-invalid');
                    refresh();
                });
                input.classList.toggle('is-changed', cleanValue(f.key, input.value) !== values[f.key]);
                rows.set(f.key, { field: f, input, error });
                return row;
            });
            m.setBody(
                h('p', { class: 'modal__text', text: 'サイト全体に書かれている電話番号や住所などを、まとめて書き換えます。いまと同じ文字の部分がすべて置き換わります。' }),
                h('div', { style: { marginTop: '14px' } }, list));
            m.setActions([
                { label: '閉じる' },
                { label: '変更を確認する', kind: 'primary', keepOpen: true, onClick: review }
            ]);
            refresh();
        }

        function changedRows() {
            return Array.from(rows.values()).filter((r) => !r.input.disabled && cleanValue(r.field.key, r.input.value) !== values[r.field.key]);
        }

        function refresh() {
            const btn = m.button(1);
            if (btn) btn.disabled = !changedRows().length;
        }

        function review() {
            const changed = changedRows();
            let ok = true;
            for (const r of changed) {
                const v = cleanValue(r.field.key, r.input.value);
                if (v !== r.input.value) r.input.value = v; // 半角に直した値を見せる
                let msg = '';
                if (!v) msg = '空にはできません';
                else if (FORBIDDEN.test(v)) msg = '使えない文字が含まれています（< > " \' \\ ` と改行）';
                else if (r.field.pattern && !new RegExp(r.field.pattern).test(v)) msg = '形式が正しくありません（例: ' + values[r.field.key] + '）';
                if (msg) {
                    r.error.textContent = msg;
                    r.error.hidden = false;
                    r.input.setAttribute('aria-invalid', 'true');
                    ok = false;
                }
            }
            if (!ok || !changed.length) return;
            const pairs = changed.map((r) => ({ from: values[r.field.key], to: cleanValue(r.field.key, r.input.value), key: r.field.key }));
            let plan;
            try {
                plan = C.planGlobalReplace(sources, pairs);
            } catch (err) {
                toast(err.message, { type: 'error' });
                return;
            }
            showPlan(changed, pairs, plan);
        }

        function showPlan(changed, pairs, plan) {
            const usable = [];
            const items = pairs.map((p, k) => {
                const hits = plan.counts.filter((c) => c.key === p.key);
                const total = hits.reduce((s, c) => s + c.count, 0);
                if (total) usable.push(changed[k].field);
                return h('div', { class: 'plan-row' },
                    h('span', { class: 'plan-row__label', text: changed[k].field.label }),
                    h('span', { class: 'plan-row__change' }, h('del', { text: p.from }), '　→　', h('ins', { text: p.to })),
                    h('span', { class: 'plan-row__count' + (total ? '' : ' is-zero'),
                        text: total ? changed[k].field.label + '：' + total + 'か所（' + hits.length + 'ファイル）' : 'サイト内に見つからないため、変更されません' }));
            });
            const files = Object.keys(plan.results);
            m.setBody(
                h('p', { class: 'modal__text', text: '次の内容で、サイト全体を書き換えて公開します。' }),
                h('div', { style: { margin: '12px 0 16px' } }, items),
                files.length
                    ? noteBox('', 'info', '変わるファイル: ' + app.describePaths(files).join('、'))
                    : noteBox('warn', 'alert', '書き換える場所が見つかりませんでした。'));
            m.setActions([
                { label: '戻る', keepOpen: true, onClick: showForm },
                {
                    label: '公開する',
                    kind: 'primary',
                    disabled: !files.length,
                    onClick: () => {
                        app.publishGlobal(plan, usable);
                    }
                }
            ]);
        }

        load();
    }

    /* ---------- 公開の履歴 ---------- */
    function historyPanel(app) {
        const m = modal({ title: '公開の履歴', kicker: 'History', size: 'lg', body: null, actions: [{ label: '閉じる' }] });
        const blocked = app.hasUnsaved();

        function skeletons() {
            return h('div', { 'aria-label': '読み込み中' }, Array.from({ length: 5 }, () => h('div', { class: 'history__skeleton' },
                h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' }))));
        }

        async function load() {
            m.setBody(skeletons());
            let commits;
            try {
                commits = await app.gh.listCommits(20);
            } catch (err) {
                if (app.handleAuthError(err)) {
                    m.close();
                    return;
                }
                m.setBody(errorView('履歴を読み込めませんでした。' + app.errorMessage(err), load));
                return;
            }
            if (!m.isOpen()) return;
            if (!commits.length) {
                m.setBody(h('div', { class: 'empty' }, icon('history'), h('p', { text: 'まだ公開の履歴はありません。' })));
                return;
            }
            m.setBody(
                blocked ? h('div', { style: { marginBottom: '14px' } }, noteBox('warn', 'alert', '先に公開するか、元に戻してください。まだ公開していない変更があるあいだは、取り消しはできません。')) : null,
                h('p', { class: 'modal__text', style: { marginBottom: '12px' }, text: '最近の20件です。取り消すと、その変更の前の状態に戻して公開します。管理画面で公開した変更だけを取り消せます（サイト管理者の更新は、ここでは取り消せません）。' }),
                h('ul', { class: 'history' }, commits.map((c, i) => row(c, i === 0))));
        }

        function row(c, latest) {
            const first = String(c.message || '').split('\n')[0] || '（説明なし）';
            let btn;
            if (c.parents && !c.parents.length) {
                // いちばん最初の状態には「その前」がないので取り消せない
                btn = h('span', { class: 'history__note', text: '最初の状態です' });
            } else if (!isEditorCommit(first)) {
                // サイト管理者（ViFight）の更新（管理画面そのもの・公開の仕組み・デザインなど）は、ここからは戻さない
                btn = h('span', { class: 'history__note', text: 'サイト管理者の更新', title: 'サイト管理者（ViFight）による更新は、ここでは取り消せません' });
            } else {
                btn = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', text: 'この変更を取り消す', disabled: blocked });
                if (blocked) btn.title = '先に公開するか、元に戻してください';
                btn.addEventListener('click', () => askRevert(c, first, btn));
            }
            return h('li', { class: 'history__row' },
                h('span', { class: 'history__time', text: formatJst(c.date) }),
                h('div', { class: 'history__msg' },
                    latest ? h('span', { class: 'history__tag', text: '最新' }) : null,
                    first,
                    c.author ? h('span', { class: 'history__by', text: c.author }) : null),
                btn);
        }

        async function askRevert(c, first, btn) {
            btn.disabled = true;
            btn.replaceChildren(spinner(), '確認中…');
            let preview;
            try {
                preview = await app.gh.revertPreview(c.sha);
            } catch (err) {
                if (app.handleAuthError(err)) {
                    m.close();
                    return;
                }
                toast(/first commit/.test(err.detail || '') ? 'いちばん最初の変更は取り消せません。' : app.errorMessage(err), { type: 'error' });
                return;
            } finally {
                btn.disabled = false;
                btn.replaceChildren('この変更を取り消す');
            }
            if (preview.protectedPaths && preview.protectedPaths.length) {
                toast(window.CMSGitHub.MESSAGES.protected, { type: 'error' });
                return;
            }
            if (preview.noop) {
                toast('この変更は、すでに元の状態に戻っています。');
                return;
            }
            const labels = app.describePaths(preview.files.map((f) => f.path));
            const later = app.describePaths(preview.laterEdited);
            const body = h('div', null,
                h('p', { class: 'modal__text', text: '「' + first + '」（' + formatJst(c.date) + '）を取り消して、その前の状態に戻して公開します。' }),
                h('p', { class: 'modal__text', text: '戻る内容: ' + labels.join('、') }),
                later.length ? h('div', { style: { marginTop: '14px' } },
                    noteBox('warn', 'alert', 'この後にも ' + later.join('・') + ' が更新されています。取り消すと、その更新も一緒に元に戻ります。')) : null);
            const ok = await confirmDialog({ title: 'この変更を取り消しますか？', message: body, ok: '取り消して公開する', danger: true });
            if (!ok) return;
            m.close();
            app.revert(c.sha);
        }

        load();
    }

    // 管理画面から公開した変更（「管理画面から更新:」「管理画面から取り消し:」）か
    function isEditorCommit(firstLine) {
        return /^管理画面から/.test(String(firstLine || ''));
    }

    /* ---------- 使い方 ---------- */
    function intro() {
        const step = (num, title, text) => h('li', null, h('span', { class: 'intro-steps__num', text: num }),
            h('div', null, h('h3', { text: title }), h('p', { text: text })));
        modal({
            title: '使い方',
            kicker: 'How to',
            size: 'md',
            body: [
                h('ol', { class: 'intro-steps' },
                    step('01', '文字をタップ → そのまま書き換え', '書き換えたい文字をタップ（クリック）すると、その場で入力できます。改行は Enter。終わったら、ほかの場所をタップします。'),
                    step('02', '写真をタップ → 写真を選ぶ', '写真をタップして「写真を変更」を押し、スマホやパソコンの写真を選びます。'),
                    step('03', '「公開する」で約1分後にサイトへ反映', '変更は「公開する」を押すまでサイトには出ません。押すと約1分で反映されます。')),
                h('ul', { class: 'intro-tips' },
                    h('li', { text: '赤い点線が出ない部分（価格など）は、ここでは変更できません。' }),
                    h('li', { text: '間違えたときは「元に戻す」。公開した後なら「≡ → 公開の履歴」から取り消せます。' }),
                    h('li', { text: '電話番号や住所は「≡ → 共通情報」でまとめて変えられます。' }),
                    h('li', { text: 'まだ公開していない変更は、ページを閉じたり読み込み直したりすると消えます（iPhone では確認が出ません）。終わったら「公開する」を押してください。' }))
            ],
            actions: [{ label: 'はじめる', kind: 'primary' }]
        });
    }

    /* ---------- 公開の確認 ---------- */
    function publishConfirm(app, plan) {
        return new Promise((resolve) => {
            const items = plan.pages.map((p) => h('li', null,
                h('span', { class: 'change-list__page', text: p.label }),
                h('span', { class: 'change-list__what', text: p.parts.join('・') })));
            modal({
                title: 'この内容で公開しますか？',
                kicker: 'Publish',
                size: 'sm',
                body: [
                    h('ul', { class: 'change-list' }, items),
                    h('p', { class: 'modal__text', text: '公開すると、約1分でサイトに反映されます。' })
                ],
                actions: [
                    { label: 'やめる', value: false },
                    { label: '公開する', kind: 'primary', value: true }
                ],
                onClose: (result) => resolve(result === true)
            });
        });
    }

    /* ---------- 公開の進み具合 ---------- */
    function progress(opts) {
        const o = opts || {};
        const makeStep = (num, label) => {
            const mark = h('span', { class: 'step__mark', text: num });
            const text = h('span', { text: label });
            const el = h('li', { class: 'step' }, mark, text);
            return { el, mark, text, num };
        };
        const steps = {
            save: makeStep('1', o.saving || '保存しています…'),
            deploy: makeStep('2', 'サイトに反映しています…（約1分）')
        };
        const m = modal({
            title: o.title || '公開しています',
            kicker: 'Publish',
            size: 'sm',
            dismissible: false,
            body: h('ol', { class: 'steps' }, steps.save.el, steps.deploy.el),
            actions: []
        });
        return {
            modal: m,
            step(key, state, label) {
                const s = steps[key];
                s.el.className = 'step' + (state ? ' is-' + state : '');
                if (label) s.text.textContent = label;
                s.mark.replaceChildren(state === 'active' ? spinner() : state === 'done' ? icon('check') : state === 'error' ? icon('alert') : s.num);
            },
            allowClose() {
                m.setDismissible(true);
                m.setActions([{ label: '閉じる（反映は裏で続きます）' }]);
            },
            // type: success | failure | unknown | error | conflict
            result(type, title, text, actions) {
                if (!m.isOpen()) return;
                m.setDismissible(true);
                m.setTitle(o.doneTitle || '公開');
                const iconName = type === 'success' ? 'check' : type === 'unknown' ? 'info' : 'alert';
                m.setBody(h('div', { class: 'result result--' + type, role: type === 'success' ? 'status' : 'alert' },
                    h('span', { class: 'result__icon' }, icon(iconName)),
                    h('p', { class: 'result__title', text: title }),
                    text ? h('p', { class: 'result__text', text }) : null));
                m.setActions(actions || [{ label: '閉じる', kind: 'primary' }]);
            },
            isOpen: () => m.isOpen(),
            close: () => m.close()
        };
    }

    window.CMSPanels = { imageDialog, addWorkDialog, pageSettings, globalInfo, history: historyPanel, intro, publishConfirm, progress, field, isEditorCommit, cleanValue };
}());
